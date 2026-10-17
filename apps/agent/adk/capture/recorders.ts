import { db, IntakeSourceType } from "@crm/db";
import { type CaptureMessage, captureConversation } from "@crm/db/capture";
import { openSecret } from "@crm/db/secret-box";
import { SETTINGS_ID } from "@crm/db/settings";
import { z } from "zod";
import { RECORDERS } from "./recorders-config";

export type RecorderMeeting = {
	provider: "fireflies" | "fathom";
	id: string;
	title: string;
	startedAt: Date;
	host: string | null;
	messages: CaptureMessage[];
};

export type RecorderSyncReport = {
	checked: number;
	captured: string[];
	errors: string[];
};

const firefliesResponse = z.object({
	data: z
		.object({
			transcripts: z
				.array(
					z.object({
						id: z.string(),
						title: z.string().nullable().catch(null),
						date: z.number().nullable().catch(null),
						host_email: z.string().nullable().optional().catch(null),
						organizer_email: z.string().nullable().optional().catch(null),
						sentences: z
							.array(
								z.object({
									speaker_name: z.string().nullable().catch(null),
									text: z.string().nullable().catch(null),
									start_time: z.number().nullable().catch(null),
								}),
							)
							.nullable()
							.catch(null),
					}),
				)
				.nullable()
				.catch(null),
		})
		.nullable()
		.catch(null),
	errors: z.array(z.object({ message: z.string() })).optional(),
});

const fathomResponse = z.object({
	items: z
		.array(
			z.object({
				recording_id: z.union([z.number(), z.string()]).transform(String),
				title: z.string().nullable().optional().catch(null),
				meeting_title: z.string().nullable().optional().catch(null),
				created_at: z.string(),
				recording_start_time: z.string().nullable().optional().catch(null),
				recorded_by: z
					.object({
						name: z.string().nullable().optional(),
						email: z.string().nullable().optional(),
					})
					.nullable()
					.optional()
					.catch(null),
				transcript: z
					.array(
						z.object({
							speaker: z
								.object({ display_name: z.string().nullable().optional() })
								.nullable()
								.optional(),
							text: z.string().nullable().optional(),
							timestamp: z.string().nullable().optional(),
						}),
					)
					.nullable()
					.optional()
					.catch(null),
			}),
		)
		.catch([]),
	next_cursor: z.string().nullable().optional(),
});

const FIREFLIES_QUERY = `query Recent($fromDate: DateTime, $limit: Int) {
  transcripts(fromDate: $fromDate, limit: $limit) {
    id title date host_email organizer_email
    sentences { speaker_name text start_time }
  }
}`;

function offsetSeconds(clock: string | null | undefined): number {
	if (!clock) return 0;
	return clock
		.split(":")
		.map(Number)
		.reduce(
			(total, part) => total * 60 + (Number.isFinite(part) ? part : 0),
			0,
		);
}

export async function fetchFireflies(
	apiKey: string,
	since: Date,
): Promise<RecorderMeeting[]> {
	const response = await fetch(RECORDERS.fireflies.url, {
		method: "POST",
		headers: {
			authorization: `Bearer ${apiKey}`,
			"content-type": "application/json",
		},
		body: JSON.stringify({
			query: FIREFLIES_QUERY,
			variables: {
				fromDate: since.toISOString(),
				limit: RECORDERS.maxMeetingsPerRun,
			},
		}),
		signal: AbortSignal.timeout(RECORDERS.requestTimeoutMs),
	});
	const body = firefliesResponse.parse(await response.json());
	if (!response.ok || body.errors?.length) {
		throw new Error(
			`Fireflies: ${body.errors?.[0]?.message ?? `HTTP ${response.status}`}`,
		);
	}
	return (body.data?.transcripts ?? []).map((meeting) => {
		const startedAt = new Date(meeting.date ?? Date.now());
		return {
			provider: "fireflies",
			id: meeting.id,
			title: meeting.title ?? "Fireflies meeting",
			startedAt,
			host: meeting.host_email ?? meeting.organizer_email ?? null,
			messages: (meeting.sentences ?? []).map((sentence, index) => ({
				lineNo: index + 1,
				timestamp: new Date(
					startedAt.getTime() + (sentence.start_time ?? 0) * 1000,
				),
				sender: sentence.speaker_name?.trim() || "Speaker",
				text: sentence.text ?? "",
			})),
		};
	});
}

export async function fetchFathom(
	apiKey: string,
	since: Date,
): Promise<RecorderMeeting[]> {
	const url = new URL(RECORDERS.fathom.url);
	url.searchParams.set("include_transcript", "true");
	url.searchParams.set("created_after", since.toISOString());
	const response = await fetch(url, {
		headers: { "x-api-key": apiKey },
		signal: AbortSignal.timeout(RECORDERS.requestTimeoutMs),
	});
	if (!response.ok) throw new Error(`Fathom: HTTP ${response.status}`);
	const body = fathomResponse.parse(await response.json());
	return body.items.slice(0, RECORDERS.maxMeetingsPerRun).map((meeting) => {
		const startedAt = new Date(
			meeting.recording_start_time ?? meeting.created_at,
		);
		return {
			provider: "fathom",
			id: meeting.recording_id,
			title: meeting.meeting_title ?? meeting.title ?? "Fathom meeting",
			startedAt,
			host: meeting.recorded_by?.name ?? meeting.recorded_by?.email ?? null,
			messages: (meeting.transcript ?? []).map((entry, index) => ({
				lineNo: index + 1,
				timestamp: new Date(
					startedAt.getTime() + offsetSeconds(entry.timestamp) * 1000,
				),
				sender: entry.speaker?.display_name?.trim() || "Speaker",
				text: entry.text ?? "",
			})),
		};
	});
}

export async function memberSpeaker(
	speakers: string[],
	host: string | null,
): Promise<string | null> {
	const members = await db.user.findMany({
		select: { name: true, email: true },
	});
	const names = new Set(
		members.flatMap((member) =>
			[member.name, member.email].map((value) => value?.trim().toLowerCase()),
		),
	);
	const match = speakers.find((speaker) => names.has(speaker.toLowerCase()));
	return match ?? host;
}

export async function captureRecorderMeetings(
	manual: boolean,
): Promise<
	RecorderSyncReport & { jobs: { jobId: string; me: string | null }[] }
> {
	const settings = await db.appSetting.findUnique({
		where: { id: SETTINGS_ID },
		select: {
			firefliesApiKey: true,
			fathomApiKey: true,
			recordersSyncedAt: true,
		},
	});
	const startedAt = new Date();
	if (
		!manual &&
		settings?.recordersSyncedAt &&
		startedAt.getTime() - settings.recordersSyncedAt.getTime() <
			RECORDERS.minIntervalMs
	) {
		return { checked: 0, captured: [], errors: [], jobs: [] };
	}
	const since = settings?.recordersSyncedAt
		? new Date(settings.recordersSyncedAt.getTime() - RECORDERS.overlapMs)
		: new Date(startedAt.getTime() - RECORDERS.firstLookbackMs);

	const sources = [
		{ key: settings?.firefliesApiKey, fetch: fetchFireflies },
		{ key: settings?.fathomApiKey, fetch: fetchFathom },
	];

	const report = {
		checked: 0,
		captured: [] as string[],
		errors: [] as string[],
		jobs: [] as { jobId: string; me: string | null }[],
	};

	for (const source of sources) {
		const apiKey = source.key ? openSecret(source.key) : null;
		if (!apiKey) continue;
		let meetings: RecorderMeeting[];
		try {
			meetings = await source.fetch(apiKey, since);
		} catch (error) {
			report.errors.push(
				error instanceof Error ? error.message : String(error),
			);
			continue;
		}
		for (const meeting of meetings) {
			report.checked += 1;
			const speakers = [...new Set(meeting.messages.map((m) => m.sender))];
			if (speakers.length < RECORDERS.minSpeakers) continue;
			const captured = await captureConversation(db, {
				sourceType: IntakeSourceType.MEETING_TRANSCRIPT,
				externalId: `${meeting.provider}:${meeting.id}`,
				sourceUri: `${meeting.provider}://meeting/${meeting.id}`,
				title: meeting.title,
				messages: meeting.messages,
			});
			if (!captured.queued) continue;
			report.captured.push(meeting.title);
			report.jobs.push({
				jobId: captured.jobId,
				me: await memberSpeaker(speakers, meeting.host),
			});
		}
	}

	await db.appSetting.upsert({
		where: { id: SETTINGS_ID },
		create: { id: SETTINGS_ID, recordersSyncedAt: startedAt },
		update: { recordersSyncedAt: startedAt },
	});

	return report;
}

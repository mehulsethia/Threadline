import { type Db, IntakeSourceType } from "@crm/db";
import { captureConversation } from "@crm/db/capture";
import { Inject, Injectable, Logger } from "@nestjs/common";
import { z } from "zod";
import { AgentTriggerService } from "../agent/agent-trigger.service";
import { CAPTURE } from "../capture/capture-config";
import { InjectDatabase } from "../database/database.constants";
import { MailboxApiClient } from "../mailbox/mailbox-api.client";

const conferenceList = z.object({
	conferenceRecords: z
		.array(
			z.object({
				name: z.string(),
				startTime: z.string().optional(),
				endTime: z.string().optional(),
			}),
		)
		.optional(),
});

const transcriptList = z.object({
	transcripts: z
		.array(z.object({ name: z.string(), state: z.string().optional() }))
		.optional(),
});

const entryList = z.object({
	transcriptEntries: z
		.array(
			z.object({
				participant: z.string().optional(),
				text: z.string().optional(),
				startTime: z.string().optional(),
			}),
		)
		.optional(),
	nextPageToken: z.string().optional(),
});

const participantInfo = z.object({
	signedinUser: z.object({ displayName: z.string().optional() }).optional(),
	anonymousUser: z.object({ displayName: z.string().optional() }).optional(),
	phoneUser: z.object({ displayName: z.string().optional() }).optional(),
});

export function isWorkspaceAccount(email: string | null | undefined): boolean {
	const domain = email?.split("@")[1]?.toLowerCase();
	return Boolean(
		domain &&
			!(CAPTURE.meet.consumerDomains as readonly string[]).includes(domain),
	);
}

@Injectable()
export class MeetTranscriptService {
	private readonly logger = new Logger(MeetTranscriptService.name);

	constructor(
		@InjectDatabase() private readonly db: Db,
		private readonly api: MailboxApiClient,
		@Inject(AgentTriggerService) private readonly agent: AgentTriggerService,
	) {}

	async capture(userId: string, accessToken: string): Promise<number> {
		const user = await this.db.user.findUnique({
			where: { id: userId },
			select: { email: true, name: true },
		});
		if (!isWorkspaceAccount(user?.email)) return 0;

		const since = new Date(Date.now() - CAPTURE.meet.lookbackMs).toISOString();
		const records = await this.api.get<unknown>(
			`${CAPTURE.meet.apiUrl}/conferenceRecords`,
			accessToken,
			{
				filter: `start_time>="${since}"`,
				pageSize: CAPTURE.meet.maxConferences,
			},
		);
		if (records.outcome !== "ok") return 0;

		let queued = 0;
		for (const record of conferenceList.parse(records.data).conferenceRecords ??
			[]) {
			if (!record.endTime) continue;
			const transcripts = await this.api.get<unknown>(
				`${CAPTURE.meet.apiUrl}/${record.name}/transcripts`,
				accessToken,
			);
			if (transcripts.outcome !== "ok") continue;
			for (const transcript of transcriptList.parse(transcripts.data)
				.transcripts ?? []) {
				if (transcript.state && transcript.state !== "FILE_GENERATED") continue;
				const added = await this.captureTranscript(
					transcript.name,
					record.startTime,
					accessToken,
					userId,
					user?.name ?? null,
				);
				if (added) queued += 1;
			}
		}
		return queued;
	}

	private async captureTranscript(
		name: string,
		startTime: string | undefined,
		accessToken: string,
		userId: string,
		me: string | null,
	): Promise<boolean> {
		const entries: z.infer<typeof entryList>["transcriptEntries"] = [];
		let pageToken: string | undefined;
		do {
			const page = await this.api.get<unknown>(
				`${CAPTURE.meet.apiUrl}/${name}/entries`,
				accessToken,
				{ pageSize: 100, pageToken },
			);
			if (page.outcome !== "ok") break;
			const parsed = entryList.parse(page.data);
			entries.push(...(parsed.transcriptEntries ?? []));
			pageToken = parsed.nextPageToken;
		} while (pageToken && entries.length < CAPTURE.meet.maxEntries);

		const names = new Map<string, string>();
		for (const participant of new Set(entries.map((e) => e.participant))) {
			if (!participant) continue;
			const info = await this.api.get<unknown>(
				`${CAPTURE.meet.apiUrl}/${participant}`,
				accessToken,
			);
			const parsed =
				info.outcome === "ok" ? participantInfo.safeParse(info.data) : null;
			const person = parsed?.success ? parsed.data : undefined;
			names.set(
				participant,
				person?.signedinUser?.displayName ??
					person?.anonymousUser?.displayName ??
					person?.phoneUser?.displayName ??
					"Participant",
			);
		}

		const captured = await captureConversation(this.db, {
			sourceType: IntakeSourceType.MEETING_TRANSCRIPT,
			externalId: `meet:${name}`,
			sourceUri: `meet://${name}`,
			title: `Google Meet on ${startTime?.slice(0, 10) ?? "a recent day"}`,
			userId,
			messages: entries.map((entry, index) => ({
				lineNo: index + 1,
				timestamp: new Date(entry.startTime ?? startTime ?? Date.now()),
				sender: names.get(entry.participant ?? "") ?? "Participant",
				text: entry.text ?? "",
			})),
		});
		if (!captured.queued) return false;
		const queued = await this.agent.queueIntake(captured.jobId, {
			jobId: captured.jobId,
			me,
		});
		if (queued) this.agent.poke();
		return true;
	}

	async safeCapture(userId: string, accessToken: string): Promise<void> {
		try {
			const queued = await this.capture(userId, accessToken);
			if (queued > 0) {
				this.logger.log({ message: "Meet transcripts queued", userId, queued });
			}
		} catch (error) {
			this.logger.warn({
				message: "Meet transcript capture failed",
				userId,
				error: error instanceof Error ? error.message : String(error),
			});
		}
	}
}

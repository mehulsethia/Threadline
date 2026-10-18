import { createHash } from "node:crypto";
import type { Db } from "./client";
import type { Prisma } from "./generated/prisma/client";
import { IntakeJobStatus, IntakeSourceType } from "./generated/prisma/enums";

export type CaptureMessage = {
	lineNo: number;
	timestamp: Date;
	sender: string;
	text: string;
};

export type CaptureInput = {
	sourceType:
		| typeof IntakeSourceType.EMAIL_THREAD
		| typeof IntakeSourceType.SLACK_THREAD
		| typeof IntakeSourceType.MEETING_TRANSCRIPT
		| typeof IntakeSourceType.FORM_SUBMISSION;
	externalId: string;
	sourceUri: string;
	title: string;
	messages: CaptureMessage[];
	userId?: string | null;
};

export type CaptureResult =
	| { queued: true; jobId: string }
	| { queued: false; jobId: string | null; reason: string };

export const CAPTURE_LIMITS = {
	minMessages: 1,
	maxMessages: 400,
	minCharacters: 40,
} as const;

function hashOf(messages: CaptureMessage[]): string {
	const hash = createHash("sha256");
	for (const message of messages) {
		hash.update(
			`${message.timestamp.toISOString()}|${message.sender}|${message.text}\n`,
		);
	}
	return hash.digest("hex");
}

export async function captureConversation(
	db: Db,
	input: CaptureInput,
): Promise<CaptureResult> {
	const messages = input.messages
		.filter((message) => message.text.trim())
		.slice(-CAPTURE_LIMITS.maxMessages)
		.map((message, index) => ({ ...message, lineNo: index + 1 }));
	const characters = messages.reduce((sum, m) => sum + m.text.length, 0);
	if (
		messages.length < CAPTURE_LIMITS.minMessages ||
		characters < CAPTURE_LIMITS.minCharacters
	) {
		return { queued: false, jobId: null, reason: "Too little text." };
	}

	const contentHash = hashOf(messages);
	const transcript = messages.map((message) => ({
		...message,
		timestamp: message.timestamp.toISOString(),
	})) satisfies Prisma.InputJsonValue;

	const existing = await db.intakeJob.findUnique({
		where: { externalId: input.externalId },
		select: { id: true, contentHash: true, status: true },
	});
	if (existing?.contentHash === contentHash) {
		return { queued: false, jobId: existing.id, reason: "Unchanged." };
	}

	const job = await db.intakeJob.upsert({
		where: { externalId: input.externalId },
		create: {
			externalId: input.externalId,
			sourceType: input.sourceType,
			fileUrl: input.sourceUri,
			title: input.title,
			transcript,
			contentHash,
			userId: input.userId ?? null,
			status: IntakeJobStatus.QUEUED,
		},
		update: {
			title: input.title,
			transcript,
			contentHash,
			status: IntakeJobStatus.QUEUED,
			error: null,
		},
		select: { id: true },
	});

	return { queued: true, jobId: job.id };
}

export const TEXT_CAPTURE_SOURCES: readonly IntakeSourceType[] = [
	IntakeSourceType.EMAIL_THREAD,
	IntakeSourceType.SLACK_THREAD,
	IntakeSourceType.MEETING_TRANSCRIPT,
	IntakeSourceType.FORM_SUBMISSION,
];

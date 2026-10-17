import {
	docxText,
	parseTranscriptText,
} from "@crm/validation/transcript-parser";
import { z } from "zod";

const intakeEventData = z
	.looseObject({
		tool: z.string().optional().catch(undefined),
		message: z.string().optional().catch(undefined),
	})
	.catch({});

import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Db } from "@crm/db";
import { IntakeJobStatus, IntakeSourceType } from "@crm/db";
import { blobEnabled, downloadFile, uploadFile } from "@crm/db/blob";
import { consumeDemoQuota } from "@crm/db/demo";
import { detectParticipants, parseWhatsAppExport } from "@crm/validation";
import {
	BadRequestException,
	Injectable,
	Logger,
	NotFoundException,
} from "@nestjs/common";
import { AgentTriggerService } from "../agent/agent-trigger.service";
import { InjectDatabase } from "../database/database.constants";
import type {
	IntakePreviewInput,
	IntakePreviewOutput,
	IntakeStartInput,
	IntakeStartOutput,
	IntakeStatusOutput,
} from "./intake.contracts";

const ALLOWED_EXTENSIONS = [".zip", ".txt", ".opus", ".m4a", ".mp3", ".wav"];
const TRANSCRIPT_EXTENSIONS = [".txt", ".md", ".pdf", ".docx"];

async function readFileBytes(fileUrl: string): Promise<Buffer> {
	if (existsSync(fileUrl)) {
		return readFileSync(fileUrl);
	}

	if (fileUrl.startsWith("http://") || fileUrl.startsWith("https://")) {
		try {
			const res = await fetch(fileUrl);
			if (res.ok) {
				const arrayBuf = await res.arrayBuffer();
				return Buffer.from(arrayBuf);
			}
		} catch {}
	}

	let destination = fileUrl;
	if (fileUrl.includes("googleapis.com/")) {
		try {
			const url = new URL(fileUrl);
			const parts = url.pathname.split("/").filter(Boolean);
			destination = parts.slice(1).join("/");
		} catch {}
	}

	return await downloadFile(destination);
}

export type UploadedFileRecord = {
	buffer: Buffer;
	originalname: string;
	mimetype: string;
	size?: number;
};

@Injectable()
export class IntakeService {
	private readonly logger = new Logger(IntakeService.name);

	constructor(
		@InjectDatabase() private readonly db: Db,
		private readonly agentTrigger: AgentTriggerService,
	) {}

	/** One import against the judge account's daily cap. */
	consumeImportQuota(userId: string): Promise<boolean> {
		return consumeDemoQuota(this.db, userId, "intake");
	}

	async uploadAndCreateJob(
		file: UploadedFileRecord,
		options?: {
			me?: string;
			autoStart?: boolean;
			userId?: string | null;
			kind?: "conversation" | "transcript";
		},
	): Promise<{
		jobId: string;
		status: IntakeJobStatus;
		sourceType: IntakeSourceType;
		fileUrl: string;
	}> {
		const originalName = file.originalname || "upload.txt";
		const dotIndex = originalName.lastIndexOf(".");
		const ext =
			dotIndex !== -1 ? originalName.slice(dotIndex).toLowerCase() : "";

		const transcript = options?.kind === "transcript";
		const allowed = transcript ? TRANSCRIPT_EXTENSIONS : ALLOWED_EXTENSIONS;
		if (!allowed.includes(ext)) {
			throw new BadRequestException(
				`Unsupported file extension "${ext}". Allowed extensions: ${allowed.join(", ")}`,
			);
		}

		const sourceType = transcript
			? IntakeSourceType.MEETING_TRANSCRIPT
			: ext === ".zip" || ext === ".txt"
				? IntakeSourceType.WHATSAPP_EXPORT
				: IntakeSourceType.VOICE_NOTE;

		let fileUrl: string;
		if (blobEnabled()) {
			const destination = `intake/${randomUUID()}-${originalName}`;
			fileUrl = await uploadFile(destination, file.buffer, file.mimetype);
		} else {
			const dir = join(process.cwd(), "uploads", "intake");
			if (!existsSync(dir)) {
				mkdirSync(dir, { recursive: true });
			}
			const localPath = join(dir, `${randomUUID()}-${originalName}`);
			writeFileSync(localPath, file.buffer);
			fileUrl = localPath;
		}

		const job = await this.db.intakeJob.create({
			data: {
				userId: options?.userId ?? null,
				sourceType,
				fileUrl,
				title: transcript ? originalName : null,
				status: IntakeJobStatus.QUEUED,
			},
		});

		if (options?.autoStart !== false) {
			await this.agentTrigger.queueIntake(
				job.id,
				{ jobId: job.id, me: options?.me ?? null },
				true,
			);
			this.agentTrigger.poke();
		}

		this.logger.log({
			message: "Intake job created",
			jobId: job.id,
			sourceType,
			autoStart: options?.autoStart !== false,
		});

		return {
			jobId: job.id,
			status: job.status,
			sourceType: job.sourceType,
			fileUrl,
		};
	}

	async previewParticipants(
		input: IntakePreviewInput,
	): Promise<IntakePreviewOutput> {
		let targetUrl = input.fileUrl;
		let transcriptJob = false;
		if (input.jobId) {
			const job = await this.db.intakeJob.findUnique({
				where: { id: input.jobId },
			});
			if (!job) {
				throw new NotFoundException(`Intake job ${input.jobId} not found.`);
			}
			targetUrl = job.fileUrl;
			transcriptJob = job.sourceType === IntakeSourceType.MEETING_TRANSCRIPT;
		}

		if (!targetUrl) {
			throw new BadRequestException(
				"Either jobId or fileUrl must be provided.",
			);
		}

		try {
			const bytes = await readFileBytes(targetUrl);
			if (transcriptJob) {
				const path = targetUrl.split("?")[0]?.toLowerCase() ?? "";
				const text = path.endsWith(".pdf")
					? ""
					: path.endsWith(".docx")
						? docxText(bytes)
						: bytes.toString("utf8");
				const turns = parseTranscriptText(text);
				const detected = detectParticipants(turns.speakers, turns.turns);
				return {
					participants: turns.speakers,
					me: detected.me,
					lead: detected.lead,
					confidence: detected.confidence,
					autoDetected: detected.autoDetected,
					messageCount: turns.turns.length,
				};
			}
			const parsed = parseWhatsAppExport(bytes);
			const detected = detectParticipants(parsed.participants, parsed.messages);
			return {
				participants: parsed.participants,
				me: detected.me,
				lead: detected.lead,
				confidence: detected.confidence,
				autoDetected: detected.autoDetected,
				messageCount: parsed.messages.length,
			};
		} catch {
			return {
				participants: [],
				me: "Business",
				lead: "Lead",
				confidence: 0.5,
				autoDetected: false,
				messageCount: 0,
			};
		}
	}

	async start(input: IntakeStartInput): Promise<IntakeStartOutput> {
		const job = await this.db.intakeJob.findUnique({
			where: { id: input.jobId },
		});
		if (!job) {
			throw new NotFoundException(`Intake job ${input.jobId} not found.`);
		}

		if (job.status === IntakeJobStatus.FAILED) {
			await this.db.intakeJob.update({
				where: { id: input.jobId },
				data: { status: IntakeJobStatus.QUEUED, error: null },
			});
		}

		await this.agentTrigger.queueIntake(
			input.jobId,
			{ jobId: input.jobId, me: input.me ?? null },
			true,
		);
		this.agentTrigger.poke();

		return {
			jobId: input.jobId,
			status: IntakeJobStatus.QUEUED,
			queued: true,
		};
	}

	async status(jobId: string): Promise<IntakeStatusOutput> {
		const job = await this.db.intakeJob.findUnique({
			where: { id: jobId },
		});
		if (!job) {
			throw new NotFoundException(`Intake job ${jobId} not found.`);
		}

		const events = await this.db.agentEvent.findMany({
			where: { sessionId: jobId },
			orderBy: { emittedAt: "asc" },
		});

		const timeline = events.map((event) => {
			const data = intakeEventData.parse(event.data);
			return {
				id: event.id,
				tool: data.tool || event.type,
				message: data.message || "",
				timestamp: event.emittedAt,
				data,
			};
		});

		return {
			id: job.id,
			status: job.status,
			sourceType: job.sourceType,
			fileUrl: job.fileUrl,
			summary: job.summary,
			error: job.error,
			createdContactIds: job.createdContactIds,
			createdDealIds: job.createdDealIds,
			createdAt: job.createdAt,
			updatedAt: job.updatedAt,
			timeline,
		};
	}
}

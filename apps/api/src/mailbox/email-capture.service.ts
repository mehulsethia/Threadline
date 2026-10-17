import { type Db, IntakeSourceType } from "@crm/db";
import { captureConversation } from "@crm/db/capture";
import { Inject, Injectable, Logger } from "@nestjs/common";
import { AgentTriggerService } from "../agent/agent-trigger.service";
import { CAPTURE } from "../capture/capture-config";
import { InjectDatabase } from "../database/database.constants";

@Injectable()
export class EmailCaptureService {
	private readonly logger = new Logger(EmailCaptureService.name);

	constructor(
		@InjectDatabase() private readonly db: Db,
		@Inject(AgentTriggerService) private readonly agent: AgentTriggerService,
	) {}

	async captureThread(threadId: string, userId: string): Promise<void> {
		try {
			const thread = await this.db.emailThread.findUnique({
				where: { id: threadId },
				select: {
					id: true,
					subject: true,
					contactId: true,
					lastMessageAt: true,
					messages: {
						orderBy: { sentAt: "asc" },
						take: CAPTURE.email.maxMessages,
						select: {
							fromName: true,
							fromEmail: true,
							body: true,
							snippet: true,
							sentAt: true,
						},
					},
				},
			});
			if (!thread?.contactId) return;
			if (Date.now() - thread.lastMessageAt.getTime() > CAPTURE.email.maxAgeMs)
				return;

			const owner = await this.db.user.findUnique({
				where: { id: userId },
				select: { name: true, email: true },
			});

			const captured = await captureConversation(this.db, {
				sourceType: IntakeSourceType.EMAIL_THREAD,
				externalId: `email:${thread.id}`,
				sourceUri: `email://thread/${thread.id}`,
				title: thread.subject ?? "Email thread",
				userId,
				messages: thread.messages.map((message, index) => ({
					lineNo: index + 1,
					timestamp: message.sentAt,
					sender: message.fromName?.trim() || message.fromEmail,
					text: (message.body ?? message.snippet ?? "").slice(
						0,
						CAPTURE.email.maxCharactersPerMessage,
					),
				})),
			});
			if (!captured.queued) return;

			const queued = await this.agent.queueIntake(captured.jobId, {
				jobId: captured.jobId,
				me: owner?.name?.trim() || owner?.email || null,
				contactId: thread.contactId,
			});
			if (queued) this.agent.poke();
		} catch (error) {
			this.logger.warn({
				message: "Could not capture an email thread for intake",
				threadId,
				error: error instanceof Error ? error.message : String(error),
			});
		}
	}
}

import { ActivityType, type Db, OutboundDraftStatus } from "@crm/db";
import { consumeDemoQuota } from "@crm/db/demo";
import {
	readPlaybook,
	readRevivalSlas,
	type StageSlas,
	writePlaybook,
	writeRevivalSlas,
} from "@crm/db/settings";
import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { TRPCError } from "@trpc/server";
import { AgentTriggerService } from "../agent/agent-trigger.service";
import { InjectDatabase } from "../database/database.constants";
import { SlackRevivalService } from "../slack/slack-revival.service";

@Injectable()
export class RevivalService {
	constructor(
		@InjectDatabase() private readonly db: Db,
		@Inject(AgentTriggerService)
		private readonly agentTrigger: AgentTriggerService,
		private readonly slackRevival: SlackRevivalService,
	) {}

	async listDrafts(input?: { status?: string }) {
		const targetStatus =
			(input?.status as OutboundDraftStatus) ||
			OutboundDraftStatus.PENDING_APPROVAL;

		const drafts = await this.db.outboundDraft.findMany({
			where: { status: targetStatus },
			include: {
				deal: {
					select: {
						id: true,
						name: true,
						stage: true,
						amount: true,
						currency: true,
						company: {
							select: { name: true },
						},
					},
				},
				contact: {
					select: {
						id: true,
						firstName: true,
						lastName: true,
						phone: true,
						email: true,
					},
				},
			},
			orderBy: [{ priorityScore: "desc" }, { createdAt: "desc" }],
		});

		return {
			drafts: drafts.map((d) => {
				const cited = Array.isArray(d.citedEvidence)
					? (d.citedEvidence as string[])
					: [];
				return {
					id: d.id,
					dealId: d.dealId,
					dealName: d.deal.name,
					dealStage: d.deal.stage,
					dealValue: d.deal.amount !== null ? Number(d.deal.amount) : null,
					dealCurrency: d.deal.currency || "USD",
					contactId: d.contactId,
					contactName:
						`${d.contact.firstName} ${d.contact.lastName || ""}`.trim(),
					contactPhone: d.contact.phone,
					contactEmail: d.contact.email,
					companyName: d.deal.company?.name ?? null,
					channel: d.channel,
					strategy: d.strategy,
					contextRationale: d.contextRationale,
					draftText: d.draftText,
					subject: d.subject,
					confidence: d.confidence,
					citedEvidence: cited,
					stalledReason: d.stalledReason,
					priorityScore: d.priorityScore,
					status: d.status,
					waLink: d.waLink,
					createdAt: d.createdAt.toISOString(),
				};
			}),
		};
	}

	/** Queues a revival cycle; `userId` is absent for the scheduler. */
	async runNow(userId?: string) {
		if (!(await consumeDemoQuota(this.db, userId, "revival"))) {
			throw new TRPCError({
				code: "TOO_MANY_REQUESTS",
				message: "The demo account has used today's revival runs.",
			});
		}
		await this.agentTrigger.queueRevival(true);
		this.agentTrigger.poke();
		return {
			queued: true,
			message: "Revival cycle dispatched to agent queue.",
		};
	}

	async approveAndSend(input: { draftId: string; draftText?: string }) {
		const draft = await this.db.outboundDraft.findUnique({
			where: { id: input.draftId },
			include: {
				contact: true,
			},
		});

		if (!draft) {
			throw new NotFoundException(`Draft with id ${input.draftId} not found.`);
		}

		const textToSend = input.draftText?.trim() || draft.draftText;
		const now = new Date();

		let actionUrl: string | null = null;
		if (draft.channel === "WHATSAPP" && draft.recipientPhone) {
			const clean = draft.recipientPhone.replace(/[^0-9]/g, "");
			actionUrl = `https://wa.me/${clean}?text=${encodeURIComponent(textToSend)}`;
		} else if (draft.recipientEmail) {
			const subj = draft.subject || "Following up";
			actionUrl = `mailto:${draft.recipientEmail}?subject=${encodeURIComponent(subj)}&body=${encodeURIComponent(textToSend)}`;
		}

		await this.db.outboundDraft.update({
			where: { id: draft.id },
			data: {
				status: OutboundDraftStatus.SENT,
				draftText: textToSend,
				sentAt: now,
				waLink: actionUrl,
			},
		});

		await this.slackRevival.updateSlackMessageForInAppAction(
			draft.id,
			"APPROVED",
		);

		const defaultUser = await this.db.user.findFirst({ select: { id: true } });
		if (defaultUser) {
			await this.db.activity.create({
				data: {
					type:
						draft.channel === "whatsapp"
							? ActivityType.WHATSAPP
							: ActivityType.EMAIL,
					subject: draft.subject || `Revival message sent via ${draft.channel}`,
					body: textToSend,
					dealId: draft.dealId,
					contactId: draft.contactId,
					createdById: defaultUser.id,
					occurredAt: now,
					meta: {
						channel: draft.channel,
						draftId: draft.id,
						strategy: draft.strategy,
					},
				},
			});

			const followUpDue = new Date(now.getTime() + 3 * 86400 * 1000);
			await this.db.activity.create({
				data: {
					type: ActivityType.TASK,
					subject: `Check: Revival response from ${draft.contact.firstName}`,
					dueAt: followUpDue,
					dealId: draft.dealId,
					contactId: draft.contactId,
					createdById: defaultUser.id,
				},
			});
		}

		return {
			success: true,
			status: "SENT",
			actionUrl,
		};
	}

	async updateDraft(input: {
		draftId: string;
		draftText: string;
		subject?: string;
	}) {
		const updateData: { draftText: string; subject?: string } = {
			draftText: input.draftText,
		};
		if (input.subject !== undefined) {
			updateData.subject = input.subject;
		}

		await this.db.outboundDraft.update({
			where: { id: input.draftId },
			data: updateData,
		});

		return { success: true };
	}

	async rejectDraft(input: { draftId: string }) {
		await this.db.outboundDraft.update({
			where: { id: input.draftId },
			data: {
				status: OutboundDraftStatus.REJECTED,
			},
		});

		await this.slackRevival.updateSlackMessageForInAppAction(
			input.draftId,
			"REJECTED",
		);

		return { success: true };
	}

	async getSettings() {
		const [slas, playbook] = await Promise.all([
			readRevivalSlas(this.db),
			readPlaybook(this.db),
		]);
		return { slas, playbook };
	}

	async updateSettings(input: { slas?: StageSlas; playbook?: string }) {
		let currentSlas = await readRevivalSlas(this.db);
		let currentPlaybook = await readPlaybook(this.db);

		if (input.slas) {
			currentSlas = await writeRevivalSlas(this.db, input.slas);
		}
		if (input.playbook !== undefined) {
			currentPlaybook = await writePlaybook(this.db, input.playbook);
		}

		return {
			success: true,
			slas: currentSlas,
			playbook: currentPlaybook,
		};
	}
}

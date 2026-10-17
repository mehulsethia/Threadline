import { WORKSPACE_ID } from "@crm/auth";
import { type Db, formatDealStage } from "@crm/db";
import { citedEvidenceList } from "@crm/validation/cited-evidence";
import { Injectable, Logger } from "@nestjs/common";
import { InjectDatabase } from "../database/database.constants";
import type { SlackBlock, SlackBlockActionPayload } from "./slack.contracts";
import { decryptToken } from "./slack-crypto";

@Injectable()
export class SlackRevivalService {
	private readonly logger = new Logger(SlackRevivalService.name);

	constructor(@InjectDatabase() private readonly db: Db) {}

	async getInstallationForOrg(orgId?: string) {
		const targetOrgId = orgId || WORKSPACE_ID;
		const install = await this.db.slackInstallation.findFirst({
			where: {
				OR: [{ organizationId: targetOrgId }, { organizationId: null }],
			},
			orderBy: { createdAt: "desc" },
		});
		return install;
	}

	async postDraftRevivalCard(
		draftId: string,
		orgId?: string,
	): Promise<{
		posted: boolean;
		ts?: string;
		channel?: string;
		reason?: string;
	}> {
		const draft = await this.db.outboundDraft.findUnique({
			where: { id: draftId },
			include: {
				deal: { include: { company: true } },
				contact: true,
			},
		});

		if (!draft) {
			return { posted: false, reason: `Draft ${draftId} not found.` };
		}

		const install = await this.getInstallationForOrg(orgId);
		// The env token is a local Socket Mode convenience; in production a
		// workspace posts only through its own OAuth installation.
		let botToken =
			process.env.NODE_ENV === "production"
				? undefined
				: process.env.SLACK_BOT_TOKEN;

		if (install?.botToken) {
			try {
				botToken = decryptToken(install.botToken);
			} catch {
				botToken = install.botToken;
			}
		}

		if (!botToken) {
			return {
				posted: false,
				reason:
					"No Slack bot token available (install Slack or configure SLACK_BOT_TOKEN).",
			};
		}

		// Only the channel an admin picked in settings; never a guessed one.
		const channel = install?.alertsChannelId;
		if (!channel) {
			return {
				posted: false,
				reason: "No Slack alerts channel selected in settings.",
			};
		}

		const quotes = citedEvidenceList
			.parse(draft.citedEvidence)
			.map((item) => item.quote);

		const contactName =
			[draft.contact.firstName, draft.contact.lastName]
				.filter(Boolean)
				.join(" ") || "Unknown";

		const quotedDraft = draft.draftText
			.split("\n")
			.map((line) => `> ${line}`)
			.join("\n");

		const blocks: unknown[] = [
			{
				type: "header",
				text: {
					type: "plain_text",
					text: "🎯 Lead Revival Draft Ready for Review",
					emoji: true,
				},
			},
			{
				type: "section",
				fields: [
					{
						type: "mrkdwn",
						text: `*Lead:*\n${contactName} (${draft.contact.phone || draft.contact.email || "No contact info"})`,
					},
					{
						type: "mrkdwn",
						text: `*Deal:*\n${draft.deal.name}`,
					},
					{
						type: "mrkdwn",
						text: `*Stage:*\n${formatDealStage(draft.deal.stage)}`,
					},
					{
						type: "mrkdwn",
						text: `*Channel:*\n\`${draft.channel}\` (${draft.language.toUpperCase()})`,
					},
				],
			},
			{
				type: "section",
				text: {
					type: "mrkdwn",
					text: `*Stalled Reason:*\n${draft.stalledReason || "Deal exceeded stage inactivity SLA"}`,
				},
			},
			{
				type: "section",
				text: {
					type: "mrkdwn",
					text: `*Draft Message:*\n${quotedDraft}`,
				},
			},
		];

		if (quotes.length > 0) {
			blocks.push({
				type: "context",
				elements: [
					{
						type: "mrkdwn",
						text: `*Cited Evidence Quotes:*\n${quotes
							.slice(0, 4)
							.map((q) => `• "${q}"`)
							.join("\n")}`,
					},
				],
			});
		}

		blocks.push({
			type: "actions",
			block_id: `draft_actions_${draft.id}`,
			elements: [
				{
					type: "button",
					text: {
						type: "plain_text",
						text: "Approve & Send",
						emoji: true,
					},
					style: "primary",
					action_id: "draft_approve",
					value: draft.id,
				},
				{
					type: "button",
					text: {
						type: "plain_text",
						text: "Edit Draft",
						emoji: true,
					},
					action_id: "draft_edit",
					value: draft.id,
				},
				{
					type: "button",
					text: {
						type: "plain_text",
						text: "Reject",
						emoji: true,
					},
					style: "danger",
					action_id: "draft_reject",
					value: draft.id,
				},
			],
		});

		const response = await fetch("https://slack.com/api/chat.postMessage", {
			method: "POST",
			headers: {
				authorization: `Bearer ${botToken}`,
				"content-type": "application/json; charset=utf-8",
			},
			body: JSON.stringify({
				channel,
				text: `Lead Revival Draft: ${contactName} (${draft.deal.name})`,
				blocks,
			}),
		});

		const data = (await response.json()) as {
			ok: boolean;
			ts?: string;
			error?: string;
		};

		if (!data.ok || !data.ts) {
			this.logger.error(`Failed to post Slack revival card: ${data.error}`);
			return {
				posted: false,
				reason: data.error || "Slack API call failed",
			};
		}

		await this.db.outboundDraft.update({
			where: { id: draft.id },
			data: {
				slackMessageTs: data.ts,
				slackChannelId: channel,
			},
		});

		return {
			posted: true,
			ts: data.ts,
			channel,
		};
	}

	async handleBlockAction(payload: SlackBlockActionPayload) {
		const action = payload.actions[0];
		if (!action) return;

		const draftId = action.value;
		const actionId = action.action_id;
		const slackUserId = payload.user.id;
		const slackUsername =
			payload.user.username || payload.user.name || slackUserId;

		const member = await this.verifySlackMember(slackUserId, payload.team.id);
		if (!member) {
			if (payload.response_url) {
				await fetch(payload.response_url, {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({
						response_type: "ephemeral",
						text: "⚠️ Access Denied: You must be a registered member of this Threadline organization to approve or reject drafts.",
					}),
				});
			}
			return;
		}

		const draft = await this.db.outboundDraft.findUnique({
			where: { id: draftId },
		});
		if (!draft) return;

		let botToken = process.env.SLACK_BOT_TOKEN;
		const install = await this.db.slackInstallation.findFirst({
			where: { teamId: payload.team.id },
		});
		if (install?.botToken) {
			try {
				botToken = decryptToken(install.botToken);
			} catch {
				botToken = install.botToken;
			}
		}

		if (actionId === "draft_approve") {
			await this.db.outboundDraft.update({
				where: { id: draftId },
				data: {
					status: "APPROVED",
					approvedById: member.userId,
					approvedAt: new Date(),
					sentAt: new Date(),
				},
			});

			if (botToken && payload.channel?.id && payload.message?.ts) {
				await this.updateSlackMessageStatus(
					botToken,
					payload.channel.id,
					payload.message.ts,
					payload.message.blocks,
					`✅ *Approved by @${slackUsername}* at ${new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" })} UTC`,
				);
			}
		} else if (actionId === "draft_reject") {
			await this.db.outboundDraft.update({
				where: { id: draftId },
				data: {
					status: "REJECTED",
					approvedById: member.userId,
					approvedAt: new Date(),
				},
			});

			if (botToken && payload.channel?.id && payload.message?.ts) {
				await this.updateSlackMessageStatus(
					botToken,
					payload.channel.id,
					payload.message.ts,
					payload.message.blocks,
					`❌ *Rejected by @${slackUsername}* at ${new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" })} UTC`,
				);
			}
		}
	}

	async updateSlackMessageForInAppAction(
		draftId: string,
		status: "APPROVED" | "REJECTED",
		userName?: string,
	) {
		const draft = await this.db.outboundDraft.findUnique({
			where: { id: draftId },
		});
		if (!draft?.slackMessageTs || !draft.slackChannelId) return;

		let botToken = process.env.SLACK_BOT_TOKEN;
		const install = await this.getInstallationForOrg();
		if (install?.botToken) {
			try {
				botToken = decryptToken(install.botToken);
			} catch {
				botToken = install.botToken;
			}
		}
		if (!botToken) return;

		const statusText =
			status === "APPROVED"
				? `✅ *Approved in Threadline App by ${userName || "Rep"}*`
				: `❌ *Rejected in Threadline App by ${userName || "Rep"}*`;

		await fetch("https://slack.com/api/chat.update", {
			method: "POST",
			headers: {
				authorization: `Bearer ${botToken}`,
				"content-type": "application/json; charset=utf-8",
			},
			body: JSON.stringify({
				channel: draft.slackChannelId,
				ts: draft.slackMessageTs,
				text: `Draft ${status}: ${draft.draftText.slice(0, 60)}...`,
				blocks: [
					{
						type: "section",
						text: {
							type: "mrkdwn",
							text: `> ${draft.draftText.replace(/\n/g, "\n> ")}`,
						},
					},
					{
						type: "context",
						elements: [{ type: "mrkdwn", text: statusText }],
					},
				],
			}),
		});
	}

	private async verifySlackMember(
		slackUserId: string,
		teamId: string,
	): Promise<{ userId: string } | null> {
		const match = await this.db.slackMemberMatch.findFirst({
			where: { slackUserId },
			include: { crmUser: true },
		});

		if (match) {
			return { userId: match.crmUserId };
		}

		let botToken = process.env.SLACK_BOT_TOKEN;
		const install = await this.db.slackInstallation.findFirst({
			where: { teamId },
		});
		if (install?.botToken) {
			try {
				botToken = decryptToken(install.botToken);
			} catch {
				botToken = install.botToken;
			}
		}

		if (botToken) {
			try {
				const infoRes = await fetch(
					`https://slack.com/api/users.info?user=${slackUserId}`,
					{
						headers: { authorization: `Bearer ${botToken}` },
					},
				);
				const infoData = (await infoRes.json()) as {
					ok: boolean;
					user?: { profile?: { email?: string } };
				};

				const email = infoData.user?.profile?.email;
				if (email) {
					const user = await this.db.user.findFirst({
						where: { email: { equals: email, mode: "insensitive" } },
					});
					if (user) {
						await this.db.slackMemberMatch.upsert({
							where: { crmUserId: user.id },
							create: {
								crmUserId: user.id,
								slackUserId,
								slackEmail: email,
							},
							update: {
								slackUserId,
								slackEmail: email,
							},
						});
						return { userId: user.id };
					}
				}
			} catch (err) {
				this.logger.error("Error looking up Slack user info", err);
			}
		}

		const fallbackUser = await this.db.user.findFirst({
			orderBy: { createdAt: "asc" },
		});
		if (fallbackUser) {
			return { userId: fallbackUser.id };
		}

		return null;
	}

	private async updateSlackMessageStatus(
		botToken: string,
		channel: string,
		ts: string,
		existingBlocks: SlackBlock[] | undefined,
		statusText: string,
	) {
		// Drop the buttons so a decided draft cannot be decided again.
		const updatedBlocks: SlackBlock[] = (existingBlocks ?? []).filter(
			(block) =>
				block.type !== "actions" &&
				!(block.block_id ?? "").startsWith("draft_actions_"),
		);

		updatedBlocks.push({
			type: "context",
			elements: [
				{
					type: "mrkdwn",
					text: statusText,
				},
			],
		});

		await fetch("https://slack.com/api/chat.update", {
			method: "POST",
			headers: {
				authorization: `Bearer ${botToken}`,
				"content-type": "application/json; charset=utf-8",
			},
			body: JSON.stringify({
				channel,
				ts,
				blocks: updatedBlocks,
			}),
		});
	}
}

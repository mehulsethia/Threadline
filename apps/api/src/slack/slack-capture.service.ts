import { type Db, IntakeSourceType } from "@crm/db";
import { captureConversation } from "@crm/db/capture";
import { Inject, Injectable, Logger } from "@nestjs/common";
import { AgentTriggerService } from "../agent/agent-trigger.service";
import { CAPTURE } from "../capture/capture-config";
import { InjectDatabase } from "../database/database.constants";
import {
	type SlackMessageEvent,
	slackHistoryResponse,
	slackMemberChannelsResponse,
	slackUserInfoResponse,
} from "./slack.contracts";
import { decryptToken } from "./slack-crypto";

const IGNORED_SUBTYPES = new Set([
	"bot_message",
	"channel_join",
	"channel_leave",
	"channel_topic",
	"channel_purpose",
	"channel_name",
	"message_deleted",
	"message_changed",
]);

@Injectable()
export class SlackCaptureService {
	private readonly logger = new Logger(SlackCaptureService.name);
	private readonly names = new Map<string, string>();

	constructor(
		@InjectDatabase() private readonly db: Db,
		@Inject(AgentTriggerService) private readonly agent: AgentTriggerService,
	) {}

	receive(teamId: string | undefined, event: SlackMessageEvent): void {
		if (!teamId) return;
		void this.capture(teamId, event).catch((error) =>
			this.logger.warn({
				message: "Could not capture a Slack conversation",
				error: error instanceof Error ? error.message : String(error),
			}),
		);
	}

	async syncRecent(): Promise<{ channels: number }> {
		const install = await this.db.slackInstallation.findFirst({
			orderBy: { createdAt: "desc" },
		});
		if (!install?.botToken) return { channels: 0 };
		const token = decryptToken(install.botToken);
		const joined = slackMemberChannelsResponse.parse(
			await this.call(token, "users.conversations", {
				types: "public_channel,private_channel",
				exclude_archived: "true",
				limit: String(CAPTURE.slack.maxChannels),
			}),
		);
		const oldest = String((Date.now() - CAPTURE.slack.backfillMs) / 1000);
		let channels = 0;
		for (const channel of joined.channels ?? []) {
			if (channel.id === install.alertsChannelId) continue;
			const history = slackHistoryResponse.parse(
				await this.call(token, "conversations.history", {
					channel: channel.id,
					oldest,
					limit: String(CAPTURE.slack.maxMessages),
				}),
			);
			const latest = (history.messages ?? []).find(
				(row) => row.user && !row.bot_id && row.text?.trim(),
			);
			if (!latest) continue;
			channels += 1;
			await this.capture(install.teamId, {
				type: "message",
				channel: channel.id,
				ts: latest.ts,
				user: latest.user,
				text: latest.text,
			});
		}
		return { channels };
	}

	private async capture(teamId: string, event: SlackMessageEvent) {
		if (event.bot_id || !event.user || !event.text?.trim()) return;
		if (event.subtype && IGNORED_SUBTYPES.has(event.subtype)) return;

		const install = await this.db.slackInstallation.findFirst({
			where: { teamId },
			orderBy: { createdAt: "desc" },
		});
		if (!install?.botToken) return;
		if (install.alertsChannelId === event.channel) return;
		if (install.botUserId && event.user === install.botUserId) return;
		const token = decryptToken(install.botToken);

		const root = event.thread_ts ?? event.ts;
		const day = new Date(Number(root) * 1000).toISOString().slice(0, 10);
		const threaded = Boolean(event.thread_ts);
		const history = threaded
			? await this.call(token, "conversations.replies", {
					channel: event.channel,
					ts: root,
					limit: String(CAPTURE.slack.maxMessages),
				})
			: await this.call(token, "conversations.history", {
					channel: event.channel,
					oldest: String(Date.parse(`${day}T00:00:00Z`) / 1000),
					latest: String(Date.parse(`${day}T23:59:59Z`) / 1000),
					limit: String(CAPTURE.slack.maxMessages),
				});
		const parsed = slackHistoryResponse.parse(history);
		if (!parsed.ok) {
			this.logger.warn({
				message: "Slack history failed",
				error: parsed.error,
			});
			return;
		}

		const rows = (parsed.messages ?? [])
			.filter(
				(row) =>
					row.user &&
					!row.bot_id &&
					row.text?.trim() &&
					!(row.subtype && IGNORED_SUBTYPES.has(row.subtype)),
			)
			.sort((a, b) => Number(a.ts) - Number(b.ts));

		const messages = [];
		for (const row of rows) {
			messages.push({
				lineNo: messages.length + 1,
				timestamp: new Date(Number(row.ts) * 1000),
				sender: await this.nameOf(token, row.user ?? ""),
				text: (row.text ?? "").slice(0, CAPTURE.slack.maxCharactersPerMessage),
			});
		}

		const installer = install.installedBy
			? await this.db.user.findUnique({
					where: { id: install.installedBy },
					select: { name: true },
				})
			: null;

		const key = threaded
			? `slack:${teamId}:${event.channel}:${root}`
			: `slack:${teamId}:${event.channel}:${day}`;
		const captured = await captureConversation(this.db, {
			sourceType: IntakeSourceType.SLACK_THREAD,
			externalId: key,
			sourceUri: `slack://${teamId}/${event.channel}/${root}`,
			title: threaded ? "Slack thread" : `Slack conversation on ${day}`,
			userId: install.installedBy,
			messages,
		});
		if (!captured.queued) return;

		const queued = await this.agent.queueIntake(
			captured.jobId,
			{
				jobId: captured.jobId,
				me: installer?.name ?? null,
			},
			false,
			CAPTURE.batchDelayMs,
		);
		if (queued) this.agent.poke();
	}

	private async nameOf(token: string, userId: string): Promise<string> {
		const cached = this.names.get(userId);
		if (cached) return cached;
		const info = slackUserInfoResponse.safeParse(
			await this.call(token, "users.info", { user: userId }),
		);
		const user = info.success ? info.data.user : undefined;
		const name =
			user?.profile?.real_name ||
			user?.real_name ||
			user?.profile?.display_name ||
			user?.name ||
			userId;
		this.names.set(userId, name);
		return name;
	}

	private async call(
		token: string,
		method: string,
		params: Record<string, string>,
	): Promise<unknown> {
		const response = await fetch(
			`https://slack.com/api/${method}?${new URLSearchParams(params)}`,
			{
				headers: { authorization: `Bearer ${token}` },
				signal: AbortSignal.timeout(CAPTURE.slack.requestTimeoutMs),
			},
		);
		return response.json();
	}
}

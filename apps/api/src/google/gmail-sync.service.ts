import {
	type Db,
	GoogleSyncStatus,
	type MailboxSyncModel as MailboxSync,
} from "@crm/db";
import { notify } from "@crm/db/notifications";
import { Injectable, Logger } from "@nestjs/common";
import { CAPTURE } from "../capture/capture-config";
import { InjectDatabase } from "../database/database.constants";
import type { MatchContext } from "../mailbox/mailbox-match.service";
import { MailboxTokenService } from "../mailbox/mailbox-token.service";
import {
	normaliseMessageId,
	stripQuotedHistory,
} from "../mailbox/message-text";
import { parseAddress, parseAddressList } from "../mailbox/participants";
import { SyncStateService } from "../mailbox/sync-state.service";
import {
	type IncomingMessage,
	type StoreSkipReason,
	ThreadWriterService,
} from "../mailbox/thread-writer.service";
import { GmailClient, type GmailMessage } from "./gmail.client";
import {
	type GmailHeader,
	header,
	plainTextBody,
	rootMessageId,
} from "./gmail-mime";

const MAX_MESSAGES_PER_TICK = 120;

export type GmailSyncOptions = {
	backfillIfEmpty?: boolean;
	rescanRecent?: boolean;
	report?: boolean;
};

type SyncTally = {
	read: number;
	stored: number;
	companies: Set<string>;
	skipped: Record<StoreSkipReason | "unreadable", number>;
};

function emptyTally(): SyncTally {
	return {
		read: 0,
		stored: 0,
		companies: new Set(),
		skipped: {
			"already-filed": 0,
			"auto-create-off": 0,
			"no-external-person": 0,
			unreadable: 0,
		},
	};
}

export type GmailSyncOutcome = {
	source: "gmail";
	userId: string;
	status: "synced" | "skipped" | "reconnect" | "rate-limited" | "failed";
	messagesWritten?: number;
	threadsTouched?: number;
	reason?: string;
};

@Injectable()
export class GmailSyncService {
	private readonly logger = new Logger(GmailSyncService.name);

	constructor(
		@InjectDatabase() private readonly db: Db,
		private readonly gmail: GmailClient,
		private readonly tokens: MailboxTokenService,
		private readonly state: SyncStateService,
		private readonly threads: ThreadWriterService,
	) {}

	async sync(
		row: MailboxSync,
		options: GmailSyncOptions = {},
	): Promise<GmailSyncOutcome> {
		const token = await this.tokens.accessTokenFor(row.userId, "gmail");

		if (token.outcome === "not-connected") {
			return {
				source: "gmail",
				userId: row.userId,
				status: "skipped",
				reason: token.reason,
			};
		}

		if (token.outcome === "needs-reconnect") {
			await this.state.markNeedsReconnect(row.id, token.reason);
			return {
				source: "gmail",
				userId: row.userId,
				status: "reconnect",
				reason: token.reason,
			};
		}

		await this.state.markRunning(row.id);

		const profile = await this.gmail.profile(token.accessToken);
		if (profile.outcome !== "ok") {
			return this.handleFailure(row, profile);
		}

		const mailbox = profile.data.emailAddress?.toLowerCase() ?? null;
		if (!mailbox) {
			await this.state.markFailed(row.id, "Gmail returned no mailbox address.");
			return {
				source: "gmail",
				userId: row.userId,
				status: "failed",
				reason: "No mailbox address.",
			};
		}

		const tally = options.report ? emptyTally() : undefined;

		if (
			!row.cursor ||
			(options.backfillIfEmpty === true &&
				!(await this.hasStoredMail(row.userId)))
		) {
			const outcome = await this.start(
				row,
				token.accessToken,
				mailbox,
				profile.data.historyId ?? null,
				tally,
			);
			if (tally) await this.report(tally, true);
			return outcome;
		}

		const rescanned = options.rescanRecent
			? await this.backfill(row, token.accessToken, mailbox, tally)
			: 0;

		const outcome = await this.incremental(
			row,
			token.accessToken,
			mailbox,
			row.cursor,
			tally,
		);
		if (tally) await this.report(tally, options.rescanRecent === true);
		return rescanned > 0
			? {
					...outcome,
					messagesWritten: (outcome.messagesWritten ?? 0) + rescanned,
				}
			: outcome;
	}

	private async start(
		row: MailboxSync,
		accessToken: string,
		mailbox: string,
		historyId: string | null,
		tally?: SyncTally,
	): Promise<GmailSyncOutcome> {
		if (!historyId) {
			await this.state.markFailed(row.id, "Gmail returned no historyId.");
			return {
				source: "gmail",
				userId: row.userId,
				status: "failed",
				reason: "No historyId to start from.",
			};
		}

		const written = await this.backfill(row, accessToken, mailbox, tally);

		await this.state.settle(row.id, {
			cursor: historyId,
			status: GoogleSyncStatus.RUNNING,
		});

		this.logger.log({
			message:
				"Gmail sync started — backfilled recent mail, watching for new mail",
			userId: row.userId,
			messagesWritten: written,
		});

		return {
			source: "gmail",
			userId: row.userId,
			status: "synced",
			messagesWritten: written,
		};
	}

	private async backfill(
		row: MailboxSync,
		accessToken: string,
		mailbox: string,
		tally?: SyncTally,
	): Promise<number> {
		const before = new Date();
		const after = new Date(before.getTime() - CAPTURE.email.backfillMs);
		const limit = CAPTURE.email.backfillMaxMessages;
		const ids: string[] = [];
		let pageToken: string | undefined;

		do {
			const page = await this.gmail.listMessages(accessToken, {
				after,
				before,
				pageToken,
				maxResults: limit,
			});
			if (page.outcome !== "ok") {
				this.logger.warn({
					message: "Gmail backfill could not list recent mail",
					userId: row.userId,
					reason: page.reason,
				});
				break;
			}
			for (const message of page.data.messages ?? []) {
				if (message.id) ids.push(message.id);
			}
			pageToken = page.data.nextPageToken;
		} while (pageToken && ids.length < limit);

		const { written } = await this.ingest(
			row,
			accessToken,
			mailbox,
			ids.slice(0, limit),
			tally,
			limit,
		);
		return written;
	}

	private async hasStoredMail(userId: string): Promise<boolean> {
		const stored = await this.db.emailMessage.findFirst({
			where: { syncedByUserId: userId, gmailMessageId: { not: null } },
			select: { id: true },
		});
		return stored !== null;
	}

	private async incremental(
		row: MailboxSync,
		accessToken: string,
		mailbox: string,
		startHistoryId: string,
		tally?: SyncTally,
	): Promise<GmailSyncOutcome> {
		const history = await this.gmail.listHistory(accessToken, {
			startHistoryId,
		});

		if (history.outcome === "cursor-invalid") {
			await this.state.clearCursor(row.id, history.reason);

			return {
				source: "gmail",
				userId: row.userId,
				status: "synced",
				reason: "History expired; resuming from now.",
			};
		}

		if (history.outcome !== "ok") {
			return this.handleFailure(row, history);
		}

		const ids = new Set<string>();
		for (const entry of history.data.history ?? []) {
			for (const added of entry.messagesAdded ?? []) {
				if (added.message?.id) ids.add(added.message.id);
			}
		}

		const { written, remaining } = await this.ingest(
			row,
			accessToken,
			mailbox,
			[...ids],
			tally,
		);

		await this.state.settle(row.id, {
			cursor:
				remaining > 0
					? startHistoryId
					: (history.data.historyId ?? startHistoryId),
			status: GoogleSyncStatus.RUNNING,
		});

		if (written > 0 || remaining > 0) {
			this.logger.log({
				message: "Gmail incremental sync",
				userId: row.userId,
				messagesWritten: written,
				remaining,
			});
		}

		return {
			source: "gmail",
			userId: row.userId,
			status: "synced",
			messagesWritten: written,
		};
	}

	private async ingest(
		row: MailboxSync,
		accessToken: string,
		mailbox: string,
		ids: readonly string[],
		tally?: SyncTally,
		limit: number = MAX_MESSAGES_PER_TICK,
	): Promise<{ written: number; remaining: number }> {
		if (ids.length === 0) return { written: 0, remaining: 0 };

		const alreadyHave = await this.db.emailMessage.findMany({
			where: { gmailMessageId: { in: [...ids] } },
			select: { gmailMessageId: true },
		});
		const seen = new Set(
			alreadyHave.map((existing) => existing.gmailMessageId),
		);

		const pending = ids.filter((id) => !seen.has(id));
		const batch = pending.slice(0, limit);
		const remaining = pending.length - batch.length;

		if (tally) {
			tally.read += ids.length;
			tally.skipped["already-filed"] += ids.length - pending.length;
		}

		if (batch.length === 0) return { written: 0, remaining };

		const context: MatchContext = await this.threads.context();

		let written = 0;

		for (
			let start = 0;
			start < batch.length;
			start += CAPTURE.email.fetchConcurrency
		) {
			const messages = await Promise.all(
				batch
					.slice(start, start + CAPTURE.email.fetchConcurrency)
					.map((id) => this.gmail.getMessage(accessToken, id)),
			);

			for (const message of messages) {
				const parsed =
					message.outcome === "ok" ? this.parse(message.data) : null;
				if (!parsed) {
					if (tally) tally.skipped.unreadable += 1;
					continue;
				}

				const result = await this.threads.storeWithReason(
					row,
					{ mailbox, origin: "gmail" },
					parsed,
					context,
				);
				if (result.stored) {
					written += 1;
					if (tally) {
						tally.stored += 1;
						if (result.companyId) tally.companies.add(result.companyId);
					}
				} else if (tally) {
					tally.skipped[result.reason] += 1;
				}
			}
		}

		return { written, remaining };
	}

	private async report(tally: SyncTally, backfill: boolean): Promise<void> {
		const skipped = Object.values(tally.skipped).reduce((a, b) => a + b, 0);
		const lines = [
			backfill
				? `Read ${tally.read} messages from the last 7 days. Promotions, Social and Forums are never read.`
				: `Read ${tally.read} new messages since the last sync.`,
			`Added ${tally.stored} messages on ${tally.companies.size} ${tally.companies.size === 1 ? "company" : "companies"}. Their conversations become facts and deals in a few minutes.`,
		];
		const reasons: [keyof SyncTally["skipped"], string][] = [
			[
				"auto-create-off",
				"email auto-create is off. Turn on Email in Settings, Connections, Google",
			],
			[
				"no-external-person",
				"only your own team, role addresses or suppressed domains are on the thread",
			],
			["already-filed", "already in Threadline"],
			["unreadable", "Gmail could not return the message"],
		];
		for (const [key, why] of reasons) {
			if (tally.skipped[key] > 0) {
				lines.push(`Skipped ${tally.skipped[key]}: ${why}.`);
			}
		}
		await notify(this.db, {
			kind: "sync.report",
			title: `Gmail sync: ${tally.stored} added, ${skipped} skipped`,
			body: lines.join("\n"),
			source: "email",
		});
	}

	private parse(message: GmailMessage): IncomingMessage | null {
		const headers = message.payload?.headers;

		const rawMessageId = header(headers, "message-id");
		if (!rawMessageId) return null;

		const from = parseAddress(header(headers, "from") ?? "");
		if (!from) return null;

		const sentAt = this.sentAt(message, headers);
		if (!sentAt) return null;

		const rootId = rootMessageId(headers) ?? normaliseMessageId(rawMessageId);

		const to = parseAddressList(header(headers, "to")).map((person) => ({
			email: person.email,
			name: person.name,
			kind: "to" as const,
		}));

		const cc = parseAddressList(header(headers, "cc")).map((person) => ({
			email: person.email,
			name: person.name,
			kind: "cc" as const,
		}));

		const body = stripQuotedHistory(plainTextBody(message.payload));

		return {
			rfcMessageId: normaliseMessageId(rawMessageId),
			rootId,
			subject: header(headers, "subject"),
			from,
			recipients: [...to, ...cc],
			body,
			sentAt,
			gmailMessageId: message.id ?? null,
		};
	}

	private sentAt(
		message: GmailMessage,
		headers: readonly GmailHeader[] | undefined,
	): Date | null {
		if (message.internalDate) {
			const at = new Date(Number(message.internalDate));
			if (!Number.isNaN(at.getTime())) return at;
		}

		const raw = header(headers, "date");
		if (!raw) return null;

		const at = new Date(raw);
		return Number.isNaN(at.getTime()) ? null : at;
	}

	private async handleFailure(
		row: MailboxSync,
		result: { outcome: string; reason: string; retryAfterMs?: number },
	): Promise<GmailSyncOutcome> {
		if (result.outcome === "unauthorized") {
			await this.state.markNeedsReconnect(row.id, result.reason);
			return {
				source: "gmail",
				userId: row.userId,
				status: "reconnect",
				reason: result.reason,
			};
		}

		if (result.outcome === "rate-limited") {
			await this.state.markRateLimited(row.id, result.retryAfterMs ?? 60_000);
			return {
				source: "gmail",
				userId: row.userId,
				status: "rate-limited",
				reason: result.reason,
			};
		}

		await this.state.markFailed(row.id, result.reason);
		return {
			source: "gmail",
			userId: row.userId,
			status: "failed",
			reason: result.reason,
		};
	}
}

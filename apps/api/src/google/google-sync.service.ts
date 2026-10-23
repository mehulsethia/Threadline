import { randomUUID } from "node:crypto";
import type { Db } from "@crm/db";
import { Injectable } from "@nestjs/common";
import { z } from "zod";
import { CAPTURE } from "../capture/capture-config";
import { InjectDatabase } from "../database/database.constants";
import { SyncStateService } from "../mailbox/sync-state.service";
import { CalendarSyncService } from "./calendar-sync.service";
import {
	type GmailSyncOptions,
	GmailSyncService,
	type SyncProgress,
} from "./gmail-sync.service";
import { GOOGLE_SYNC_SOURCES, type GoogleSyncSource } from "./google.constants";
import type { GoogleFetchProgress } from "./google.contracts";

const FETCH_STEP = "mailbox.fetch.step";

const fetchStep = z.object({ tool: z.string(), message: z.string() });

function fetchSession(syncId: string): string {
	return `mailbox-fetch:${syncId}`;
}

function staleBefore(): Date {
	return new Date(Date.now() - CAPTURE.email.recentFetchStaleMs);
}

@Injectable()
export class GoogleSyncService {
	constructor(
		@InjectDatabase() private readonly db: Db,
		private readonly state: SyncStateService,
		private readonly calendar: CalendarSyncService,
		private readonly gmail: GmailSyncService,
	) {}

	async runOne(
		userId: string,
		source: GoogleSyncSource,
		options: GmailSyncOptions = {},
	) {
		const row = await this.state.get(userId, source);
		if (!row) return null;

		return source === "calendar"
			? this.calendar.sync(row)
			: this.gmail.sync(row, options);
	}

	async isFetchingRecent(userId: string): Promise<boolean> {
		const row = await this.state.get(userId, "gmail");
		return (
			row?.recentFetchStartedAt != null &&
			row.recentFetchStartedAt > staleBefore()
		);
	}

	async fetchRecent(userId: string): Promise<boolean> {
		const row = await this.state.get(userId, "gmail");
		if (!row || !(await this.state.claimRecentFetch(row.id, staleBefore()))) {
			return false;
		}
		const progress = this.progressFor(row.id);
		await progress({
			tool: "start",
			message: "Started reading your last 7 days of email",
		});
		try {
			const outcome = await this.gmail.sync(row, {
				rescanRecent: true,
				report: true,
				progress,
			});
			await progress({
				tool: "done",
				message:
					outcome.status === "synced"
						? `Done. ${outcome.messagesWritten ?? 0} new messages filed. The full report is in the notification bell.`
						: `Stopped: ${outcome.reason ?? outcome.status}`,
			});
			return true;
		} catch (error) {
			await progress({
				tool: "done",
				message: `Stopped: ${error instanceof Error ? error.message : String(error)}`,
			});
			throw error;
		} finally {
			await this.state.releaseRecentFetch(row.id);
		}
	}

	async fetchProgress(userId: string): Promise<GoogleFetchProgress> {
		const row = await this.state.get(userId, "gmail");
		if (!row) return { running: false, steps: [] };
		const sessionId = fetchSession(row.id);
		const start = await this.db.agentEvent.findFirst({
			where: {
				sessionId,
				type: FETCH_STEP,
				data: { path: ["tool"], equals: "start" },
			},
			orderBy: { emittedAt: "desc" },
			select: { emittedAt: true },
		});
		if (!start) return { running: false, steps: [] };
		const events = await this.db.agentEvent.findMany({
			where: {
				sessionId,
				type: FETCH_STEP,
				emittedAt: { gte: start.emittedAt },
			},
			orderBy: { emittedAt: "asc" },
			select: { id: true, data: true, emittedAt: true },
		});
		return {
			running: await this.isFetchingRecent(userId),
			steps: events.flatMap((event) => {
				const step = fetchStep.safeParse(event.data);
				return step.success
					? [{ id: event.id, ...step.data, at: event.emittedAt.toISOString() }]
					: [];
			}),
		};
	}

	private progressFor(syncId: string): SyncProgress {
		const sessionId = fetchSession(syncId);
		return async (step) => {
			await this.db.agentEvent
				.create({
					data: {
						id: randomUUID(),
						sessionId,
						type: FETCH_STEP,
						data: step,
						emittedAt: new Date(),
					},
				})
				.catch(() => {});
		};
	}

	async runForUser(
		userId: string,
		options: GmailSyncOptions = {},
	): Promise<void> {
		for (const source of GOOGLE_SYNC_SOURCES) {
			await this.runOne(userId, source, options);
		}
	}
}

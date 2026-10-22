import { Injectable } from "@nestjs/common";
import { CAPTURE } from "../capture/capture-config";
import { SyncStateService } from "../mailbox/sync-state.service";
import { CalendarSyncService } from "./calendar-sync.service";
import { type GmailSyncOptions, GmailSyncService } from "./gmail-sync.service";
import { GOOGLE_SYNC_SOURCES, type GoogleSyncSource } from "./google.constants";

function staleBefore(): Date {
	return new Date(Date.now() - CAPTURE.email.recentFetchStaleMs);
}

@Injectable()
export class GoogleSyncService {
	constructor(
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
		try {
			await this.gmail.sync(row, { rescanRecent: true, report: true });
			return true;
		} finally {
			await this.state.releaseRecentFetch(row.id);
		}
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

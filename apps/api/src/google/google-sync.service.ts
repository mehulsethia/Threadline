import { Injectable } from "@nestjs/common";
import { SyncStateService } from "../mailbox/sync-state.service";
import { CalendarSyncService } from "./calendar-sync.service";
import { type GmailSyncOptions, GmailSyncService } from "./gmail-sync.service";
import { GOOGLE_SYNC_SOURCES, type GoogleSyncSource } from "./google.constants";

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

	async runForUser(
		userId: string,
		options: GmailSyncOptions = {},
	): Promise<void> {
		for (const source of GOOGLE_SYNC_SOURCES) {
			await this.runOne(userId, source, options);
		}
	}
}

import { Injectable } from "@nestjs/common";
import { SyncStateService } from "../mailbox/sync-state.service";
import {
	MICROSOFT_SYNC_SOURCES,
	type MicrosoftSyncSource,
} from "./microsoft.constants";
import { OutlookSyncService } from "./outlook-sync.service";

const ENABLE_MICROSOFT_SYNC = true;

@Injectable()
export class MicrosoftSyncService {
	constructor(
		private readonly state: SyncStateService,
		private readonly outlook: OutlookSyncService,
	) {}

	async runOne(userId: string, source: MicrosoftSyncSource) {
		if (!ENABLE_MICROSOFT_SYNC) return null;
		const row = await this.state.get(userId, source);
		if (!row) return null;

		return this.outlook.sync(row);
	}

	async runForUser(userId: string): Promise<void> {
		if (!ENABLE_MICROSOFT_SYNC) return;
		for (const source of MICROSOFT_SYNC_SOURCES) {
			await this.runOne(userId, source);
		}
	}
}

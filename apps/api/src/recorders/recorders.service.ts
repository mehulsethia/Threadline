import type { Db } from "@crm/db";
import { openSecret, sealSecret } from "@crm/db/secret-box";
import { SETTINGS_ID } from "@crm/db/settings";
import { Inject, Injectable } from "@nestjs/common";
import { AgentTriggerService } from "../agent/agent-trigger.service";
import { InjectDatabase } from "../database/database.constants";
import type { RecorderProvider, RecorderStatus } from "./recorders.contracts";

const COLUMN = {
	fireflies: "firefliesApiKey",
	fathom: "fathomApiKey",
} as const satisfies Record<RecorderProvider, string>;

function hintOf(stored: string | null): string | null {
	if (!stored) return null;
	const key = openSecret(stored);
	return key ? `…${key.slice(-4)}` : null;
}

@Injectable()
export class RecordersService {
	constructor(
		@InjectDatabase() private readonly db: Db,
		@Inject(AgentTriggerService) private readonly agent: AgentTriggerService,
	) {}

	async status(): Promise<RecorderStatus> {
		const row = await this.db.appSetting.findUnique({
			where: { id: SETTINGS_ID },
			select: {
				firefliesApiKey: true,
				fathomApiKey: true,
				recordersSyncedAt: true,
			},
		});
		return {
			providers: [
				{
					provider: "fireflies",
					connected: Boolean(row?.firefliesApiKey),
					hint: hintOf(row?.firefliesApiKey ?? null),
				},
				{
					provider: "fathom",
					connected: Boolean(row?.fathomApiKey),
					hint: hintOf(row?.fathomApiKey ?? null),
				},
			],
			lastSyncedAt: row?.recordersSyncedAt?.toISOString() ?? null,
		};
	}

	async setKey(
		provider: RecorderProvider,
		apiKey: string,
	): Promise<RecorderStatus> {
		const sealed = sealSecret(apiKey);
		await this.db.appSetting.upsert({
			where: { id: SETTINGS_ID },
			create: { id: SETTINGS_ID, [COLUMN[provider]]: sealed },
			update: { [COLUMN[provider]]: sealed },
		});
		await this.agent.queueMeetingSync();
		return this.status();
	}

	async removeKey(provider: RecorderProvider): Promise<RecorderStatus> {
		await this.db.appSetting.upsert({
			where: { id: SETTINGS_ID },
			create: { id: SETTINGS_ID },
			update: { [COLUMN[provider]]: null },
		});
		return this.status();
	}

	async syncNow(): Promise<{ queued: boolean }> {
		return { queued: await this.agent.queueMeetingSync() };
	}
}

import { randomUUID } from "node:crypto";
import { db } from "@crm/db";
import { generateRevivalDraft, type RevivalDraftResult } from "./agent";
import { detectStalledDeals } from "./detector";

export type RevivalCycleReport = {
	cycleId: string;
	timestamp: string;
	stalledDealsDetected: number;
	draftsGenerated: number;
	drafts: RevivalDraftResult[];
};

export async function runLeadRevivalCycle(): Promise<RevivalCycleReport> {
	const cycleId = randomUUID();
	const startTime = new Date();

	const stalledDeals = await detectStalledDeals();

	await db.agentEvent.create({
		data: {
			id: randomUUID(),
			sessionId: `revival-cycle-${cycleId}`,
			type: "revival.cycle_started",
			data: {
				cycleId,
				stalledCount: stalledDeals.length,
				timestamp: startTime.toISOString(),
			},
			emittedAt: startTime,
		},
	});

	const drafts: RevivalDraftResult[] = [];

	for (const stalled of stalledDeals) {
		try {
			const draft = await generateRevivalDraft(stalled);
			if (draft) {
				drafts.push(draft);
			}
		} catch (error) {
			console.error(
				`[RevivalService] Error generating draft for deal ${stalled.dealId}:`,
				error,
			);
		}
	}

	const finishTime = new Date();
	await db.agentEvent.create({
		data: {
			id: randomUUID(),
			sessionId: `revival-cycle-${cycleId}`,
			type: "revival.cycle_completed",
			data: {
				cycleId,
				stalledCount: stalledDeals.length,
				draftsCount: drafts.length,
				durationMs: finishTime.getTime() - startTime.getTime(),
			},
			emittedAt: finishTime,
		},
	});

	return {
		cycleId,
		timestamp: startTime.toISOString(),
		stalledDealsDetected: stalledDeals.length,
		draftsGenerated: drafts.length,
		drafts,
	};
}

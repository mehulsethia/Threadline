import { DealStage, db } from "@crm/db";
import { STAGE_PROBABILITY } from "@crm/db/forecast";
import { notify } from "@crm/db/notifications";
import { readRevivalSlas } from "@crm/db/settings";
import { jsonText } from "@crm/validation/json-text";
import { z } from "zod";
import { getFastClient } from "../extraction";
import { ASSIST } from "./assist-config";
import { type DealContext, loadDealContext } from "./deal-context";

const DAY_MS = 24 * 60 * 60 * 1000;

const part = z.object({
	score: z.number().min(0).max(100).catch(50),
	reasons: z.array(z.string()).catch([]),
});

const judgement = z.object({
	fit: part,
	intent: part,
	risk: part,
	summary: z.string().catch(""),
});

export type ScoreFactors = {
	fit: z.infer<typeof part>;
	intent: z.infer<typeof part>;
	engagement: z.infer<typeof part>;
	risk: z.infer<typeof part>;
	summary: string;
};

export type DealScore = {
	dealId: string;
	leadScore: number;
	health: "on_track" | "at_risk" | "stalled" | "won" | "lost";
	healthReason: string;
	winProbability: number;
	factors: ScoreFactors;
};

function engagementOf(context: DealContext): z.infer<typeof part> {
	const reasons: string[] = [];
	const last = context.lastInboundAt;
	const days = last ? (Date.now() - last.getTime()) / DAY_MS : null;
	const recency =
		days === null
			? 10
			: days <= 3
				? 100
				: days <= 7
					? 75
					: days <= 14
						? 45
						: 15;
	reasons.push(
		days === null
			? "No reply from the lead yet"
			: `Last reply ${Math.round(days)} day(s) ago`,
	);
	const frequency = Math.min(100, context.inboundLast14d * 20);
	reasons.push(
		`${context.inboundLast14d} message(s) from the lead and ${context.outboundLast14d} from us in 14 days`,
	);
	return { score: Math.round(recency * 0.6 + frequency * 0.4), reasons };
}

async function judge(context: DealContext): Promise<z.infer<typeof judgement>> {
	const { ai, model } = getFastClient();
	const prompt = [
		"Score this sales lead. Use only the evidence. Be strict and consistent.",
		"fit (0-100): how well the lead's company, size, industry and need match what we sell.",
		"intent (0-100): buying intent: stated budget, a decision maker involved, an urgent timeline, a clear need, asking for price or proposal.",
		"risk (0-100): chance the deal is lost: objections, competitors, silence, missed promises, negative sentiment, no budget.",
		"Give 1-3 short reasons per score, each pointing at a concrete fact.",
		"",
		context.prompt,
		"",
		'Return JSON: {"fit": {"score": number, "reasons": string[]}, "intent": {...}, "risk": {...}, "summary": string (one sentence)}',
	].join("\n");
	const response = await ai.models.generateContent({
		model,
		contents: prompt,
		config: { responseMimeType: "application/json", temperature: 0 },
	});
	return jsonText.pipe(judgement).parse(response.text ?? "");
}

type HealthVerdict = { health: DealScore["health"]; reason: string };

function healthOf(
	stage: DealStage,
	context: DealContext,
	risk: number,
	leadScore: number,
	slaDays: number | undefined,
	overduePromises: number,
): HealthVerdict {
	if (stage === DealStage.CLOSED_WON)
		return { health: "won", reason: "Closed won" } satisfies HealthVerdict;
	if (stage === DealStage.CLOSED_LOST)
		return { health: "lost", reason: "Closed lost" } satisfies HealthVerdict;
	const last = context.lastInboundAt ?? context.lastOutboundAt;
	const silentDays = last ? (Date.now() - last.getTime()) / DAY_MS : null;
	if (slaDays !== undefined && silentDays !== null && silentDays > slaDays) {
		return {
			health: "stalled",
			reason: `No activity for ${Math.round(silentDays)} days (stage limit ${slaDays})`,
		} satisfies HealthVerdict;
	}
	if (overduePromises > 0) {
		return {
			health: "at_risk",
			reason: `${overduePromises} promise(s) overdue`,
		} satisfies HealthVerdict;
	}
	if (risk >= 60 || leadScore < 40) {
		return {
			health: "at_risk",
			reason: risk >= 60 ? "High loss risk" : "Low lead score",
		} satisfies HealthVerdict;
	}
	return {
		health: "on_track",
		reason: "Engaged and progressing",
	} satisfies HealthVerdict;
}

export async function scoreDeal(dealId: string): Promise<DealScore | null> {
	const [context, deal] = await Promise.all([
		loadDealContext(dealId),
		db.deal.findUnique({
			where: { id: dealId },
			select: { stage: true, leadScore: true, name: true },
		}),
	]);
	if (!context || !deal) return null;

	const [judged, slas, overduePromises] = await Promise.all([
		judge(context),
		readRevivalSlas(db),
		db.commitment.count({
			where: { dealId, status: "overdue" },
		}),
	]);
	const engagement = engagementOf(context);
	const w = ASSIST.score.weights;
	const leadScore = Math.round(
		Math.max(
			0,
			Math.min(
				100,
				judged.fit.score * w.fit +
					judged.intent.score * w.intent +
					engagement.score * w.engagement +
					(100 - judged.risk.score) * w.risk,
			),
		),
	);
	const { health, reason } = healthOf(
		deal.stage,
		context,
		judged.risk.score,
		leadScore,
		slas[deal.stage],
		overduePromises,
	);
	const base = STAGE_PROBABILITY[deal.stage];
	const winProbability =
		deal.stage === DealStage.CLOSED_WON || deal.stage === DealStage.CLOSED_LOST
			? base
			: Math.max(0.01, Math.min(0.95, base * (0.5 + leadScore / 100)));

	const factors: ScoreFactors = {
		fit: judged.fit,
		intent: judged.intent,
		engagement,
		risk: judged.risk,
		summary: judged.summary,
	};

	await db.deal.update({
		where: { id: dealId },
		data: {
			leadScore,
			leadScoreFactors: factors,
			leadScoredAt: new Date(),
			health,
			healthReason: reason,
			winProbability: Number(winProbability.toFixed(3)),
		},
	});

	const previous = deal.leadScore ?? 0;
	if (
		leadScore >= ASSIST.score.hotThreshold &&
		leadScore - previous >= ASSIST.score.hotJump
	) {
		await notify(db, {
			kind: "score.hot",
			title: `Hot lead: ${deal.name} scored ${leadScore}`,
			body: judged.summary,
			entity: "deal",
			entityId: dealId,
			source: "score",
			slack: true,
		});
	}

	return {
		dealId,
		leadScore,
		health,
		healthReason: reason,
		winProbability,
		factors,
	};
}

export async function scoreOpenDeals(onlyStale: boolean): Promise<number> {
	const staleBefore = new Date(Date.now() - ASSIST.score.staleAfterMs);
	const deals = await db.deal.findMany({
		where: {
			archivedAt: null,
			stage: { notIn: [DealStage.CLOSED_WON, DealStage.CLOSED_LOST] },
			OR: onlyStale
				? [{ leadScoredAt: null }, { leadScoredAt: { lt: staleBefore } }]
				: undefined,
		},
		select: { id: true },
		take: 100,
	});
	let scored = 0;
	for (let start = 0; start < deals.length; start += ASSIST.score.concurrency) {
		const batch = deals.slice(start, start + ASSIST.score.concurrency);
		const results = await Promise.allSettled(
			batch.map((deal) => scoreDeal(deal.id)),
		);
		for (const [index, result] of results.entries()) {
			if (result.status === "fulfilled" && result.value) scored += 1;
			if (result.status === "rejected") {
				console.error(`[score] ${batch[index]?.id}:`, result.reason);
			}
		}
	}
	return scored;
}

import { z } from "zod";

export const askInput = z.object({
	history: z
		.array(
			z.object({
				role: z.enum(["user", "assistant"]),
				text: z.string().trim().min(1).max(8_000),
			}),
		)
		.min(1)
		.max(30),
});

export const askOutput = z.object({
	answer: z.string(),
	tools: z.array(z.string()),
});

export const draftInput = z.object({
	dealId: z.string().min(1),
	channel: z.enum(["email", "whatsapp", "linkedin"]),
	goal: z.string().trim().max(500).nullable().optional(),
});

export const draftOutput = z.object({
	channel: z.enum(["email", "whatsapp", "linkedin"]),
	to: z.string().nullable(),
	subject: z.string().nullable(),
	body: z.string(),
	rationale: z.string(),
	personalization: z.array(z.string()),
	citations: z.array(z.object({ evidenceId: z.string(), quote: z.string() })),
	removedClaims: z.array(z.string()),
});

export const dealInput = z.object({ dealId: z.string().min(1) });

export const briefOutput = z.object({
	dealName: z.string(),
	summary: z.string(),
	goal: z.string(),
	talkingPoints: z.array(
		z.object({ point: z.string(), evidenceId: z.string().nullable() }),
	),
	questions: z.array(z.string()),
	objections: z.array(
		z.object({
			objection: z.string(),
			response: z.string(),
			evidenceId: z.string().nullable(),
		}),
	),
	openPromises: z.array(z.string()),
	risks: z.array(z.string()),
});

const factorPart = z.object({
	score: z.number(),
	reasons: z.array(z.string()),
});

export const scoreFactors = z.object({
	fit: factorPart,
	intent: factorPart,
	engagement: factorPart,
	risk: factorPart,
	summary: z.string(),
});

export const insightsOutput = z.object({
	leadScore: z.number().nullable(),
	factors: scoreFactors.nullable(),
	health: z.string().nullable(),
	healthReason: z.string().nullable(),
	winProbability: z.number().nullable(),
	scoredAt: z.string().nullable(),
	promises: z.array(
		z.object({
			id: z.string(),
			owner: z.string(),
			text: z.string(),
			dueAt: z.string().nullable(),
			status: z.string(),
			quote: z.string().nullable(),
		}),
	),
});

export const promiseListInput = z.object({
	status: z.enum(["open", "overdue", "kept", "dropped"]).nullable().optional(),
});

export const promiseListOutput = z.array(
	z.object({
		id: z.string(),
		owner: z.string(),
		text: z.string(),
		dueAt: z.string().nullable(),
		status: z.string(),
		quote: z.string().nullable(),
		dealId: z.string().nullable(),
		dealName: z.string().nullable(),
	}),
);

export const promiseUpdateInput = z.object({
	id: z.string().min(1),
	status: z.enum(["open", "kept", "dropped"]),
});

export const okOutput = z.object({ ok: z.boolean() });

export const rescoreAllOutput = z.object({ queued: z.boolean() });

const money = z.number();

export const forecastOutput = z.object({
	currency: z.string(),
	openDeals: z.number(),
	pipeline: money,
	weighted: money,
	wonThisMonth: money,
	stages: z.array(
		z.object({
			stage: z.string(),
			deals: z.number(),
			total: money,
			weighted: money,
		}),
	),
	months: z.array(
		z.object({ month: z.string(), weighted: money, deals: z.number() }),
	),
	health: z.object({
		on_track: z.number(),
		at_risk: z.number(),
		stalled: z.number(),
		unscored: z.number(),
	}),
	hotLeads: z.array(
		z.object({
			id: z.string(),
			name: z.string(),
			leadScore: z.number(),
			amount: money,
		}),
	),
	atRisk: z.array(
		z.object({
			id: z.string(),
			name: z.string(),
			health: z.string(),
			reason: z.string().nullable(),
			amount: money,
		}),
	),
	overduePromises: z.number(),
	unconverted: z.number(),
});

export const agentEnvelope = z.object({
	result: z.unknown().optional(),
	error: z.string().optional(),
});

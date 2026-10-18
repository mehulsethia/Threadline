const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

export const ASSIST = {
	context: {
		maxMessages: 40,
		maxEmailMessages: 20,
		maxCharactersPerMessage: 1_500,
		maxActivities: 20,
	},
	score: {
		weights: { fit: 0.25, intent: 0.35, engagement: 0.25, risk: 0.15 },
		hotThreshold: 75,
		hotJump: 15,
		engagementWindowMs: 14 * DAY_MS,
		staleAfterMs: 24 * HOUR_MS,
		concurrency: 4,
	},
	ask: {
		model: "gemini-2.5-flash",
		location: "us-central1",
		maxTurns: 12,
		maxToolCalls: 16,
		timeoutMs: 120_000,
		listLimit: 25,
	},
	commitments: { overdueGraceMs: 2 * HOUR_MS },
} as const;

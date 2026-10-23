const SECOND_MS = 1_000;

export const CONTEXT = {
	timeoutMs: 60 * SECOND_MS,
	verifyTimeoutMs: 15 * SECOND_MS,

	people: {
		matchFloor: 70,
		enrichCost: 2,
	},

	avatarHosts: ["brand.dev", "licdn.com"],

	rate: {
		maxConcurrent: 1,
		minGapMs: 0.3 * SECOND_MS,
		retries: 3,
		backoffMs: 2 * SECOND_MS,
		maxBackoffMs: 30 * SECOND_MS,
	},
} as const;

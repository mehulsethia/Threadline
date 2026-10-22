const SECOND_MS = 1000;

export const VOICE = {
	agent: {
		contextTimeoutMs: 30 * SECOND_MS,
		transcribeTimeoutMs: 150 * SECOND_MS,
		livePath: "/internal/voice/live",
	},
} as const;

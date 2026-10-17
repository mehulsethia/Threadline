const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export const CAPTURE = {
	batchDelayMs: 2 * 60 * 1000,
	email: {
		maxAgeMs: 30 * DAY_MS,
		maxMessages: 60,
		maxCharactersPerMessage: 6_000,
	},
	meet: {
		lookbackMs: 2 * DAY_MS,
		maxConferences: 10,
		maxEntries: 600,
		consumerDomains: ["gmail.com", "googlemail.com"],
		apiUrl: "https://meet.googleapis.com/v2",
	},
	slack: {
		backfillMs: DAY_MS,
		maxChannels: 20,
		maxMessages: 200,
		maxCharactersPerMessage: 4_000,
		requestTimeoutMs: 10_000,
	},
} as const;

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;

export const RECORDERS = {
	firstLookbackMs: 3 * DAY_MS,
	minIntervalMs: 55 * MINUTE_MS,
	overlapMs: 30 * MINUTE_MS,
	maxMeetingsPerRun: 20,
	requestTimeoutMs: 20_000,
	minSpeakers: 2,
	fireflies: { url: "https://api.fireflies.ai/graphql" },
	fathom: { url: "https://api.fathom.ai/external/v1/meetings" },
} as const;

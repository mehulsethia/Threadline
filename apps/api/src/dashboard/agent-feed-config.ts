const DAY_MS = 24 * 60 * 60 * 1000;

export const AGENT_FEED = {
	windowMs: 7 * DAY_MS,
	perSource: 8,
	maxItems: 20,
} as const;

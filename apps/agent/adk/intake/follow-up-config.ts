const SECOND_MS = 1000;

export const FOLLOW_UP = {
	timeoutMs: 60 * SECOND_MS,
	maxToolCalls: 6,
	lateCheckOffsetMs: 2 * 60 * 60 * SECOND_MS,
} as const;

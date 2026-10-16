const SECOND_MS = 1_000;
const MINUTE_MS = 60 * SECOND_MS;

export const AGENT_DISPATCH = {
	// Fire-and-forget, long enough to ride out an agent cold start on Cloud Run.
	poke: { timeoutMs: 30 * SECOND_MS },
	heartbeat: { everyMs: MINUTE_MS },
	cancel: {
		errorCode: "CANCELLED_BY_USER",
		message: "A workspace member stopped this run.",
		redeliverWithinMs: 10 * MINUTE_MS,
		redeliverBatch: 20,
	},
	fieldBackfill: { concurrency: 8 },
} as const;

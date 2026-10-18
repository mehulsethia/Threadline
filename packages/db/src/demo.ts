import type { Db } from "./client";

export const DEMO_USER_ID = "user-demo-judge";

/**
 * Daily caps on the paid (Gemini) actions the shared, public judge account can
 * start, so a curious visitor cannot drain the project's credit. Real members
 * are never limited.
 */
export const DEMO_DAILY_LIMITS = {
	intake: 40,
	voice: 25,
	revival: 20,
	assist: 80,
} as const;

export type DemoQuotaKind = keyof typeof DEMO_DAILY_LIMITS;

/** Counts one use; false when the judge account is over today's cap (UTC). */
export async function consumeDemoQuota(
	db: Db,
	userId: string | null | undefined,
	kind: DemoQuotaKind,
	now = new Date(),
): Promise<boolean> {
	if (userId !== DEMO_USER_ID) return true;

	const name = `demo-quota:${kind}:${now.toISOString().slice(0, 10)}`;
	const row = await db.telemetryCounter.upsert({
		where: { name },
		create: { name, count: 1 },
		update: { count: { increment: 1 } },
		select: { count: true },
	});
	return row.count <= DEMO_DAILY_LIMITS[kind];
}

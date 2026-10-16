/**
 * Production entrypoint for the agent service on Cloud Run.
 *
 * Threadline's hero flows (conversation intake and lead revival) are ADK
 * agents that run from the AgentTask queue's direct lane; they do not need the
 * eve runtime. `eve start` boots a full Nitro host whose memory grows past the
 * container limit on Cloud Run, so the service runs this worker instead: the
 * same bridge-authenticated `/internal/crm/dispatch` wake-up the API already
 * sends, draining the direct lane (intake, revival, brand, portrait, ...).
 *
 * The eve-only surfaces (the record "Agent" chat panel and custom agent runs)
 * stay available under `eve dev` locally.
 */
import { timingSafeEqual } from "node:crypto";
import { runVisibleLane } from "../agent/lib/dispatch";
import { reconcileStaleTasks } from "../agent/lib/stale-tasks";

const port = Number(process.env.PORT ?? process.env.AGENT_PORT ?? 2000);

// One drain at a time per instance; a wake-up during a drain just asks for
// another pass when the current one ends.
let draining: Promise<void> | null = null;
let again = false;

function authorised(request: Request): boolean {
	const secret = process.env.AGENT_BRIDGE_SECRET?.trim();
	if (!secret) return false;
	const header = request.headers.get("authorization") ?? "";
	if (!header.startsWith("Bearer ")) return false;
	const given = Buffer.from(header.slice("Bearer ".length));
	const expected = Buffer.from(secret);
	return given.length === expected.length && timingSafeEqual(given, expected);
}

async function drainOnce(): Promise<void> {
	await reconcileStaleTasks();
	// The lane handles a bounded batch per call; keep going while it finds work.
	for (let pass = 0; pass < 50; pass++) {
		if ((await runVisibleLane()) === 0) return;
	}
}

function drain(): void {
	if (draining) {
		again = true;
		return;
	}
	draining = (async () => {
		do {
			again = false;
			try {
				await drainOnce();
			} catch (error) {
				console.error("[worker] drain failed", error);
			}
		} while (again);
	})().finally(() => {
		draining = null;
	});
}

Bun.serve({
	port,
	hostname: process.env.AGENT_HOST ?? "0.0.0.0",
	// Revival cycles can run for minutes; the request itself returns at once.
	idleTimeout: 30,
	fetch(request) {
		const { pathname } = new URL(request.url);

		if (pathname === "/health") {
			return Response.json({ ok: true, draining: draining !== null });
		}

		if (pathname === "/internal/crm/dispatch" && request.method === "POST") {
			if (!authorised(request)) {
				return new Response("Unauthorized", { status: 401 });
			}
			drain();
			return new Response(null, { status: 202 });
		}

		if (pathname.startsWith("/internal/crm/")) {
			return Response.json(
				{ error: "Not available in the production worker." },
				{ status: 501 },
			);
		}

		return new Response("Not found", { status: 404 });
	},
});

console.log(`[worker] listening on :${port}`);
// Pick up anything queued while the service was scaled to zero.
drain();

import { timingSafeEqual } from "node:crypto";
import { forEachWorkspace } from "@crm/db/workspaces";
import { runVisibleLane } from "../agent/lib/dispatch";
import { reconcileStaleTasks } from "../agent/lib/stale-tasks";
import { handleAssist } from "./assist/routes";

const port = Number(process.env.PORT ?? process.env.AGENT_PORT ?? 2000);
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

async function drainWorkspace(): Promise<void> {
	await reconcileStaleTasks();
	for (let pass = 0; pass < 50; pass++) {
		if ((await runVisibleLane()) === 0) return;
	}
}

async function drainOnce(): Promise<void> {
	const results = await forEachWorkspace(drainWorkspace);
	for (const result of results) {
		if (result.error) {
			console.error(`[worker] ${result.workspaceId}: ${result.error}`);
		}
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
	idleTimeout: 120,
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

		if (
			pathname.startsWith("/internal/crm/assist/") &&
			request.method === "POST"
		) {
			if (!authorised(request)) {
				return new Response("Unauthorized", { status: 401 });
			}
			return request
				.text()
				.then((body) =>
					handleAssist(
						pathname.slice("/internal/crm/assist/".length),
						request.headers.get("x-crm-workspace"),
						body,
					),
				);
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
drain();

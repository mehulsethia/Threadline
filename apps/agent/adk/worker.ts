import { timingSafeEqual } from "node:crypto";
import { forEachWorkspace } from "@crm/db/workspaces";
import { runVisibleLane } from "../agent/lib/dispatch";
import { reconcileStaleTasks } from "../agent/lib/stale-tasks";
import { handleAssist } from "./assist/routes";
import { type LiveCall, startLiveCall } from "./voice/live";
import { handleVoice, knownWorkspace } from "./voice/routes";

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

type CallSocket = {
	workspaceId: string;
	dealId: string;
	call: LiveCall | null;
	queued: string[];
	closed: boolean;
};

async function upgradeCall(
	request: Request,
	server: Bun.Server<CallSocket>,
): Promise<Response | undefined> {
	if (!authorised(request)) {
		return new Response("Unauthorized", { status: 401 });
	}
	const dealId = new URL(request.url).searchParams.get("dealId");
	const workspaceId = await knownWorkspace(
		request.headers.get("x-crm-workspace"),
	);
	if (!dealId || !workspaceId) {
		return new Response("Missing deal or workspace", { status: 400 });
	}
	const upgraded = server.upgrade(request, {
		data: { workspaceId, dealId, call: null, queued: [], closed: false },
	});
	return upgraded ? undefined : new Response("Upgrade failed", { status: 400 });
}

Bun.serve<CallSocket>({
	port,
	hostname: process.env.AGENT_HOST ?? "0.0.0.0",
	idleTimeout: 120,
	websocket: {
		idleTimeout: 120,
		open(ws) {
			const peer = {
				send: (message: object) => {
					if (!ws.data.closed) ws.send(JSON.stringify(message));
				},
				close: () => {
					if (!ws.data.closed) ws.close();
				},
			};
			startLiveCall(ws.data.workspaceId, ws.data.dealId, peer)
				.then((call) => {
					if (ws.data.closed) {
						call.end();
						return;
					}
					ws.data.call = call;
					for (const raw of ws.data.queued.splice(0)) call.receive(raw);
				})
				.catch((error) => {
					const message =
						error instanceof Error ? error.message : String(error);
					console.error("[voice] call failed to start:", message);
					peer.send({ type: "error", message });
					peer.close();
				});
		},
		message(ws, message) {
			const raw = typeof message === "string" ? message : message.toString();
			if (ws.data.call) ws.data.call.receive(raw);
			else ws.data.queued.push(raw);
		},
		close(ws) {
			ws.data.closed = true;
			ws.data.call?.end();
		},
	},
	fetch(request, server) {
		const { pathname } = new URL(request.url);

		if (pathname === "/internal/voice/live") {
			return upgradeCall(request, server);
		}

		if (
			pathname.startsWith("/internal/crm/voice/") &&
			request.method === "POST"
		) {
			if (!authorised(request)) {
				return new Response("Unauthorized", { status: 401 });
			}
			return request
				.text()
				.then((body) =>
					handleVoice(
						pathname.slice("/internal/crm/voice/".length),
						request.headers.get("x-crm-workspace"),
						body,
					),
				);
		}

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

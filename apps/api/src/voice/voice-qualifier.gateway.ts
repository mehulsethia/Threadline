import type { IncomingMessage } from "node:http";
import type { Socket } from "node:net";
import { URL } from "node:url";
import { auth, env } from "@crm/auth";
import { runInWorkspace } from "@crm/db";
import { workspaceIdsForUser } from "@crm/db/workspaces";
import {
	Injectable,
	Logger,
	type OnApplicationBootstrap,
} from "@nestjs/common";
import { HttpAdapterHost } from "@nestjs/core";
import { fromNodeHeaders } from "better-auth/node";
import { WebSocket, WebSocketServer } from "ws";
import { agentHeaders, requireBridge } from "../agent/agent-call";
import { VOICE } from "./voice-config";
import { verifyVoiceTicket } from "./voice-ticket";

@Injectable()
export class VoiceQualifierGateway implements OnApplicationBootstrap {
	private readonly logger = new Logger(VoiceQualifierGateway.name);
	private wss: WebSocketServer | null = null;

	constructor(private readonly adapterHost: HttpAdapterHost) {}

	onApplicationBootstrap() {
		const server = this.adapterHost.httpAdapter?.getHttpServer();
		if (!server) {
			this.logger.warn("HTTP server not available for WebSocket gateway.");
			return;
		}

		this.wss = new WebSocketServer({ noServer: true });

		server.on(
			"upgrade",
			(req: IncomingMessage, socket: Socket, head: Buffer) => {
				const url = new URL(
					req.url || "",
					`http://${req.headers.host || "localhost"}`,
				);
				if (url.pathname === "/api/voice/live") {
					this.wss?.handleUpgrade(req, socket, head, (ws) => {
						this.wss?.emit("connection", ws, req);
					});
				}
			},
		);

		this.wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
			void this.handleConnection(ws, req);
		});

		this.logger.log(
			"Voice Qualifier WebSocket gateway initialized at /api/voice/live",
		);
	}

	/**
	 * Who is calling. A ticket from `voice.liveTicket` is the normal path; a
	 * session cookie also works when the socket shares the API's origin, but
	 * only from a trusted origin, so another site cannot ride the cookie.
	 */
	private async authenticate(
		req: IncomingMessage,
		url: URL,
		dealId: string,
	): Promise<string | null> {
		const ticket = url.searchParams.get("ticket");
		if (ticket) return verifyVoiceTicket(ticket, dealId)?.userId ?? null;

		const origin = req.headers.origin;
		if (!origin || !env.trustedOrigins.includes(origin)) return null;

		const session = await auth.api
			.getSession({ headers: fromNodeHeaders(req.headers) })
			.catch(() => null);
		return session?.user?.id ?? null;
	}

	private async handleConnection(ws: WebSocket, req: IncomingMessage) {
		const url = new URL(
			req.url || "",
			`http://${req.headers.host || "localhost"}`,
		);
		const dealId = url.searchParams.get("dealId");

		if (!dealId) {
			ws.send(
				JSON.stringify({
					type: "error",
					message: "dealId parameter is required.",
				}),
			);
			ws.close(1008, "dealId required");
			return;
		}

		try {
			const userId = await this.authenticate(req, url, dealId);
			const [workspace] = userId ? await workspaceIdsForUser(userId) : [];

			if (!workspace) {
				ws.send(
					JSON.stringify({
						type: "error",
						message: "Unauthorized: sign in to this workspace to start a call.",
					}),
				);
				ws.close(1008, "Unauthorized");
				return;
			}

			await runInWorkspace(workspace, () => this.startCall(ws, dealId));
		} catch (err: unknown) {
			this.logger.error("Connection handler failed", err);
			if (ws.readyState === WebSocket.OPEN) {
				ws.close(1011, "Internal error");
			}
		}
	}

	private async startCall(ws: WebSocket, dealId: string) {
		try {
			const agent = requireBridge();
			const target = agent.url(VOICE.agent.livePath);
			target.protocol = target.protocol === "https:" ? "wss:" : "ws:";
			target.searchParams.set("dealId", dealId);

			const upstream = new WebSocket(target, {
				headers: await agentHeaders(agent),
			});
			const pending: string[] = [];

			upstream.on("open", () => {
				for (const raw of pending.splice(0)) upstream.send(raw);
			});
			upstream.on("message", (data: WebSocket.RawData) => {
				if (ws.readyState === WebSocket.OPEN) ws.send(data.toString());
			});
			upstream.on("close", () => {
				if (ws.readyState === WebSocket.OPEN) ws.close();
			});
			upstream.on("error", (error) => {
				this.logger.error(
					{ message: "Agent call socket failed", dealId },
					error.stack,
				);
				if (ws.readyState === WebSocket.OPEN) {
					ws.send(
						JSON.stringify({
							type: "error",
							message: "The call service is not reachable.",
						}),
					);
					ws.close(1011, "Agent unreachable");
				}
			});

			ws.on("message", (data: WebSocket.RawData) => {
				const raw = data.toString();
				if (upstream.readyState === WebSocket.OPEN) upstream.send(raw);
				else if (upstream.readyState === WebSocket.CONNECTING) {
					pending.push(raw);
				}
			});
			ws.on("close", () => {
				if (
					upstream.readyState === WebSocket.OPEN ||
					upstream.readyState === WebSocket.CONNECTING
				) {
					upstream.close();
				}
			});
		} catch (err: unknown) {
			const message = err instanceof Error ? err.message : String(err);
			this.logger.error(
				{ message: "Call relay failed to start", dealId },
				err instanceof Error ? err.stack : message,
			);
			if (ws.readyState === WebSocket.OPEN) {
				ws.send(JSON.stringify({ type: "error", message }));
				ws.close(1011, "Relay failed");
			}
		}
	}
}

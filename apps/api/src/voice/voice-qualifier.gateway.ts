import type { IncomingMessage } from "node:http";
import type { Socket } from "node:net";
import { URL } from "node:url";
import { auth, WORKSPACE_ID } from "@crm/auth";
import type { Db } from "@crm/db";
import {
	Injectable,
	Logger,
	type OnApplicationBootstrap,
} from "@nestjs/common";
import { HttpAdapterHost } from "@nestjs/core";
import { fromNodeHeaders } from "better-auth/node";
import { WebSocket, WebSocketServer } from "ws";
import { InjectDatabase } from "../database/database.constants";
import {
	type LiveSessionBridge,
	VoiceQualifierService,
} from "./voice-qualifier.service";

@Injectable()
export class VoiceQualifierGateway implements OnApplicationBootstrap {
	private readonly logger = new Logger(VoiceQualifierGateway.name);
	private wss: WebSocketServer | null = null;

	constructor(
		private readonly adapterHost: HttpAdapterHost,
		@InjectDatabase() private readonly db: Db,
		private readonly voiceService: VoiceQualifierService,
	) {}

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

		let orgId: string | undefined;
		const isProd = process.env.NODE_ENV === "production";

		try {
			const session = await auth.api
				.getSession({ headers: fromNodeHeaders(req.headers) })
				.catch(() => null);

			if (session?.user?.id) {
				const member = await this.db.member.findFirst({
					where: { userId: session.user.id },
					select: { organizationId: true },
				});
				orgId = member?.organizationId || WORKSPACE_ID;
			} else if (!isProd) {
				const org = await this.db.organization.findFirst({
					where: { id: WORKSPACE_ID },
					select: { id: true },
				});
				orgId = org?.id || WORKSPACE_ID;
			} else {
				ws.send(
					JSON.stringify({
						type: "error",
						message: "Unauthorized: Active session required.",
					}),
				);
				ws.close(1008, "Unauthorized");
				return;
			}

			const context = await this.voiceService.getDealContext(dealId, orgId);

			ws.send(
				JSON.stringify({
					type: "connected",
					dealId: context.dealId,
					dealName: context.dealName,
					leadName: context.leadName,
					language: context.language,
					missingCategories: context.missingCategories,
					qualificationScore: context.qualificationScore,
					currentStage: context.currentStage,
					proposedStage: context.proposedStage,
				}),
			);

			let liveSession: LiveSessionBridge | null = null;

			liveSession = await this.voiceService.createLiveSession({
				context,
				onAudioChunk: (pcmBase64) => {
					if (ws.readyState === WebSocket.OPEN) {
						ws.send(JSON.stringify({ type: "audio", pcm: pcmBase64 }));
					}
				},
				onTranscript: (turn) => {
					if (ws.readyState === WebSocket.OPEN) {
						ws.send(
							JSON.stringify({
								type: "transcript",
								role: turn.role,
								text: turn.text,
							}),
						);
					}
				},
				onFactProposed: (fact) => {
					if (ws.readyState === WebSocket.OPEN) {
						ws.send(
							JSON.stringify({
								type: "fact_proposed",
								category: fact.category,
								fact: fact.fact,
								quote: fact.quote,
								proposedScore: fact.proposedScore,
								proposedStage: fact.proposedStage,
							}),
						);
					}
				},
				onClose: (reason) => {
					if (ws.readyState === WebSocket.OPEN) {
						ws.send(JSON.stringify({ type: "call_ended", reason }));
						ws.close();
					}
				},
			});

			ws.on("message", (data: WebSocket.RawData) => {
				try {
					const msg = JSON.parse(data.toString()) as {
						type: string;
						pcm?: string;
						text?: string;
					};

					if (msg.type === "audio" && msg.pcm && liveSession) {
						if (typeof liveSession.sendRealtimeInput === "function") {
							liveSession.sendRealtimeInput({
								media: {
									mimeType: "audio/pcm;rate=16000",
									data: msg.pcm,
								},
							});
						}
					} else if (msg.type === "text" && msg.text && liveSession) {
						if (typeof liveSession.sendClientContent === "function") {
							liveSession.sendClientContent({
								turns: [
									{
										role: "user",
										parts: [{ text: msg.text }],
									},
								],
							});
						}
					} else if (msg.type === "end_call") {
						if (liveSession && typeof liveSession.close === "function") {
							try {
								liveSession.close();
							} catch {}
						}
						ws.send(
							JSON.stringify({ type: "call_ended", reason: "user_ended" }),
						);
						ws.close();
					}
				} catch (err) {
					this.logger.error("Error processing client WebSocket message", err);
				}
			});

			ws.on("close", () => {
				if (liveSession && typeof liveSession.close === "function") {
					try {
						liveSession.close();
					} catch {}
				}
			});
		} catch (err: unknown) {
			this.logger.error("Connection handler failed", err);
			const message = err instanceof Error ? err.message : String(err);
			if (ws.readyState === WebSocket.OPEN) {
				ws.send(
					JSON.stringify({
						type: "error",
						message,
					}),
				);
				ws.close(1011, message);
			}
		}
	}
}

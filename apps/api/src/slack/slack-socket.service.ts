import { jsonText } from "@crm/validation/json-text";
import {
	Injectable,
	Logger,
	type OnModuleDestroy,
	type OnModuleInit,
} from "@nestjs/common";
import {
	slackBlockActionPayload,
	slackSocketEnvelope,
} from "./slack.contracts";
import { SlackRevivalService } from "./slack-revival.service";

@Injectable()
export class SlackSocketService implements OnModuleInit, OnModuleDestroy {
	private readonly logger = new Logger(SlackSocketService.name);
	private ws: WebSocket | null = null;
	private reconnectTimer: NodeJS.Timeout | null = null;
	private destroyed = false;

	constructor(private readonly revival: SlackRevivalService) {}

	async onModuleInit() {
		const appToken = process.env.SLACK_APP_TOKEN;
		const isProd = process.env.NODE_ENV === "production";

		if (isProd || !appToken) {
			this.logger.log(
				"Slack Socket Mode is inactive (production or SLACK_APP_TOKEN omitted).",
			);
			return;
		}

		this.logger.log(
			"Starting Slack Socket Mode client for local development...",
		);
		await this.connect(appToken);
	}

	onModuleDestroy() {
		this.destroyed = true;
		if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
		if (this.ws) {
			try {
				this.ws.close();
			} catch {}
			this.ws = null;
		}
	}

	private async connect(appToken: string) {
		if (this.destroyed) return;

		try {
			const res = await fetch("https://slack.com/api/apps.connections.open", {
				method: "POST",
				headers: {
					authorization: `Bearer ${appToken}`,
					"content-type": "application/x-www-form-urlencoded",
				},
			});

			const data = (await res.json()) as {
				ok: boolean;
				url?: string;
				error?: string;
			};
			if (!data.ok || !data.url) {
				this.logger.warn(
					`Could not open Slack Socket Mode connection: ${data.error}`,
				);
				this.scheduleReconnect(appToken);
				return;
			}

			this.ws = new WebSocket(data.url);

			this.ws.onopen = () => {
				this.logger.log("Slack Socket Mode connected successfully.");
			};

			this.ws.onmessage = async (event) => {
				try {
					const envelope = jsonText
						.pipe(slackSocketEnvelope)
						.safeParse(String(event.data));
					if (!envelope.success) return;
					const message = envelope.data;

					if (message.envelope_id && this.ws?.readyState === WebSocket.OPEN) {
						this.ws.send(JSON.stringify({ envelope_id: message.envelope_id }));
					}

					if (message.type === "interactive") {
						const action = slackBlockActionPayload.safeParse(message.payload);
						if (action.success) {
							await this.revival.handleBlockAction(action.data);
						}
					}
				} catch (err) {
					this.logger.error("Error processing Slack socket message", err);
				}
			};

			this.ws.onerror = (err) => {
				this.logger.warn(`Slack Socket Mode error: ${String(err)}`);
			};

			this.ws.onclose = () => {
				this.logger.log("Slack Socket Mode connection closed.");
				this.scheduleReconnect(appToken);
			};
		} catch (err) {
			this.logger.warn(`Failed to connect Slack Socket Mode: ${String(err)}`);
			this.scheduleReconnect(appToken);
		}
	}

	private scheduleReconnect(appToken: string) {
		if (this.destroyed) return;
		if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
		this.reconnectTimer = setTimeout(() => {
			void this.connect(appToken);
		}, 10000);
	}
}

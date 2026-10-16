import { WORKSPACE_ID } from "@crm/auth";
import type { Db } from "@crm/db";
import {
	BadRequestException,
	Body,
	Controller,
	Get,
	Headers,
	HttpCode,
	HttpStatus,
	Logger,
	Post,
	Query,
	Req,
	Res,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { InjectDatabase } from "../database/database.constants";
import {
	encryptToken,
	signSlackState,
	verifySlackSignature,
	verifySlackState,
} from "./slack-crypto";
import { SlackRevivalService } from "./slack-revival.service";

const BOT_SCOPES = [
	"chat:write",
	"chat:write.public",
	"channels:read",
	"channels:join",
	"groups:read",
	"im:read",
	"mpim:read",
	"users:read",
	"users:read.email",
].join(",");

const USER_SCOPES = ["channels:read", "groups:read"].join(",");

@Controller("slack")
export class SlackController {
	private readonly logger = new Logger(SlackController.name);

	constructor(
		@InjectDatabase() private readonly db: Db,
		private readonly revival: SlackRevivalService,
	) {}

	@Get("install")
	async install(
		@Query("slug") slug: string | undefined,
		@Query("orgId") orgId: string | undefined,
		@Res() res: Response,
	) {
		const clientId = process.env.SLACK_CLIENT_ID;
		if (!clientId) {
			throw new BadRequestException("SLACK_CLIENT_ID is not configured.");
		}

		const apiUrl = process.env.API_URL || "http://localhost:3001";
		const redirectUri = `${apiUrl}/api/slack/oauth/callback`;
		const targetOrgId = orgId || WORKSPACE_ID;

		const state = signSlackState({
			orgId: targetOrgId,
			userId: "installer",
			slug: slug || "threadline",
			timestamp: Date.now(),
		});

		const authorizeUrl = new URL("https://slack.com/oauth/v2/authorize");
		authorizeUrl.searchParams.set("client_id", clientId);
		authorizeUrl.searchParams.set("scope", BOT_SCOPES);
		authorizeUrl.searchParams.set("user_scope", USER_SCOPES);
		authorizeUrl.searchParams.set("state", state);
		authorizeUrl.searchParams.set("redirect_uri", redirectUri);

		res.redirect(authorizeUrl.toString());
	}

	@Get("oauth/callback")
	async oauthCallback(
		@Query("code") code: string | undefined,
		@Query("state") stateStr: string | undefined,
		@Query("error") error: string | undefined,
		@Res() res: Response,
	) {
		const appUrl = process.env.APP_URL || "http://localhost:3000";

		if (error || !code || !stateStr) {
			this.logger.warn(`Slack OAuth error or cancelled: ${error}`);
			return res.redirect(
				`${appUrl}/settings/connections/slack?error=${error || "missing_code"}`,
			);
		}

		const state = verifySlackState(stateStr);
		if (!state) {
			this.logger.warn("Invalid or expired Slack OAuth state.");
			return res.redirect(
				`${appUrl}/settings/connections/slack?error=invalid_state`,
			);
		}

		const clientId = process.env.SLACK_CLIENT_ID;
		const clientSecret = process.env.SLACK_CLIENT_SECRET;
		const apiUrl = process.env.API_URL || "http://localhost:3001";
		const redirectUri = `${apiUrl}/api/slack/oauth/callback`;

		if (!clientId || !clientSecret) {
			throw new BadRequestException("Slack client credentials not configured.");
		}

		const tokenResponse = await fetch("https://slack.com/api/oauth.v2.access", {
			method: "POST",
			headers: { "content-type": "application/x-www-form-urlencoded" },
			body: new URLSearchParams({
				client_id: clientId,
				client_secret: clientSecret,
				code,
				redirect_uri: redirectUri,
			}),
		});

		const tokenData = (await tokenResponse.json()) as {
			ok: boolean;
			error?: string;
			team?: { id: string; name: string };
			authed_user?: { id: string; access_token?: string; scope?: string };
			access_token?: string;
			bot_user_id?: string;
		};

		if (!tokenData.ok || !tokenData.team?.id || !tokenData.access_token) {
			this.logger.error(
				`Slack access token exchange failed: ${tokenData.error}`,
			);
			return res.redirect(
				`${appUrl}/${state.slug || "default"}/settings/connections/slack?error=${tokenData.error || "exchange_failed"}`,
			);
		}

		const teamId = tokenData.team.id;
		const teamName = tokenData.team.name;
		const botUserId = tokenData.bot_user_id ?? null;
		const encryptedBotToken = encryptToken(tokenData.access_token);
		const userToken = tokenData.authed_user?.access_token ?? null;
		const userScopes = tokenData.authed_user?.scope ?? "";
		const installerId = tokenData.authed_user?.id || `inst_${state.orgId}`;

		await this.db.slackInstallation.upsert({
			where: { installerId },
			create: {
				installerId,
				organizationId: state.orgId,
				teamId,
				teamName,
				botUserId,
				botToken: encryptedBotToken,
				userToken,
				userScopes,
				installedBy: state.userId,
				installedAt: new Date(),
			},
			update: {
				organizationId: state.orgId,
				teamId,
				teamName,
				botUserId,
				botToken: encryptedBotToken,
				userToken,
				userScopes,
				installedBy: state.userId,
				installedAt: new Date(),
			},
		});

		return res.redirect(
			`${appUrl}/${state.slug || "default"}/settings/connections/slack?installed=true`,
		);
	}

	@Post("events")
	@HttpCode(HttpStatus.OK)
	async events(
		@Body() body: Record<string, unknown>,
		@Headers("x-slack-request-timestamp") timestamp: string | undefined,
		@Headers("x-slack-signature") signature: string | undefined,
		@Req() req: Request & { rawBody?: string },
	) {
		if (body?.type === "url_verification") {
			return { challenge: body.challenge };
		}

		const signingSecret = process.env.SLACK_SIGNING_SECRET;
		if (signingSecret && timestamp && signature) {
			const rawBody = req.rawBody || JSON.stringify(body);
			const valid = verifySlackSignature({
				signingSecret,
				timestamp,
				body: rawBody,
				signature,
			});
			if (!valid) {
				throw new BadRequestException("Invalid Slack event signature.");
			}
		}

		return { ok: true };
	}

	@Post("interactivity")
	@HttpCode(HttpStatus.OK)
	async interactivity(
		@Body() body: Record<string, unknown>,
		@Headers("x-slack-request-timestamp") timestamp: string | undefined,
		@Headers("x-slack-signature") signature: string | undefined,
		@Req() req: Request & { rawBody?: string },
	) {
		const signingSecret = process.env.SLACK_SIGNING_SECRET;
		if (signingSecret && timestamp && signature) {
			const rawBody = req.rawBody || req.body?.toString?.() || "";
			const valid = verifySlackSignature({
				signingSecret,
				timestamp,
				body: rawBody,
				signature,
			});
			if (!valid) {
				this.logger.warn(
					"Rejected Slack interactivity with invalid signature.",
				);
			}
		}

		const payloadStr =
			typeof body?.payload === "string" ? body.payload : JSON.stringify(body);
		try {
			const payload = JSON.parse(payloadStr);
			if (payload.type === "block_actions") {
				await this.revival.handleBlockAction(payload);
			}
		} catch (err) {
			this.logger.error("Error handling Slack interactivity", err);
		}

		return { ok: true };
	}
}

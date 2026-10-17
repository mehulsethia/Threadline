import { auth, WORKSPACE_ID } from "@crm/auth";
import type { Db } from "@crm/db";
import { jsonText } from "@crm/validation/json-text";
import {
	BadRequestException,
	Controller,
	ForbiddenException,
	Get,
	Headers,
	HttpCode,
	HttpStatus,
	Logger,
	Post,
	Query,
	Req,
	Res,
	ServiceUnavailableException,
	UnauthorizedException,
} from "@nestjs/common";
import { AllowAnonymous } from "@thallesp/nestjs-better-auth";
import { fromNodeHeaders } from "better-auth/node";
import type { Request, Response } from "express";
import { InjectDatabase } from "../database/database.constants";
import { slackBlockActionPayload, slackEventBody } from "./slack.contracts";
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

type SlackWebhookRequest = Request & { rawBody?: string };

/** Slack's OAuth redirect lands here, so it must be the API's public URL. */
function slackRedirectUri(): string {
	const apiUrl = process.env.API_URL || "http://localhost:3001";
	return `${apiUrl}/api/slack/oauth/callback`;
}

@Controller("api/slack")
export class SlackController {
	private readonly logger = new Logger(SlackController.name);

	constructor(
		@InjectDatabase() private readonly db: Db,
		private readonly revival: SlackRevivalService,
	) {}

	/**
	 * Every Slack webhook must carry a valid signature from this app's signing
	 * secret. Without a configured secret the endpoints refuse all traffic.
	 */
	private assertSlackSignature(
		req: SlackWebhookRequest,
		timestamp: string | undefined,
		signature: string | undefined,
	): void {
		const signingSecret = process.env.SLACK_SIGNING_SECRET;
		if (!signingSecret) {
			throw new ServiceUnavailableException(
				"SLACK_SIGNING_SECRET is not configured.",
			);
		}
		if (
			!timestamp ||
			!signature ||
			req.rawBody === undefined ||
			!verifySlackSignature({
				signingSecret,
				timestamp,
				body: req.rawBody,
				signature,
			})
		) {
			this.logger.warn(
				"Rejected Slack request with a missing or bad signature.",
			);
			throw new UnauthorizedException("Invalid Slack signature.");
		}
	}

	@Get("install")
	async install(
		@Query("slug") slug: string | undefined,
		@Req() req: Request,
		@Res() res: Response,
	) {
		const clientId = process.env.SLACK_CLIENT_ID;
		if (!clientId) {
			throw new BadRequestException("SLACK_CLIENT_ID is not configured.");
		}

		// The workspace being connected comes from the signed-in member, never
		// from the query string.
		const session = await auth.api
			.getSession({ headers: fromNodeHeaders(req.headers) })
			.catch(() => null);
		if (!session?.user?.id) {
			throw new UnauthorizedException("Sign in to connect Slack.");
		}
		const member = await this.db.member.findUnique({
			where: {
				organizationId_userId: {
					organizationId: WORKSPACE_ID,
					userId: session.user.id,
				},
			},
			select: { organizationId: true },
		});
		if (!member) {
			throw new ForbiddenException("Only workspace members can connect Slack.");
		}

		const redirectUri = slackRedirectUri();
		const state = signSlackState({
			orgId: member.organizationId,
			userId: session.user.id,
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

	// Slack calls this, not a signed-in browser; the signed state / request
	// signature is the authentication.
	@AllowAnonymous()
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
				`${appUrl}/?slack_error=${encodeURIComponent(error || "missing_code")}`,
			);
		}

		const state = verifySlackState(stateStr);
		if (!state) {
			this.logger.warn("Invalid or expired Slack OAuth state.");
			return res.redirect(`${appUrl}/?slack_error=invalid_state`);
		}

		const clientId = process.env.SLACK_CLIENT_ID;
		const clientSecret = process.env.SLACK_CLIENT_SECRET;
		const redirectUri = slackRedirectUri();

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

	// Slack calls this, not a signed-in browser; the signed state / request
	// signature is the authentication.
	@AllowAnonymous()
	@Post("events")
	@HttpCode(HttpStatus.OK)
	async events(
		@Headers("x-slack-request-timestamp") timestamp: string | undefined,
		@Headers("x-slack-signature") signature: string | undefined,
		@Req() req: SlackWebhookRequest,
	) {
		// Slack signs the url_verification handshake too, so it is checked
		// like every other event.
		this.assertSlackSignature(req, timestamp, signature);

		const body = jsonText.pipe(slackEventBody).safeParse(req.rawBody ?? "");
		if (!body.success) {
			throw new BadRequestException("Malformed Slack event.");
		}
		if (body.data.type === "url_verification") {
			return { challenge: body.data.challenge };
		}

		return { ok: true };
	}

	// Slack calls this, not a signed-in browser; the signed state / request
	// signature is the authentication.
	@AllowAnonymous()
	@Post("interactivity")
	@HttpCode(HttpStatus.OK)
	async interactivity(
		@Headers("x-slack-request-timestamp") timestamp: string | undefined,
		@Headers("x-slack-signature") signature: string | undefined,
		@Req() req: SlackWebhookRequest,
	) {
		this.assertSlackSignature(req, timestamp, signature);

		const payloadStr = new URLSearchParams(req.rawBody ?? "").get("payload");
		if (!payloadStr) {
			throw new BadRequestException("Missing Slack interactivity payload.");
		}
		// Other interaction types (shortcuts, view submissions) are not used.
		const action = jsonText.pipe(slackBlockActionPayload).safeParse(payloadStr);
		if (!action.success) return { ok: true };
		try {
			await this.revival.handleBlockAction(action.data);
		} catch (err) {
			this.logger.error("Error handling Slack interactivity", err);
		}

		return { ok: true };
	}
}

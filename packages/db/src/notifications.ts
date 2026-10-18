import { createDecipheriv, createHash } from "node:crypto";
import type { Db } from "./client";
import { workspaceId } from "./workspace";

export type NotificationEntity = "contact" | "deal" | "company";

export type NotificationSource =
	| "email"
	| "calendar"
	| "slack"
	| "meeting"
	| "whatsapp"
	| "voice"
	| "upload"
	| "revival"
	| "research"
	| "form"
	| "score"
	| "promise";

export type NotifyInput = {
	kind: string;
	title: string;
	body?: string;
	entity?: NotificationEntity;
	entityId?: string;
	source?: NotificationSource;
	slack?: boolean;
};

export async function notify(db: Db, input: NotifyInput): Promise<void> {
	try {
		await db.notification.create({
			data: {
				kind: input.kind,
				title: input.title,
				body: input.body,
				entity: input.entity,
				entityId: input.entityId,
				source: input.source,
			},
		});
	} catch (error) {
		console.error("[notify] could not record notification", error);
	}

	if (input.slack) {
		await postSlackAlert(
			db,
			input.body ? `*${input.title}*\n${input.body}` : `*${input.title}*`,
		);
	}
}

function slackKey(): Buffer | null {
	const secret =
		process.env.SLACK_STATE_SECRET || process.env.BETTER_AUTH_SECRET;
	return secret ? createHash("sha256").update(secret).digest() : null;
}

export function decryptSlackToken(stored: string): string | null {
	const parts = stored.split(":");
	if (parts.length !== 3) return stored;
	const [iv, tag, content] = parts;
	const key = slackKey();
	if (!key || !iv || !tag || !content) return null;
	try {
		const decipher = createDecipheriv(
			"aes-256-gcm",
			key,
			Buffer.from(iv, "hex"),
		);
		decipher.setAuthTag(Buffer.from(tag, "hex"));
		return decipher.update(content, "hex", "utf8") + decipher.final("utf8");
	} catch {
		return null;
	}
}

export async function slackInstallation(
	db: Db,
): Promise<{ token: string; channel: string | null; teamId: string } | null> {
	const install = await db.slackInstallation.findFirst({
		where: {
			OR: [{ organizationId: workspaceId() }, { organizationId: null }],
		},
		orderBy: { createdAt: "desc" },
	});
	const token = install?.botToken
		? decryptSlackToken(install.botToken)
		: process.env.NODE_ENV === "production"
			? null
			: (process.env.SLACK_BOT_TOKEN ?? null);
	if (!token) return null;
	return {
		token,
		channel: install?.alertsChannelId ?? null,
		teamId: install?.teamId ?? "",
	};
}

async function postSlackAlert(db: Db, text: string): Promise<void> {
	try {
		const install = await slackInstallation(db);
		if (!install?.channel) return;
		await fetch("https://slack.com/api/chat.postMessage", {
			method: "POST",
			headers: {
				authorization: `Bearer ${install.token}`,
				"content-type": "application/json; charset=utf-8",
			},
			body: JSON.stringify({ channel: install.channel, text }),
			signal: AbortSignal.timeout(10_000),
		});
	} catch (error) {
		console.error("[notify] Slack alert failed", error);
	}
}

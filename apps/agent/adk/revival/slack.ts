import { createDecipheriv, createHash } from "node:crypto";
import { db, formatDealStage } from "@crm/db";
import { workspaceId } from "@crm/db/workspace";
import { citedEvidenceList } from "@crm/validation/cited-evidence";

function decryptBotToken(encryptedPayload: string): string {
	const parts = encryptedPayload.split(":");
	if (parts.length !== 3) return encryptedPayload;
	const [ivHex, tagHex, contentHex] = parts;
	const secret =
		process.env.SLACK_STATE_SECRET || process.env.BETTER_AUTH_SECRET;
	if (!secret) {
		throw new Error("SLACK_STATE_SECRET or BETTER_AUTH_SECRET must be set.");
	}
	const key = createHash("sha256").update(secret).digest();
	const iv = Buffer.from(ivHex as string, "hex");
	const tag = Buffer.from(tagHex as string, "hex");
	const decipher = createDecipheriv("aes-256-gcm", key, iv);
	decipher.setAuthTag(tag);
	let decrypted = decipher.update(contentHex as string, "hex", "utf8");
	decrypted += decipher.final("utf8");
	return decrypted;
}

export async function postDraftToSlack(draftId: string): Promise<{
	posted: boolean;
	ts?: string;
	channel?: string;
	reason?: string;
}> {
	const draft = await db.outboundDraft.findUnique({
		where: { id: draftId },
		include: {
			deal: { include: { company: true } },
			contact: true,
		},
	});

	if (!draft) {
		return { posted: false, reason: `Draft ${draftId} not found.` };
	}

	const install = await db.slackInstallation.findFirst({
		where: {
			OR: [{ organizationId: workspaceId() }, { organizationId: null }],
		},
		orderBy: { createdAt: "desc" },
	});

	// The env token is a local Socket Mode convenience; in production a
	// workspace posts only through its own OAuth installation.
	let botToken =
		process.env.NODE_ENV === "production"
			? undefined
			: process.env.SLACK_BOT_TOKEN;
	if (install?.botToken) {
		try {
			botToken = decryptBotToken(install.botToken);
		} catch {
			botToken = install.botToken;
		}
	}

	if (!botToken) {
		return { posted: false, reason: "No Slack bot token available." };
	}

	// Only the channel an admin picked in settings; never a guessed one.
	const channel = install?.alertsChannelId;
	if (!channel) {
		return {
			posted: false,
			reason: "No Slack alerts channel selected in settings.",
		};
	}

	const quotes = citedEvidenceList
		.parse(draft.citedEvidence)
		.map((item) => item.quote);

	const quotedDraft = draft.draftText
		.split("\n")
		.map((line) => `> ${line}`)
		.join("\n");

	const blocks: unknown[] = [
		{
			type: "header",
			text: {
				type: "plain_text",
				text: "🎯 Lead Revival Draft Ready for Review",
				emoji: true,
			},
		},
		{
			type: "section",
			fields: [
				{
					type: "mrkdwn",
					text: `*Lead:*\n${draft.contact.firstName} ${draft.contact.lastName || ""} (${draft.contact.phone || draft.contact.email || "No contact info"})`,
				},
				{
					type: "mrkdwn",
					text: `*Deal:*\n${draft.deal.name}`,
				},
				{
					type: "mrkdwn",
					text: `*Stage:*\n${formatDealStage(draft.deal.stage)}`,
				},
				{
					type: "mrkdwn",
					text: `*Channel:*\n\`${draft.channel}\` (${draft.language.toUpperCase()})`,
				},
			],
		},
		{
			type: "section",
			text: {
				type: "mrkdwn",
				text: `*Stalled Reason:*\n${draft.stalledReason || "Deal exceeded stage inactivity SLA"}`,
			},
		},
		{
			type: "section",
			text: {
				type: "mrkdwn",
				text: `*Draft Message:*\n${quotedDraft}`,
			},
		},
	];

	if (quotes.length > 0) {
		blocks.push({
			type: "context",
			elements: [
				{
					type: "mrkdwn",
					text: `*Cited Evidence Quotes:*\n${quotes
						.slice(0, 4)
						.map((q) => `• "${q}"`)
						.join("\n")}`,
				},
			],
		});
	}

	blocks.push({
		type: "actions",
		block_id: `draft_actions_${draft.id}`,
		elements: [
			{
				type: "button",
				text: {
					type: "plain_text",
					text: "Approve & Send",
					emoji: true,
				},
				style: "primary",
				action_id: "draft_approve",
				value: draft.id,
			},
			{
				type: "button",
				text: {
					type: "plain_text",
					text: "Edit Draft",
					emoji: true,
				},
				action_id: "draft_edit",
				value: draft.id,
			},
			{
				type: "button",
				text: {
					type: "plain_text",
					text: "Reject",
					emoji: true,
				},
				style: "danger",
				action_id: "draft_reject",
				value: draft.id,
			},
		],
	});

	try {
		const response = await fetch("https://slack.com/api/chat.postMessage", {
			method: "POST",
			headers: {
				authorization: `Bearer ${botToken}`,
				"content-type": "application/json; charset=utf-8",
			},
			body: JSON.stringify({
				channel,
				text: `Lead Revival Draft: ${draft.contact.firstName} (${draft.deal.name})`,
				blocks,
			}),
		});

		const data = (await response.json()) as {
			ok: boolean;
			ts?: string;
			error?: string;
		};

		if (!data.ok || !data.ts) {
			return { posted: false, reason: data.error || "Slack API call failed" };
		}

		await db.outboundDraft.update({
			where: { id: draft.id },
			data: {
				slackMessageTs: data.ts,
				slackChannelId: channel,
			},
		});

		return {
			posted: true,
			ts: data.ts,
			channel,
		};
	} catch (err) {
		return {
			posted: false,
			reason: err instanceof Error ? err.message : String(err),
		};
	}
}

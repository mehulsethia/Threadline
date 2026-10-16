import { createDecipheriv, createHash } from "node:crypto";
import { db, formatDealStage } from "@crm/db";

function decryptBotToken(encryptedPayload: string): string {
	const parts = encryptedPayload.split(":");
	if (parts.length !== 3) return encryptedPayload;
	const [ivHex, tagHex, contentHex] = parts;
	const secret =
		process.env.SLACK_STATE_SECRET ||
		process.env.BETTER_AUTH_SECRET ||
		"default-secret-key-32-chars-long!!";
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
		orderBy: { createdAt: "desc" },
	});

	let botToken = process.env.SLACK_BOT_TOKEN;
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

	let channel = install?.alertsChannelId;
	if (!channel) {
		try {
			const res = await fetch(
				"https://slack.com/api/conversations.list?types=public_channel,private_channel&limit=100",
				{ headers: { authorization: `Bearer ${botToken}` } },
			);
			const data = (await res.json()) as {
				ok: boolean;
				channels?: Array<{ id: string; name: string }>;
			};
			if (data.ok && data.channels) {
				const threadlineDeals = data.channels.find(
					(c) => c.name === "threadline-deals" || c.name === "deals",
				);
				channel = threadlineDeals?.id || data.channels[0]?.id;
			}
		} catch {}
	}

	if (!channel) {
		return { posted: false, reason: "No destination channel found in Slack." };
	}

	const quotes: string[] = [];
	if (Array.isArray(draft.citedEvidence)) {
		for (const item of draft.citedEvidence) {
			if (typeof item === "object" && item && "quote" in item) {
				quotes.push(String((item as { quote: unknown }).quote));
			}
		}
	}

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

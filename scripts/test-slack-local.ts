import { db } from "../packages/db/src";
import { encryptToken } from "../apps/api/src/slack/slack-crypto";
import { SlackRevivalService } from "../apps/api/src/slack/slack-revival.service";
import { Logger } from "@nestjs/common";

async function main() {
	const botToken = process.env.SLACK_BOT_TOKEN;
	const appToken = process.env.SLACK_APP_TOKEN;

	if (!botToken) {
		throw new Error("SLACK_BOT_TOKEN is not set in environment.");
	}

	console.log("1. Verifying bot token with auth.test...");
	const authRes = await fetch("https://slack.com/api/auth.test", {
		headers: { authorization: `Bearer ${botToken}` },
	});
	const authData = (await authRes.json()) as {
		ok: boolean;
		team?: string;
		team_id?: string;
		user_id?: string;
		bot_id?: string;
		error?: string;
	};

	if (!authData.ok || !authData.team_id || !authData.user_id) {
		throw new Error(`Slack auth.test failed: ${authData.error}`);
	}
	console.log(`Authenticated with Slack Team: ${authData.team} (${authData.team_id}), Bot User: ${authData.user_id}`);

	console.log("2. Locating or joining #threadline-deals channel...");
	let cursor: string | undefined;
	let dealsChannel: { id: string; name: string } | undefined;

	for (let page = 0; page < 5; page++) {
		const url = new URL("https://slack.com/api/conversations.list");
		url.searchParams.set("types", "public_channel,private_channel");
		url.searchParams.set("limit", "100");
		if (cursor) url.searchParams.set("cursor", cursor);

		const listRes = await fetch(url.toString(), {
			headers: { authorization: `Bearer ${botToken}` },
		});
		const listData = (await listRes.json()) as {
			ok: boolean;
			channels?: Array<{ id: string; name: string; is_member?: boolean }>;
			response_metadata?: { next_cursor?: string };
			error?: string;
		};

		if (!listData.ok) {
			throw new Error(`conversations.list failed: ${listData.error}`);
		}

		dealsChannel = listData.channels?.find((c) => c.name === "threadline-deals");
		if (dealsChannel) break;

		cursor = listData.response_metadata?.next_cursor;
		if (!cursor) break;
	}

	if (!dealsChannel) {
		console.log("Channel #threadline-deals not found. Creating it...");
		const createRes = await fetch("https://slack.com/api/conversations.create", {
			method: "POST",
			headers: {
				authorization: `Bearer ${botToken}`,
				"content-type": "application/json; charset=utf-8",
			},
			body: JSON.stringify({ name: "threadline-deals", is_private: false }),
		});
		const createData = (await createRes.json()) as {
			ok: boolean;
			channel?: { id: string; name: string };
			error?: string;
		};
		if (!createData.ok || !createData.channel) {
			throw new Error(`Failed to create #threadline-deals: ${createData.error}`);
		}
		dealsChannel = createData.channel;
	}

	console.log(`Using alerts channel: #${dealsChannel.name} (${dealsChannel.id})`);

	await fetch("https://slack.com/api/conversations.join", {
		method: "POST",
		headers: {
			authorization: `Bearer ${botToken}`,
			"content-type": "application/json; charset=utf-8",
		},
		body: JSON.stringify({ channel: dealsChannel.id }),
	});

	console.log("3. Connecting workspace in DB with dev credentials...");
	const org = await db.organization.findFirst({ select: { id: true, name: true } });
	if (!org) {
		throw new Error("No organization found in database.");
	}

	const encryptedBotToken = encryptToken(botToken);
	const encryptedAppToken = appToken ? encryptToken(appToken) : null;

	const installation = await db.slackInstallation.upsert({
		where: { installerId: authData.user_id },
		create: {
			installerId: authData.user_id,
			organizationId: org.id,
			teamId: authData.team_id,
			teamName: authData.team || "Workspace",
			botUserId: authData.user_id,
			botToken: encryptedBotToken,
			alertsChannelId: dealsChannel.id,
			alertsChannelName: dealsChannel.name,
			installedBy: "dev-local",
		},
		update: {
			organizationId: org.id,
			teamName: authData.team || "Workspace",
			botUserId: authData.user_id,
			botToken: encryptedBotToken,
			alertsChannelId: dealsChannel.id,
			alertsChannelName: dealsChannel.name,
		},
	});
	console.log(`SlackInstallation saved for Org ${org.name} (${org.id}) -> Alerts Channel: #${installation.alertsChannelName}`);

	console.log("4. Finding draft to post as revival card...");
	let draft = await db.outboundDraft.findFirst({
		where: { status: "PENDING_APPROVAL" },
		include: { deal: true, contact: true },
	});

	if (!draft) {
		const anyDraft = await db.outboundDraft.findFirst({
			include: { deal: true, contact: true },
		});
		if (anyDraft) {
			draft = await db.outboundDraft.update({
				where: { id: anyDraft.id },
				data: { status: "PENDING_APPROVAL", slackMessageTs: null, slackChannelId: null },
				include: { deal: true, contact: true },
			});
		}
	}

	if (!draft) {
		let deal = await db.deal.findFirst({
			include: { contacts: { include: { contact: true } } },
		});
		if (!deal) {
			const contact = await db.contact.create({
				data: {
					firstName: "Elena",
					lastName: "Rostova",
					email: "elena.rostova@datacore.de",
					phone: "+49 89 2441 5500",
				},
			});
			deal = await db.deal.create({
				data: {
					name: "Datacore Enterprise Security",
					stage: "UNQUALIFIED_TO_BUY",
					contacts: {
						create: {
							contactId: contact.id,
							role: "Lead",
						},
					},
				},
				include: { contacts: { include: { contact: true } } },
			});
		}

		const contact = deal.contacts[0]?.contact;
		if (!contact) {
			throw new Error("No contact found on deal.");
		}

		const greetingName = contact.firstName || contact.lastName || "there";
		draft = await db.outboundDraft.create({
			data: {
				dealId: deal.id,
				contactId: contact.id,
				channel: "EMAIL",
				language: "en",
				status: "PENDING_APPROVAL",
				stalledReason: "Inactivity exceeded 4 days in stage UNQUALIFIED_TO_BUY",
				strategy: "confirm_next_step",
				contextRationale: "Deal exceeded SLA without next steps scheduled.",
				draftText: `Subject: Next steps regarding your inquiry\n\nHello ${greetingName},\n\nI wanted to follow up and see if you have time for our scheduled technical review this week.\n\nBest regards,\nAlex Miller\nThreadline Systems`,
				citedEvidence: [
					{
						evidenceId: "ev_1",
						kind: "communication.email",
						quote: "Let us briefly discuss deployment next week.",
					},
				],
			},
			include: { deal: true, contact: true },
		});
	}

	console.log(`Posting revival card for Draft ${draft.id} (Deal: ${draft.deal.name})...`);
	const revivalService = new SlackRevivalService(db as any);
	const postResult = await revivalService.postDraftRevivalCard(draft.id, org.id);

	if (!postResult || !postResult.ts) {
		throw new Error(`Failed to post revival card to Slack: ${postResult.reason}`);
	}

	console.log(`\nREAL SLACK POST SUCCESS:`);
	console.log(`Channel: #${dealsChannel.name} (${dealsChannel.id})`);
	console.log(`Message Timestamp (ts): ${postResult.ts}`);

	const updatedDraftAfterPost = await db.outboundDraft.findUnique({
		where: { id: draft.id },
		select: { id: true, status: true, slackMessageTs: true, slackChannelId: true },
	});
	console.log(`Draft DB record updated with Slack ts: ${updatedDraftAfterPost?.slackMessageTs}`);

	console.log("\n5. Testing interactive action: Approve & Send...");
	await revivalService.handleBlockAction({
		user: { id: authData.user_id, name: "Dev Tester" },
		team: { id: authData.team_id },
		channel: { id: dealsChannel.id },
		actions: [{ action_id: "draft_approve", value: draft.id }],
	});

	const finalDraft = await db.outboundDraft.findUnique({
		where: { id: draft.id },
		select: { id: true, status: true, approvedAt: true, approvedById: true },
	});

	console.log(`\nFinal Draft DB Status: ${finalDraft?.status}`);
	console.log(`Approved At: ${finalDraft?.approvedAt?.toISOString()}`);
	console.log(`Approved By ID: ${finalDraft?.approvedById}`);

	if (finalDraft?.status !== "APPROVED") {
		throw new Error(`Draft status did not transition to APPROVED! Current: ${finalDraft?.status}`);
	}

	console.log("\nPart D5 local Slack test completed successfully.");
}

main().catch((err) => {
	console.error("Test failed:", err);
	process.exit(1);
});

import { db } from "../src/client";
import {
	ActivityType,
	DealStage,
	EmailDirection,
	FactBand,
	FactStatus,
	IntakeJobStatus,
	IntakeSourceType,
	OutboundDraftStatus,
	RecordSource,
} from "../src/generated/prisma/enums";

const HOUR_MS = 60 * 60 * 1000;

function hoursAgo(hours: number, now: number): Date {
	return new Date(now - hours * HOUR_MS);
}

function quoted(text: string): string {
	return `"${text}" (speaker: lead)`;
}

const SCORES = [
	{ id: "demo-deal-1-acme", score: 82, health: "on_track", win: 0.7, hours: 2 },
	{
		id: "demo-deal-2-fintech",
		score: 71,
		health: "on_track",
		win: 0.55,
		hours: 5,
	},
	{
		id: "demo-deal-3-kestrel",
		score: 44,
		health: "stalled",
		win: 0.3,
		hours: 9,
	},
	{
		id: "demo-deal-4-cambridge",
		score: 88,
		health: "on_track",
		win: 0.8,
		hours: 14,
	},
	{
		id: "demo-deal-8-lumiere",
		score: 39,
		health: "at_risk",
		win: 0.25,
		hours: 20,
	},
	{
		id: "demo-deal-11-merlion",
		score: 66,
		health: "on_track",
		win: 0.5,
		hours: 26,
	},
] as const;

const PROMISES = [
	{
		id: "demo-promise-1",
		dealId: "demo-deal-1-acme",
		owner: "us",
		text: "Send the security questionnaire answers by Friday",
		quote: "Can you send the security questionnaire answers by Friday?",
		dueHours: -48,
		hours: 2,
	},
	{
		id: "demo-promise-2",
		dealId: "demo-deal-4-cambridge",
		owner: "lead",
		text: "Confirm the procurement contact after the board meeting",
		quote: "I'll confirm who runs procurement after Tuesday's board meeting.",
		dueHours: -24,
		hours: 15,
	},
	{
		id: "demo-promise-3",
		dealId: "demo-deal-3-kestrel",
		owner: "us",
		text: "Share revised pricing for 3-year term",
		quote: "Could you share pricing for a three-year term instead?",
		dueHours: 6,
		hours: 30,
	},
] as const;

export async function seedAgentWork(repId: string, repEmail: string) {
	const now = Date.now();

	for (const score of SCORES) {
		await db.deal.update({
			where: { id: score.id },
			data: {
				leadScore: score.score,
				health: score.health,
				winProbability: score.win,
				leadScoredAt: hoursAgo(score.hours, now),
			},
		});
	}

	for (const promise of PROMISES) {
		await db.commitment.create({
			data: {
				id: promise.id,
				dealId: promise.dealId,
				owner: promise.owner,
				text: promise.text,
				quote: promise.quote,
				sourceKind: "whatsapp.message",
				dueAt: hoursAgo(promise.dueHours, now),
				createdAt: hoursAgo(promise.hours, now),
			},
		});
	}

	const imports = [
		{
			id: "demo-intake-whatsapp",
			sourceType: IntakeSourceType.WHATSAPP_EXPORT,
			dealId: "demo-deal-3-kestrel",
			hours: 6,
		},
		{
			id: "demo-intake-call",
			sourceType: IntakeSourceType.CALL_RECORDING,
			dealId: "demo-deal-7-veloce",
			hours: 22,
		},
	];
	for (const job of imports) {
		await db.intakeJob.create({
			data: {
				id: job.id,
				userId: repId,
				sourceType: job.sourceType,
				fileUrl: `demo://${job.id}`,
				status: IntakeJobStatus.DONE,
				createdDealIds: [job.dealId],
				createdContactIds: [`demo-contact-${job.dealId}`],
				createdAt: hoursAgo(job.hours, now),
				updatedAt: hoursAgo(job.hours, now),
			},
		});
	}

	await seedPostCall(repId, now);
	await seedInboundLead(repId, repEmail, now);

	await db.notification.create({
		data: {
			id: "demo-notification-sync",
			kind: "sync.report",
			title: "Gmail sync: 6 added, 14 skipped",
			body: "Read 20 messages from the last 7 days. Added 6 messages on 4 companies. Skipped 14: newsletters, your own team and mail already in Threadline.",
			source: "email",
			createdAt: hoursAgo(4, now),
		},
	});
}

async function seedPostCall(repId: string, now: number) {
	const dealId = "demo-deal-1-acme";
	const contactId = `demo-contact-${dealId}`;
	const at = hoursAgo(1, now);
	const summary =
		"David Miller confirmed Acme needs to replace its legacy monitoring before the Q1 audit. He owns the budget and signs off with the CFO. Timeline is a decision within 6 weeks. Open: which competitor they are comparing against.";

	await db.activity.create({
		data: {
			id: "demo-activity-call-acme",
			type: ActivityType.CALL,
			subject: "Qualifying call with David Miller",
			body: summary,
			dealId,
			contactId,
			createdById: repId,
			occurredAt: at,
			createdAt: at,
			meta: { source: "voice.live-call", facts: 2 },
		},
	});

	const callFacts = [
		{
			id: "demo-fact-call-authority",
			field: "qualification.authority",
			value: "David owns the budget; the CFO co-signs",
			quote: "I own the budget, and our CFO co-signs anything over 150k.",
		},
		{
			id: "demo-fact-call-timeline",
			field: "qualification.timeline",
			value: "Decision within 6 weeks, before the Q1 audit",
			quote: "We need this decided in about six weeks, before the Q1 audit.",
		},
	];
	for (const fact of callFacts) {
		await db.contactFact.create({
			data: {
				id: fact.id,
				dealId,
				contactId,
				field: fact.field,
				value: fact.value,
				score: 0.9,
				band: FactBand.VERIFIED,
				status: FactStatus.PROPOSED,
				method: "gemini-live-call",
				evidence: [{ kind: "voice.live-call", detail: quoted(fact.quote) }],
				observedAt: at,
			},
		});
	}

	await db.outboundDraft.create({
		data: {
			id: "demo-draft-after-call-acme",
			dealId,
			contactId,
			channel: "EMAIL",
			recipientEmail: "david.miller@acmecloud.example",
			subject: "Next steps after today's call",
			language: "en",
			strategy: "post_call",
			contextRationale: summary,
			stalledReason:
				"Proposed move to Proposal: David asked for a written proposal he can take to the CFO.",
			proposedStage: DealStage.CONTRACT_SENT,
			draftText:
				"Hi David,\n\nThanks for the time today. You need the legacy monitoring replaced before the Q1 audit, with a decision in about six weeks, and you will take it to your CFO.\n\nI'll send a written proposal by Thursday with pricing and the rollout plan. Is there anything the CFO will want to see in it?\n\nBest regards,\nAlex Morgan, Northwind Systems",
			priorityScore: 100,
			citedEvidence: callFacts.map((fact) => ({
				evidenceId: fact.id,
				kind: "voice.live-call",
				quote: fact.quote,
			})),
			status: OutboundDraftStatus.PENDING_APPROVAL,
			createdAt: at,
		},
	});

	await db.notification.create({
		data: {
			id: "demo-notification-call",
			kind: "call.wrap-up",
			title: "Call with David Miller: summary and follow-up ready",
			body: "Proposed stage: Proposal. Review it in For you.",
			entity: "deal",
			entityId: dealId,
			source: "voice",
			createdAt: at,
		},
	});
}

async function seedInboundLead(repId: string, repEmail: string, now: number) {
	const at = hoursAgo(3, now);
	const company = await db.company.create({
		data: {
			id: "demo-company-review-brightpath",
			name: "BrightPath Learning",
			domain: "brightpath.example",
			source: RecordSource.EMAIL,
			pendingReview: true,
			ownerId: repId,
			createdAt: at,
		},
	});
	const contact = await db.contact.create({
		data: {
			id: "demo-contact-review-brightpath",
			firstName: "Priya",
			lastName: "Nair",
			email: "priya.nair@brightpath.example",
			companyId: company.id,
			source: RecordSource.EMAIL,
			pendingReview: true,
			ownerId: repId,
			createdAt: at,
		},
	});
	const body =
		"Hi, we run tutoring centres in 6 cities and are looking for a CRM our counsellors can use from WhatsApp. What would pricing look like for about 40 seats?";
	await db.emailThread.create({
		data: {
			id: "demo-thread-brightpath",
			rootMessageId: "<demo-brightpath@mail.example>",
			subject: "Pricing for about 40 seats?",
			companyId: company.id,
			contactId: contact.id,
			firstMessageAt: at,
			lastMessageAt: at,
			messageCount: 1,
			messages: {
				create: {
					id: "demo-message-brightpath",
					rfcMessageId: "<demo-brightpath@mail.example>",
					direction: EmailDirection.INBOUND,
					fromEmail: "priya.nair@brightpath.example",
					fromName: "Priya Nair",
					recipients: [{ email: repEmail, kind: "to" }],
					subject: "Pricing for about 40 seats?",
					snippet: body,
					body,
					sentAt: at,
				},
			},
		},
	});
	await db.notification.create({
		data: {
			id: "demo-notification-lead",
			kind: "contact.created",
			title: "New lead from your inbox: Priya Nair",
			body: "priya.nair@brightpath.example. Not a known contact yet, so it waits for your review.",
			entity: "contact",
			entityId: contact.id,
			source: "email",
			createdAt: at,
		},
	});
}

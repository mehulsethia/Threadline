import {
	ActivityType,
	DealStage,
	db,
	OutboundDraftStatus,
	runInWorkspace,
} from "@crm/db";
import { notify } from "@crm/db/notifications";
import { jsonText } from "@crm/validation/json-text";
import type { VoiceRecordedFact } from "@crm/validation/voice";
import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { loadCallContact } from "./context";
import { VOICE, wrapUpLocation, wrapUpModel } from "./voice-config";

export type CallTurn = { role: "assistant" | "user"; text: string };

const PROPOSABLE_STAGES = [
	DealStage.UNQUALIFIED_TO_BUY,
	DealStage.QUALIFIED_TO_BUY,
	DealStage.DEMO_BOOKED,
	DealStage.CONTRACT_SENT,
	DealStage.DECISION_MAKER_BOUGHT_IN,
] as const;

const STAGE_NAMES: Record<(typeof PROPOSABLE_STAGES)[number], string> = {
	UNQUALIFIED_TO_BUY: "Lead",
	QUALIFIED_TO_BUY: "Qualified",
	DEMO_BOOKED: "Meeting/Demo",
	CONTRACT_SENT: "Proposal",
	DECISION_MAKER_BOUGHT_IN: "Negotiation",
};

const callWrapUp = z.object({
	summary: z.string().trim().min(1),
	nextStage: z.enum(PROPOSABLE_STAGES).nullable(),
	stageReason: z.string().trim(),
	followUp: z.object({
		subject: z.string().trim(),
		text: z.string().trim().min(1),
	}),
});

type CallWrapUp = z.infer<typeof callWrapUp>;

export async function wrapUpCall(
	workspaceId: string,
	dealId: string,
	turns: CallTurn[],
	facts: VoiceRecordedFact[],
): Promise<void> {
	if (
		turns.filter((turn) => turn.role === "user").length <
		VOICE.wrapUp.minLeadTurns
	) {
		return;
	}
	await runInWorkspace(workspaceId, () => writeWrapUp(dealId, turns, facts));
}

async function writeWrapUp(
	dealId: string,
	turns: CallTurn[],
	facts: VoiceRecordedFact[],
): Promise<void> {
	const deal = await db.deal.findUnique({
		where: { id: dealId },
		select: {
			id: true,
			name: true,
			stage: true,
			ownerId: true,
			companyId: true,
			company: { select: { name: true } },
			owner: { select: { name: true } },
		},
	});
	if (!deal) return;
	const workspace = await db.organization.findFirst({
		select: { name: true },
	});

	const contact = await loadCallContact(dealId);
	const leadName =
		[contact?.firstName, contact?.lastName].filter(Boolean).join(" ") ||
		"the lead";
	const sender = [deal.owner.name, workspace?.name].filter(Boolean).join(", ");
	const wrapUp = await summarise(deal, leadName, sender, turns, facts);

	await db.activity.create({
		data: {
			type: ActivityType.CALL,
			subject: `Qualifying call with ${leadName}`,
			body: wrapUp.summary,
			dealId: deal.id,
			companyId: deal.companyId,
			contactId: contact?.id ?? null,
			createdById: deal.ownerId,
			occurredAt: new Date(),
			meta: { source: "voice.live-call", facts: facts.length },
		},
	});

	const proposedStage =
		wrapUp.nextStage && wrapUp.nextStage !== deal.stage
			? wrapUp.nextStage
			: null;

	if (contact) {
		const channel = contact.email ? "EMAIL" : "WHATSAPP";
		await db.outboundDraft.updateMany({
			where: {
				dealId: deal.id,
				strategy: "post_call",
				status: OutboundDraftStatus.PENDING_APPROVAL,
			},
			data: { status: OutboundDraftStatus.REJECTED },
		});
		await db.outboundDraft.create({
			data: {
				dealId: deal.id,
				contactId: contact.id,
				channel,
				recipientEmail: contact.email,
				recipientPhone: contact.phone,
				subject: wrapUp.followUp.subject || "Following up on our call",
				strategy: "post_call",
				contextRationale: wrapUp.summary,
				stalledReason: proposedStage
					? `Proposed move to ${STAGE_NAMES[proposedStage]}: ${wrapUp.stageReason}`
					: null,
				draftText: wrapUp.followUp.text,
				citedEvidence: facts.map((fact) => ({
					evidenceId: "",
					kind: "voice.live-call",
					quote: fact.quote,
				})),
				priorityScore: VOICE.wrapUp.draftPriority,
				proposedStage,
			},
		});
	}

	await notify(db, {
		kind: "call.wrap-up",
		title: `Call with ${leadName}: summary and follow-up ready`,
		body: proposedStage
			? `Proposed stage: ${STAGE_NAMES[proposedStage]}. Review it on the Revival page.`
			: "Review the follow-up on the Revival page.",
		entity: "deal",
		entityId: deal.id,
		source: "voice",
	});
}

async function summarise(
	deal: { name: string; stage: DealStage; company: { name: string } | null },
	leadName: string,
	sender: string,
	turns: CallTurn[],
	facts: VoiceRecordedFact[],
): Promise<CallWrapUp> {
	const transcript = turns
		.map((turn) => `${turn.role === "user" ? leadName : "Agent"}: ${turn.text}`)
		.join("\n")
		.slice(-VOICE.wrapUp.maxTranscriptCharacters);
	const answers = facts.length
		? facts.map((fact) => `- ${fact.category}: ${fact.fact}`).join("\n")
		: "None recorded.";
	const stages = PROPOSABLE_STAGES.map(
		(stage) => `${stage} (${STAGE_NAMES[stage]})`,
	).join(", ");

	const prompt = [
		"You wrap up a sales qualifying call for the rep who owns the deal.",
		`Deal: "${deal.name}"${deal.company ? ` with ${deal.company.name}` : ""}. Current stage: ${deal.stage}.`,
		"Answers recorded during the call:",
		answers,
		"Transcript:",
		transcript,
		"Return JSON with:",
		'- "summary": 2 to 4 sentences for the rep: what the lead needs, what was learned, what is still open.',
		`- "nextStage": the stage the deal should move to, one of ${stages}, or null to keep it where it is. Move it only when the call supports it.`,
		'- "stageReason": one sentence citing what the lead said.',
		`- "followUp": { "subject", "text" }: a short follow-up message to the lead, in the language they spoke, that thanks them, confirms what they said and proposes the next step. Promise nothing the call did not support. Sign it off as ${sender || "the sales team"}.`,
	].join("\n");

	const ai = new GoogleGenAI({
		vertexai: true,
		project: process.env.GOOGLE_CLOUD_PROJECT,
		location: wrapUpLocation(),
	});
	const response = await ai.models.generateContent({
		model: wrapUpModel(),
		contents: [{ role: "user", parts: [{ text: prompt }] }],
		config: { responseMimeType: "application/json" },
	});
	return jsonText.pipe(callWrapUp).parse(response.text ?? "");
}

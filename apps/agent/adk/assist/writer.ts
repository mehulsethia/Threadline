import { jsonText } from "@crm/validation/json-text";
import { z } from "zod";
import { getSmartClient } from "../extraction";
import {
	stripUnsupportedClaims,
	verifyFactualClaims,
} from "../revival/claim-guard";
import { type DealContext, loadDealContext } from "./deal-context";

export const DRAFT_CHANNELS = ["email", "whatsapp", "linkedin"] as const;
export type DraftChannel = (typeof DRAFT_CHANNELS)[number];

const citation = z.object({
	evidenceId: z.string(),
	quote: z.string().catch(""),
});

const draftAnswer = z.object({
	subject: z.string().nullable().catch(null),
	body: z.string(),
	rationale: z.string().catch(""),
	personalization: z.array(z.string()).catch([]),
	citations: z.array(citation).catch([]),
});

const briefAnswer = z.object({
	summary: z.string(),
	goal: z.string().catch(""),
	talkingPoints: z
		.array(
			z.object({
				point: z.string(),
				evidenceId: z.string().nullable().catch(null),
			}),
		)
		.catch([]),
	questions: z.array(z.string()).catch([]),
	objections: z
		.array(
			z.object({
				objection: z.string(),
				response: z.string(),
				evidenceId: z.string().nullable().catch(null),
			}),
		)
		.catch([]),
	openPromises: z.array(z.string()).catch([]),
	risks: z.array(z.string()).catch([]),
});

export type DraftResult = z.infer<typeof draftAnswer> & {
	channel: DraftChannel;
	to: string | null;
	removedClaims: string[];
};

export type BriefResult = z.infer<typeof briefAnswer> & { dealName: string };

function knownIds(context: DealContext): Set<string> {
	return new Set(context.evidence.map((line) => line.id));
}

async function generate<T>(prompt: string, schema: z.ZodType<T>): Promise<T> {
	const { ai, model } = getSmartClient();
	const response = await ai.models.generateContent({
		model,
		contents: prompt,
		config: { responseMimeType: "application/json", temperature: 0.4 },
	});
	return jsonText.pipe(schema).parse(response.text ?? "");
}

const CHANNEL_RULES = {
	email:
		"An email: a specific subject line (under 70 characters) and a body of 90–160 words with short paragraphs.",
	whatsapp:
		"A WhatsApp message: no subject (null), 2–4 short sentences, conversational, at most one emoji only if the lead used emoji.",
	linkedin:
		"A LinkedIn message: no subject (null), under 80 words, warm and professional.",
} satisfies Record<DraftChannel, string>;

export async function draftMessage(input: {
	dealId: string;
	channel: DraftChannel;
	goal?: string | null;
}): Promise<DraftResult | null> {
	const context = await loadDealContext(input.dealId);
	if (!context) return null;

	const prompt = [
		"You write one hyper-personalized sales message from our rep to the lead below.",
		"Personalize it with specifics from the evidence: their stated need, numbers, timeline, objections, their own words and tone, open promises, and what changed since the last message.",
		"Write in the language the lead writes in. Match their formality.",
		"Every factual claim about the lead, the deal or our offer must come from the evidence. Never invent prices, dates, meetings, features or certifications.",
		"Answer open questions the lead asked if the evidence answers them; otherwise say we will confirm.",
		"End with one clear, low-friction next step. Sign off with the rep's name.",
		CHANNEL_RULES[input.channel],
		input.goal
			? `The rep's goal for this message: ${input.goal}`
			: "Goal: move the deal to its next stage.",
		"",
		context.prompt,
		"",
		'Return JSON: {"subject": string|null, "body": string, "rationale": string, "personalization": string[] (each specific detail you used), "citations": [{"evidenceId": string, "quote": string}]}',
	].join("\n");

	const answer = await generate(prompt, draftAnswer);
	const ids = knownIds(context);
	const check = verifyFactualClaims(answer.body, {
		facts: context.evidence
			.filter((e) => e.kind === "fact")
			.map((e) => ({ field: "", value: e.text })),
		messages: context.evidence
			.filter((e) => e.kind === "message" || e.kind === "email")
			.map((e) => ({ body: e.text, sender: "" })),
		tasks: context.evidence
			.filter((e) => e.kind === "task")
			.map((e) => ({ subject: e.text })),
	});
	return {
		...answer,
		body: check.valid
			? answer.body
			: stripUnsupportedClaims(answer.body, check.unsupportedClaims),
		citations: answer.citations.filter((c) => ids.has(c.evidenceId)),
		channel: input.channel,
		to:
			input.channel === "email"
				? context.contactEmail
				: input.channel === "whatsapp"
					? context.contactPhone
					: null,
		removedClaims: check.unsupportedClaims,
	};
}

export async function meetingBrief(
	dealId: string,
): Promise<BriefResult | null> {
	const context = await loadDealContext(dealId);
	if (!context) return null;

	const prompt = [
		"Prepare our rep for the next meeting with this lead. Be specific to this lead; no generic sales advice.",
		"Use only the evidence. Put evidence ids only in the evidenceId fields, never inside sentences.",
		"Talking points: 3–6, ordered by importance, each tied to what the lead cares about.",
		"Questions: 3–5 that close the biggest gaps (budget, authority, need, timeline, decision process) still unknown.",
		"Objections: each objection raised in the evidence with a concise suggested response grounded in what we offer.",
		"Open promises: anything either side promised and has not done yet.",
		"Risks: what could stall or lose this deal.",
		"",
		context.prompt,
		"",
		'Return JSON: {"summary": string (2 sentences), "goal": string, "talkingPoints": [{"point": string, "evidenceId": string|null}], "questions": string[], "objections": [{"objection": string, "response": string, "evidenceId": string|null}], "openPromises": string[], "risks": string[]}',
	].join("\n");

	const answer = await generate(prompt, briefAnswer);
	const ids = knownIds(context);
	const clean = (text: string) =>
		text
			.replace(/\s*\((?:#[a-z0-9_-]+(?:,\s*)?)+\)/gi, "")
			.replace(/\s*#c[a-z0-9]{20,}/gi, "")
			.trim();
	return {
		...answer,
		summary: clean(answer.summary),
		goal: clean(answer.goal),
		questions: answer.questions.map(clean),
		openPromises: answer.openPromises.map(clean),
		risks: answer.risks.map(clean),
		objections: answer.objections.map((o) => ({
			...o,
			objection: clean(o.objection),
			response: clean(o.response),
		})),
		talkingPoints: answer.talkingPoints.map((p) => ({
			...p,
			point: clean(p.point),
			evidenceId: p.evidenceId && ids.has(p.evidenceId) ? p.evidenceId : null,
		})),
		dealName: context.dealName,
	};
}

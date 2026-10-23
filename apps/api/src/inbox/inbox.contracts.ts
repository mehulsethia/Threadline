import { z } from "zod";

const evidenceQuote = z.object({ kind: z.string(), text: z.string() });

const recordRef = z.object({
	kind: z.enum(["deal", "contact", "company"]),
	id: z.string(),
	name: z.string(),
});

export const inboxDraftItem = z.object({
	kind: z.literal("draft"),
	id: z.string(),
	at: z.string(),
	afterCall: z.boolean(),
	record: recordRef,
	contactName: z.string(),
	companyName: z.string().nullable(),
	channel: z.string(),
	subject: z.string().nullable(),
	text: z.string(),
	summary: z.string(),
	reason: z.string().nullable(),
	proposedStage: z.string().nullable(),
	evidence: z.array(evidenceQuote),
});

export const inboxLeadItem = z.object({
	kind: z.literal("lead"),
	id: z.string(),
	at: z.string(),
	record: recordRef,
	email: z.string().nullable(),
	companyName: z.string().nullable(),
	evidence: z.array(evidenceQuote),
});

export const inboxFactItem = z.object({
	kind: z.literal("fact"),
	id: z.string(),
	at: z.string(),
	record: recordRef,
	field: z.string(),
	value: z.string(),
	evidence: z.array(evidenceQuote),
});

export const inboxItem = z.discriminatedUnion("kind", [
	inboxDraftItem,
	inboxLeadItem,
	inboxFactItem,
]);

export type InboxItem = z.infer<typeof inboxItem>;

export const inboxListOutput = z.object({
	counts: z.object({
		drafts: z.number(),
		leads: z.number(),
		facts: z.number(),
	}),
	items: z.array(inboxItem),
});

export type InboxList = z.infer<typeof inboxListOutput>;

export const inboxCountOutput = z.object({ total: z.number() });

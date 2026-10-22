import { db, FactStatus } from "@crm/db";
import {
	VOICE_CATEGORIES,
	type VoiceCategory,
	type VoiceDealContext,
} from "@crm/validation/voice";

type DealContactRow = {
	contactId: string;
	role: string | null;
	contact: {
		id: string;
		firstName: string;
		lastName: string | null;
		phone: string | null;
		email: string | null;
	};
};

export async function callContact(
	dealId: string,
	contacts: DealContactRow[],
): Promise<DealContactRow["contact"] | undefined> {
	if (contacts.length <= 1) return contacts[0]?.contact;
	const lastInbound = await db.whatsAppMessage.findFirst({
		where: {
			dealId,
			direction: "INBOUND",
			contactId: { in: contacts.map((c) => c.contactId) },
		},
		orderBy: { timestamp: "desc" },
		select: { contactId: true },
	});
	return (
		contacts.find((c) => c.contactId === lastInbound?.contactId) ??
		contacts.find((c) => /primary/i.test(c.role ?? "")) ??
		[...contacts].sort((a, b) => a.contactId.localeCompare(b.contactId))[0]
	)?.contact;
}

const CONTACT_SELECT = {
	contactId: true,
	role: true,
	contact: {
		select: {
			id: true,
			firstName: true,
			lastName: true,
			phone: true,
			email: true,
		},
	},
} as const;

export async function loadCallContact(dealId: string) {
	const contacts = await db.dealContact.findMany({
		where: { dealId },
		select: CONTACT_SELECT,
	});
	return callContact(dealId, contacts);
}

export class DealNotFound extends Error {}

export async function dealContext(dealId: string): Promise<VoiceDealContext> {
	const deal = await db.deal.findUnique({
		where: { id: dealId },
		select: {
			id: true,
			name: true,
			stage: true,
			company: { select: { name: true } },
			contacts: { select: CONTACT_SELECT },
			facts: {
				select: { field: true, value: true, status: true, contactId: true },
			},
		},
	});

	if (!deal) throw new DealNotFound(`Deal with id ${dealId} was not found.`);

	const primaryContact = await callContact(dealId, deal.contacts);
	const leadName = primaryContact
		? [primaryContact.firstName, primaryContact.lastName]
				.filter(Boolean)
				.join(" ") || "Prospect"
		: "Prospect";

	const relevant = deal.facts.filter(
		(fact) =>
			fact.status !== FactStatus.DISMISSED &&
			(fact.contactId === null ||
				(primaryContact && fact.contactId === primaryContact.id)),
	);

	const knownFacts: Record<string, string> = {};
	for (const fact of relevant) knownFacts[fact.field] = fact.value;

	const missingCategories: VoiceCategory[] = VOICE_CATEGORIES.filter(
		(category) =>
			!knownFacts[`qualification.${category}`] &&
			!relevant.some((fact) => fact.field.includes(category)),
	);

	const coveredCount = VOICE_CATEGORIES.length - missingCategories.length;
	const proposedStage = deal.facts.find(
		(f) =>
			f.field === "qualification.proposed_stage" &&
			f.status === FactStatus.PROPOSED,
	);

	return {
		dealId: deal.id,
		dealName: deal.name,
		leadName,
		leadPhone: primaryContact?.phone ?? null,
		leadEmail: primaryContact?.email ?? null,
		companyName: deal.company?.name ?? null,
		language: await leadLanguage(primaryContact?.id ?? null, relevant),
		knownFacts,
		missingCategories,
		currentStage: deal.stage,
		proposedStage: proposedStage?.value ?? null,
		qualificationScore: Math.round(
			(coveredCount / VOICE_CATEGORIES.length) * 100,
		),
	};
}

const LANGUAGE_HINTS: { code: string; pattern: RegExp }[] = [
	{
		code: "de",
		pattern:
			/\b(?:und|ich|wir|bitte|termin|bereitstellung|nachfragen|geplante|angebot|grüße)\b/i,
	},
	{
		code: "fr",
		pattern: /\b(?:bonjour|merci|vous|nous|projet|devis|accord)\b/i,
	},
	{
		code: "es",
		pattern: /\b(?:hola|gracias|nosotros|ustedes|proyecto|presupuesto)\b/i,
	},
];

async function leadLanguage(
	contactId: string | null,
	facts: { field: string; value: string }[],
): Promise<string> {
	if (!contactId) return "en";
	const message = await db.whatsAppMessage.findFirst({
		where: { contactId, direction: "INBOUND" },
		orderBy: { timestamp: "desc" },
		select: { body: true },
	});
	if (message?.body) {
		return (
			LANGUAGE_HINTS.find((hint) => hint.pattern.test(message.body ?? ""))
				?.code ?? "en"
		);
	}
	return facts.find((fact) => fact.field === "language")?.value || "en";
}

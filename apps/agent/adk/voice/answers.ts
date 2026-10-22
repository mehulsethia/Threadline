import { DealStage, db, FactBand, FactStatus } from "@crm/db";
import {
	VOICE_CATEGORIES,
	type VoiceRecordedFact,
} from "@crm/validation/voice";
import { DealNotFound, loadCallContact } from "./context";
import { VOICE } from "./voice-config";

export type RecordedAnswer = {
	proposedScore: number;
	proposedStage: string | null;
};

export async function recordAnswer(
	dealId: string,
	input: VoiceRecordedFact,
): Promise<RecordedAnswer> {
	const deal = await db.deal.findUnique({
		where: { id: dealId },
		select: { id: true, stage: true },
	});
	if (!deal) throw new DealNotFound(`Deal ${dealId} not found.`);

	const contact = await loadCallContact(dealId);
	const contactId = contact?.id ?? null;
	const evidence = [
		{
			kind: "voice.live-call",
			detail: `"${input.quote}" (speaker: lead)`,
		},
	];
	const proposed = (field: string, value: string, method: string) => ({
		dealId,
		contactId,
		field,
		value,
		score: VOICE.evidenceScore,
		band: FactBand.VERIFIED,
		evidence,
		method,
		status: FactStatus.PROPOSED,
	});

	const field = `qualification.${input.category}`;
	const earlier = await db.contactFact.findFirst({
		where: {
			dealId,
			field,
			method: "gemini-live-call",
			status: FactStatus.PROPOSED,
		},
		select: { id: true },
	});
	if (earlier) {
		await db.contactFact.update({
			where: { id: earlier.id },
			data: { value: input.fact, evidence, observedAt: new Date() },
		});
	} else {
		await db.contactFact.create({
			data: proposed(field, input.fact, "gemini-live-call"),
		});
	}

	const facts = await db.contactFact.findMany({
		where: { dealId, status: { not: FactStatus.DISMISSED } },
		select: { field: true },
	});
	const covered = new Set<string>([input.category]);
	for (const fact of facts) {
		for (const category of VOICE_CATEGORIES) {
			if (fact.field.includes(category)) covered.add(category);
		}
	}

	const proposedScore = Math.min(
		100,
		Math.round((covered.size / VOICE_CATEGORIES.length) * 100),
	);

	await db.contactFact.deleteMany({
		where: {
			dealId,
			field: "qualification.score",
			status: FactStatus.PROPOSED,
		},
	});
	await db.contactFact.create({
		data: proposed(
			"qualification.score",
			`${proposedScore}/100`,
			"qualification-score-engine",
		),
	});

	const qualifies =
		covered.has("need") && (covered.has("budget") || covered.has("timeline"));
	const proposedStage =
		qualifies && deal.stage === DealStage.UNQUALIFIED_TO_BUY
			? DealStage.QUALIFIED_TO_BUY
			: null;

	if (proposedStage) {
		await db.contactFact.deleteMany({
			where: {
				dealId,
				field: "qualification.proposed_stage",
				status: FactStatus.PROPOSED,
			},
		});
		await db.contactFact.create({
			data: proposed(
				"qualification.proposed_stage",
				proposedStage,
				"stage-criteria-engine",
			),
		});
	}

	return { proposedScore, proposedStage };
}

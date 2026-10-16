import { randomUUID } from "node:crypto";
import {
	ActivityType,
	db,
	EmailDirection,
	OutboundDraftStatus,
	type Prisma,
} from "@crm/db";
import { readPlaybook } from "@crm/db/settings";
import { getSmartClient } from "../extraction";
import {
	type EvidenceSourceContext,
	stripUnsupportedClaims,
	verifyFactualClaims,
} from "./claim-guard";
import type { StalledDealInfo } from "./detector";
import { postDraftToSlack } from "./slack";

export type RevivalStrategy =
	| "answer_or_route"
	| "confirm_next_step"
	| "value_nudge"
	| "address_objection"
	| "polite_close_out";

export type CitedEvidenceItem = {
	evidenceId: string;
	kind: string;
	quote: string;
};

export type RevivalDraftResult = {
	draftId: string;
	dealId: string;
	contactId: string;
	channel: "WHATSAPP" | "EMAIL";
	strategy: RevivalStrategy;
	rationale: string;
	subject?: string | null;
	draftText: string;
	language: string;
	confidence: number;
	citedEvidence: CitedEvidenceItem[];
	citedEvidenceIds?: string[];
	waLink?: string | null;
	stalledReason: string;
	priorityScore: number;
};

function determineSituationalStrategy(
	stalled: StalledDealInfo,
	dealStage: string,
	facts: Array<{ field: string; value: string }>,
	messages: Array<{ direction: EmailDirection; body: string }>,
): { strategy: RevivalStrategy; rationale: string } {
	if (stalled.unansweredQuestion) {
		return {
			strategy: "answer_or_route",
			rationale: `The lead asked an unanswered question ("${stalled.unansweredQuestion.slice(0, 50)}..."). Address the question using verified facts or route to next step.`,
		};
	}

	if (
		dealStage === "CONTRACT_SENT" ||
		dealStage === "DECISION_MAKER_BOUGHT_IN" ||
		facts.some(
			(f) =>
				f.field === "stageSuggestion" &&
				/proposal|contract|quote/i.test(f.value),
		)
	) {
		return {
			strategy: "confirm_next_step",
			rationale:
				"The proposal/contract was sent and the deal is stalled awaiting review. Confirm status and next steps to finalize.",
		};
	}

	if (
		facts.some((f) => f.field === "objection") ||
		messages.some(
			(m) =>
				m.direction === EmailDirection.INBOUND &&
				/budget|expensive|timing|competitor|compliance|security/i.test(m.body),
		)
	) {
		return {
			strategy: "address_objection",
			rationale:
				"The buyer raised concerns or objections. Address them with verified evidence from the ledger.",
		};
	}

	return {
		strategy: "value_nudge",
		rationale:
			"The lead went quiet early in the conversation without explicit objections.",
	};
}

function parseStructuredCitations(
	rawCitations: unknown,
	facts: Array<{ id: string; field: string; value: string }>,
	messages: Array<{ id: string; body: string }>,
): CitedEvidenceItem[] {
	const structured: CitedEvidenceItem[] = [];

	if (Array.isArray(rawCitations)) {
		for (const item of rawCitations) {
			if (item && typeof item === "object") {
				const rec = item as Record<string, unknown>;
				const evidenceId = String(rec.evidenceId || rec.id || randomUUID());
				const kind = String(rec.kind || "fact");
				const quote = String(rec.quote || rec.detail || "");
				if (quote) {
					structured.push({ evidenceId, kind, quote });
				}
			} else if (typeof item === "string" && item.trim()) {
				const foundFact = facts.find((f) => f.id === item || f.field === item);
				if (foundFact) {
					structured.push({
						evidenceId: foundFact.id,
						kind: "fact",
						quote: foundFact.value,
					});
				} else {
					structured.push({
						evidenceId: randomUUID(),
						kind: "message",
						quote: item.trim(),
					});
				}
			}
		}
	}

	if (structured.length === 0) {
		const firstFact = facts[0];
		if (firstFact) {
			structured.push({
				evidenceId: firstFact.id,
				kind: "fact",
				quote: `${firstFact.field}: ${firstFact.value}`,
			});
		} else if (messages.length > 0) {
			const lastMsg = messages[messages.length - 1];
			if (lastMsg) {
				structured.push({
					evidenceId: lastMsg.id,
					kind: "message",
					quote: lastMsg.body,
				});
			}
		}
	}

	return structured;
}

async function applyClaimGuard(
	draftText: string,
	prompt: string,
	evidenceContext: EvidenceSourceContext,
	ai: ReturnType<typeof getSmartClient>["ai"],
	model: string,
): Promise<string> {
	let currentDraft = draftText;
	const claimCheck = verifyFactualClaims(currentDraft, evidenceContext);

	if (claimCheck.valid) {
		return currentDraft;
	}

	const regenPrompt = [
		prompt,
		"",
		"CRITICAL CORRECTION REQUIRED:",
		`Your previous draft contained unsupported factual claims not found in the evidence: ${claimCheck.unsupportedClaims.join(", ")}.`,
		"Rewrite the follow-up message removing all of these unsupported claims.",
		"Do NOT mention any unconfirmed meetings, demos, agreed appointments, 'schnelle Bereitstellung', 'high-volume reliability', 'fast deployment', or certifications not explicitly in the ledger.",
		"Return the updated JSON object.",
	].join("\n");

	try {
		const regenRes = await ai.models.generateContent({
			model,
			contents: regenPrompt,
			config: {
				responseMimeType: "application/json",
			},
		});
		const regenParsed = JSON.parse(regenRes.text || "{}") as Record<
			string,
			unknown
		>;
		if (
			typeof regenParsed.draftText === "string" &&
			regenParsed.draftText.trim()
		) {
			currentDraft = regenParsed.draftText.trim();
		}
	} catch {
		// Ignore regeneration error
	}

	const secondCheck = verifyFactualClaims(currentDraft, evidenceContext);
	if (!secondCheck.valid) {
		currentDraft = stripUnsupportedClaims(
			currentDraft,
			secondCheck.unsupportedClaims,
		);
	}

	return currentDraft;
}

export async function generateRevivalDraft(
	stalled: StalledDealInfo,
): Promise<RevivalDraftResult | null> {
	const [contact, deal, facts, tasks, previousDrafts, playbook, organization] =
		await Promise.all([
			db.contact.findUnique({
				where: { id: stalled.contactId },
				select: {
					id: true,
					firstName: true,
					lastName: true,
					phone: true,
					email: true,
					timezone: true,
					optedOut: true,
				},
			}),
			db.deal.findUnique({
				where: { id: stalled.dealId },
				select: {
					id: true,
					name: true,
					stage: true,
					amount: true,
					currency: true,
					owner: {
						select: {
							id: true,
							name: true,
							email: true,
						},
					},
					whatsAppMessages: {
						orderBy: { timestamp: "asc" },
						take: 30,
					},
				},
			}),
			db.contactFact.findMany({
				where: {
					OR: [{ contactId: stalled.contactId }, { dealId: stalled.dealId }],
				},
				select: {
					id: true,
					field: true,
					value: true,
					status: true,
					evidence: true,
					sourceUrl: true,
				},
			}),
			db.activity.findMany({
				where: {
					dealId: stalled.dealId,
					type: ActivityType.TASK,
				},
				select: {
					id: true,
					subject: true,
					dueAt: true,
					completedAt: true,
				},
			}),
			db.outboundDraft.findMany({
				where: { dealId: stalled.dealId },
				orderBy: { createdAt: "desc" },
				take: 3,
			}),
			readPlaybook(db),
			db.organization.findFirst({ select: { name: true } }),
		]);

	if (!contact || !deal || contact.optedOut) {
		return null;
	}

	const hasPhone = Boolean(contact.phone?.trim());
	const hasEmail = Boolean(contact.email?.trim());
	let channel: "WHATSAPP" | "EMAIL" = stalled.lastInboundChannel ?? "WHATSAPP";
	if (channel === "WHATSAPP" && !hasPhone && hasEmail) {
		channel = "EMAIL";
	}

	const languageFact = facts.find((f) => f.field === "language");
	const language = languageFact?.value || "en";

	const repName = deal.owner?.name || "Alex Morgan";
	const sellerCompany = organization?.name || "Threadline";

	const historyLines = deal.whatsAppMessages.map(
		(m) =>
			`[${m.timestamp.toISOString()}] (${m.direction === EmailDirection.INBOUND ? stalled.contactName : repName}): ${m.body}`,
	);

	const factsSummary = facts.map(
		(f) => `Fact #${f.id}: [${f.status}] ${f.field} = ${f.value}`,
	);

	const tasksSummary = tasks.map(
		(t) =>
			`Task #${t.id}: ${t.subject} (due: ${t.dueAt?.toISOString() ?? "none"}, completed: ${Boolean(t.completedAt)})`,
	);

	const previousDraftsSummary = previousDrafts.map(
		(d) =>
			`Draft (${d.status}, strategy: ${d.strategy ?? "unknown"}): ${d.draftText.slice(0, 100)}...`,
	);

	const { strategy: situationalStrategy, rationale: situationalRationale } =
		determineSituationalStrategy(
			stalled,
			deal.stage,
			facts,
			deal.whatsAppMessages,
		);

	const prompt = [
		"You are an autonomous B2B follow-up revival agent representing the seller.",
		"Your task is to craft ONE high-conversion outbound follow-up message to revive this stalled sales deal.",
		"",
		`DEAL INFORMATION:`,
		`- Deal Name: ${deal.name}`,
		`- Stage: ${deal.stage}`,
		`- Value: ${deal.amount ?? "unknown"} ${deal.currency}`,
		`- Contact: ${stalled.contactName} (${contact.phone || contact.email || "No direct handle"})`,
		`- Company: ${stalled.companyName || "Unknown"}`,
		`- Stalled Reason: ${stalled.stalledReason}`,
		`- Target Channel: ${channel}`,
		`- Target Language: ${language}`,
		`- Owning Sales Representative: ${repName}`,
		`- Seller Company: ${sellerCompany}`,
		"",
		`WORKSPACE SALES PLAYBOOK (Guidance, Tone, Product Notes):`,
		playbook || "Professional, consultative, concise. No aggressive pressure.",
		"",
		`EVIDENCE & FACTS LEDGER:`,
		factsSummary.length > 0
			? factsSummary.join("\n")
			: "No prior facts recorded.",
		"",
		`OPEN TASKS:`,
		tasksSummary.length > 0 ? tasksSummary.join("\n") : "No open tasks.",
		"",
		`PREVIOUS OUTBOUND DRAFTS:`,
		previousDraftsSummary.length > 0
			? previousDraftsSummary.join("\n")
			: "No previous outbound drafts.",
		"",
		`CONVERSATION TRANSCRIPT:`,
		historyLines.length > 0
			? historyLines.join("\n")
			: "No previous message logs.",
		"",
		`STRICT RULES:`,
		"1. Choose exactly one strategy from: ['answer_or_route', 'confirm_next_step', 'value_nudge', 'address_objection', 'polite_close_out'].",
		`   Recommended default for this deal: '${situationalStrategy}' (${situationalRationale}).`,
		`2. Write the ENTIRE draft, including greeting, message body, call to action, and sign-off, in the customer's native language (${language}).`,
		`3. SIGN-OFF RULE: NEVER write 'The Threadline Team'. Threadline is the CRM software, NOT the seller. Sign as the owning representative: ${repName}, ${sellerCompany} (e.g. for German: 'Mit freundlichen Grüßen,\\n${repName}\\n${sellerCompany}').`,
		`4. Channel format: If channel is EMAIL, generate a professional subject line in ${language}. If WHATSAPP, subject must be null.`,
		"5. GROUNDED CLAIMS ONLY: NEVER invent dates, meetings, appointments, prices, discounts, timelines, 'fast deployment', 'schnelle Bereitstellung', or certifications not present in the facts ledger or transcript.",
		'6. Return citedEvidence as an array of objects: [{"evidenceId": string, "kind": string, "quote": string}]. Never return raw strings.',
		"",
		"Return a valid JSON object conforming exactly to this schema:",
		JSON.stringify({
			strategy: situationalStrategy,
			rationale: situationalRationale,
			subject: channel === "EMAIL" ? `Subject line in ${language}` : null,
			draftText: "Complete follow-up message ready to send",
			confidence: 0.95,
			citedEvidence: [
				{
					evidenceId: "fact_id_or_msg_id",
					kind: "fact",
					quote: "Exact quote from ledger or conversation",
				},
			],
		}),
	].join("\n");

	const { ai, model } = getSmartClient();

	let rawResponse = "";
	try {
		const res = await ai.models.generateContent({
			model,
			contents: prompt,
			config: {
				responseMimeType: "application/json",
				abortSignal: AbortSignal.timeout(60000),
			},
		});
		rawResponse = res.text || "{}";
	} catch (error) {
		console.error(
			`[RevivalAgent] Generation failed for deal ${stalled.dealId}:`,
			error,
		);
		return null;
	}

	let strategy: RevivalStrategy = situationalStrategy;
	let rationale = situationalRationale;
	let subject: string | null = null;
	let draftText = "";
	let confidence = 0.85;
	let rawCitedEvidence: unknown = [];

	try {
		const parsed = JSON.parse(rawResponse) as Record<string, unknown>;
		if (
			typeof parsed.strategy === "string" &&
			[
				"answer_or_route",
				"confirm_next_step",
				"value_nudge",
				"address_objection",
				"polite_close_out",
			].includes(parsed.strategy)
		) {
			strategy = parsed.strategy as RevivalStrategy;
		}
		if (typeof parsed.rationale === "string" && parsed.rationale.trim()) {
			rationale = parsed.rationale.trim();
		}
		if (typeof parsed.subject === "string") {
			subject = parsed.subject.trim();
		}
		if (typeof parsed.draftText === "string") {
			draftText = parsed.draftText.trim();
		}
		if (typeof parsed.confidence === "number") {
			confidence = Math.min(1.0, Math.max(0.1, parsed.confidence));
		}
		rawCitedEvidence = parsed.citedEvidence ?? parsed.citedEvidenceIds;
	} catch {
		draftText = rawResponse.slice(0, 300);
	}

	if (!draftText.trim()) {
		return null;
	}

	const evidenceContext: EvidenceSourceContext = {
		facts: facts.map((f) => ({ field: f.field, value: f.value, id: f.id })),
		messages: deal.whatsAppMessages.map((m) => ({
			body: m.body,
			sender: m.senderName || m.senderPhone || "",
			timestamp: m.timestamp.toISOString(),
		})),
		tasks: tasks.map((t) => ({
			subject: t.subject || "Follow-up task",
			dueAt: t.dueAt?.toISOString() ?? null,
		})),
	};

	draftText = await applyClaimGuard(
		draftText,
		prompt,
		evidenceContext,
		ai,
		model,
	);

	if (
		draftText.includes("The Threadline Team") ||
		draftText.includes("Threadline Team")
	) {
		draftText = draftText
			.replace(/The\s+Threadline\s+Team/gi, `${repName}, ${sellerCompany}`)
			.replace(/Threadline\s+Team/gi, `${repName}, ${sellerCompany}`);
	}

	const structuredCitations = parseStructuredCitations(
		rawCitedEvidence,
		facts,
		deal.whatsAppMessages,
	);

	let waLink: string | null = null;
	if (channel === "WHATSAPP" && contact.phone) {
		const cleanPhone = contact.phone.replace(/[^0-9]/g, "");
		waLink = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(draftText)}`;
	}

	const created = await db.outboundDraft.create({
		data: {
			dealId: stalled.dealId,
			contactId: stalled.contactId,
			channel,
			recipientPhone: contact.phone || null,
			recipientEmail: contact.email || null,
			subject,
			language,
			strategy,
			contextRationale: rationale,
			draftText,
			confidence,
			citedEvidence: structuredCitations as unknown as Prisma.InputJsonValue,
			stalledReason: stalled.stalledReason,
			priorityScore: stalled.priorityScore,
			status: OutboundDraftStatus.PENDING_APPROVAL,
			waLink,
		},
	});

	await postDraftToSlack(created.id);

	await db.agentEvent.create({
		data: {
			id: randomUUID(),
			sessionId: `revival-${stalled.dealId}`,
			contactId: stalled.contactId,
			type: "revival.draft_created",
			data: {
				draftId: created.id,
				dealId: stalled.dealId,
				strategy,
				rationale,
				priorityScore: stalled.priorityScore,
				channel,
			},
			emittedAt: new Date(),
		},
	});

	return {
		draftId: created.id,
		dealId: stalled.dealId,
		contactId: stalled.contactId,
		channel,
		strategy,
		rationale,
		subject,
		draftText,
		language,
		confidence,
		citedEvidence: structuredCitations,
		citedEvidenceIds: structuredCitations.map((c) => c.evidenceId),
		waLink,
		stalledReason: stalled.stalledReason,
		priorityScore: stalled.priorityScore,
	};
}

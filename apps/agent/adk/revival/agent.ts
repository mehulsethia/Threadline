import { randomUUID } from "node:crypto";
import {
	ActivityType,
	db,
	EmailDirection,
	formatDealStage,
	OutboundDraftStatus,
	type Prisma,
} from "@crm/db";
import { notify } from "@crm/db/notifications";
import { readPlaybook } from "@crm/db/settings";
import { WORKSPACE_ID } from "@crm/db/workspace";
import { z } from "zod";
import { getSmartClient } from "../extraction";
import {
	assertGreetingMatchesContact,
	detectContactInboundLanguage,
	type EvidenceSourceContext,
	stripUnsupportedClaims,
	verifyFactualClaims,
} from "./claim-guard";
import { messagesForContact, type StalledDealInfo } from "./detector";
import { postDraftToSlack } from "./slack";

const REVIVAL_STRATEGIES = [
	"answer_or_route",
	"confirm_next_step",
	"value_nudge",
	"address_objection",
	"polite_close_out",
] as const;

export type RevivalStrategy = (typeof REVIVAL_STRATEGIES)[number];

type SituationalStrategy = { strategy: RevivalStrategy; rationale: string };

/**
 * A citation as the model returns it: an object, or a bare id or quote, which
 * is read as both.
 */
const modelCitation = z.union([
	z
		.object({
			evidenceId: z.string().optional(),
			id: z.string().optional(),
			quote: z.string().optional(),
			detail: z.string().optional(),
		})
		.transform((c) => ({
			evidenceId: c.evidenceId ?? c.id ?? "",
			quote: c.quote ?? c.detail ?? "",
		})),
	z
		.string()
		.transform((text) => ({ evidenceId: text.trim(), quote: text.trim() })),
]);

export type ModelCitation = z.infer<typeof modelCitation>;

const modelCitations = z
	.array(modelCitation.catch({ evidenceId: "", quote: "" }))
	.catch([]);

/** The draft JSON, parsed once; anything malformed falls back field by field. */
const draftResponse = z
	.object({
		strategy: z.enum(REVIVAL_STRATEGIES).optional().catch(undefined),
		rationale: z.string().optional().catch(undefined),
		subject: z.string().nullable().optional().catch(null),
		draftText: z.string().optional().catch(undefined),
		confidence: z.number().optional().catch(undefined),
		citedEvidence: modelCitations.optional(),
		citedEvidenceIds: modelCitations.optional(),
	})
	.catch({});

const regeneratedDraft = z
	.object({ draftText: z.string().optional().catch(undefined) })
	.catch({});

/** Model text that must be JSON; a parse failure is a schema failure. */
const jsonText = z.string().transform((text, ctx) => {
	try {
		return JSON.parse(text);
	} catch {
		ctx.addIssue({ code: "custom", message: "The model did not return JSON." });
		return z.NEVER;
	}
});

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
): SituationalStrategy {
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

function normalizeQuote(text: string): string {
	return text.toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Turns the model's citations into ledger references. A citation is kept only
 * when it resolves to a real fact, message or task on this deal, by id or by a
 * quote that appears in that record; the stored quote is always the record's
 * own text, so a citation can never carry words the source does not contain.
 */
export function parseStructuredCitations(
	rawCitations: readonly ModelCitation[],
	facts: Array<{ id: string; field: string; value: string }>,
	messages: Array<{ id: string; body: string }>,
	tasks: Array<{ id: string; subject: string | null }> = [],
): CitedEvidenceItem[] {
	const structured: CitedEvidenceItem[] = [];
	const seen = new Set<string>();

	const push = (item: CitedEvidenceItem) => {
		if (seen.has(item.evidenceId)) return;
		seen.add(item.evidenceId);
		structured.push(item);
	};

	const resolve = (id: string, quote: string): CitedEvidenceItem | null => {
		const fact = facts.find((f) => f.id === id);
		if (fact) {
			return {
				evidenceId: fact.id,
				kind: "fact",
				quote: `${fact.field}: ${fact.value}`,
			};
		}
		const message = messages.find((m) => m.id === id);
		if (message) {
			return { evidenceId: message.id, kind: "message", quote: message.body };
		}
		const task = tasks.find((t) => t.id === id);
		if (task?.subject) {
			return { evidenceId: task.id, kind: "task", quote: task.subject };
		}

		const needle = normalizeQuote(quote);
		if (needle.length < 8) return null;
		const quotedMessage = messages.find((m) =>
			normalizeQuote(m.body).includes(needle),
		);
		if (quotedMessage) {
			return {
				evidenceId: quotedMessage.id,
				kind: "message",
				quote: quotedMessage.body,
			};
		}
		const quotedFact = facts.find((f) => {
			const hay = normalizeQuote(`${f.field} ${f.value}`);
			return hay.includes(needle) || needle.includes(normalizeQuote(f.value));
		});
		if (quotedFact) {
			return {
				evidenceId: quotedFact.id,
				kind: "fact",
				quote: `${quotedFact.field}: ${quotedFact.value}`,
			};
		}
		return null;
	};

	for (const item of rawCitations) {
		const resolved = resolve(item.evidenceId, item.quote);
		if (resolved) push(resolved);
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
		const regenerated = jsonText
			.pipe(regeneratedDraft)
			.safeParse(regenRes.text ?? "");
		if (regenerated.success && regenerated.data.draftText?.trim()) {
			currentDraft = regenerated.data.draftText.trim();
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
						where: {
							OR: [{ contactId: stalled.contactId }, { contactId: null }],
						},
						orderBy: { timestamp: "asc" },
						take: 30,
					},
					_count: { select: { contacts: true } },
				},
			}),
			db.contactFact.findMany({
				where: {
					dealId: stalled.dealId,
					OR: [{ contactId: stalled.contactId }, { contactId: null }],
				},
				select: {
					id: true,
					contactId: true,
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
			db.organization.findUnique({
				where: { id: WORKSPACE_ID },
				select: { name: true },
			}),
		]);

	if (!contact || !deal || contact.optedOut) {
		return null;
	}

	// Only this contact's own thread feeds the prompt, the language and the
	// citations; another contact's messages on the same deal never leak in.
	const threadMessages = messagesForContact(
		deal.whatsAppMessages,
		stalled.contactId,
		deal._count.contacts,
	);

	const hasPhone = Boolean(contact.phone?.trim());
	const hasEmail = Boolean(contact.email?.trim());
	let channel: "WHATSAPP" | "EMAIL" = stalled.lastInboundChannel ?? "WHATSAPP";
	if (channel === "WHATSAPP" && !hasPhone && hasEmail) {
		channel = "EMAIL";
	}

	const contactLanguageFact = facts.find(
		(f) => f.field === "language" && f.contactId === stalled.contactId,
	);
	const language = detectContactInboundLanguage(
		threadMessages,
		stalled.contactId,
		contactLanguageFact?.value,
	);

	// Threadline is the CRM, never the seller; with no owner the draft is
	// signed by the workspace alone rather than an invented rep.
	const sellerCompany = organization?.name?.trim() || "";
	const repName = deal.owner?.name?.trim() || "";
	const signature = [repName, sellerCompany].filter(Boolean).join("\n");

	const historyLines = threadMessages.map(
		(m) =>
			`Message #${m.id} [${m.timestamp.toISOString()}] (${m.direction === EmailDirection.INBOUND ? stalled.contactName : repName || sellerCompany || "Seller"}): ${m.body}`,
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
		determineSituationalStrategy(stalled, deal.stage, facts, threadMessages);

	const prompt = [
		"You are an autonomous B2B follow-up revival agent representing the seller.",
		"Your task is to craft ONE high-conversion outbound follow-up message to revive this stalled sales deal.",
		"",
		`DEAL INFORMATION:`,
		`- Deal Name: ${deal.name}`,
		`- Stage: ${formatDealStage(deal.stage)}`,
		`- Value: ${deal.amount ?? "unknown"} ${deal.currency}`,
		`- Contact: ${stalled.contactName} (${contact.phone || contact.email || "No direct handle"})`,
		`- GREETING MANDATE: The draft greeting MUST address ${contact.firstName || contact.lastName || stalled.contactName}. Never address any other person.`,
		`- Company: ${stalled.companyName || "Unknown"}`,
		`- Stalled Reason: ${stalled.stalledReason}`,
		`- Target Channel: ${channel}`,
		`- Target Language: ${language}`,
		`- Owning Sales Representative: ${repName || "(none assigned)"}`,
		`- Seller Company: ${sellerCompany || "(not set)"}`,
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
		`3. SIGN-OFF RULE: NEVER write 'The Threadline Team' or 'Threadline'. Threadline is the CRM software, NOT the seller. End with a closing in the customer's language followed by exactly these signature lines: ${JSON.stringify(signature)}. Never invent a name.`,
		`4. Channel format: If channel is EMAIL, generate a professional subject line in ${language}. If WHATSAPP, subject must be null.`,
		"5. GROUNDED CLAIMS ONLY: NEVER invent dates, meetings, appointments, prices, discounts, timelines, 'fast deployment', 'schnelle Bereitstellung', or certifications not present in the facts ledger or transcript.",
		'6. Return citedEvidence as an array of objects: [{"evidenceId": string, "kind": string, "quote": string}]. evidenceId MUST be a Fact #, Message # or Task # id shown above, and quote MUST be copied verbatim from that record. Never return raw strings.',
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

	const response = jsonText.pipe(draftResponse).safeParse(rawResponse);
	const parsed = response.success ? response.data : {};
	const strategy: RevivalStrategy = parsed.strategy ?? situationalStrategy;
	const rationale = parsed.rationale?.trim() || situationalRationale;
	const subject = parsed.subject?.trim() ?? null;
	const confidence =
		parsed.confidence === undefined
			? 0.85
			: Math.min(1.0, Math.max(0.1, parsed.confidence));
	const rawCitedEvidence =
		parsed.citedEvidence ?? parsed.citedEvidenceIds ?? [];
	let draftText = response.success
		? (parsed.draftText?.trim() ?? "")
		: rawResponse.slice(0, 300);

	if (!draftText.trim()) {
		return null;
	}

	const evidenceContext: EvidenceSourceContext = {
		facts: facts.map((f) => ({ field: f.field, value: f.value, id: f.id })),
		messages: threadMessages.map((m) => ({
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

	draftText = draftText.replace(
		/(?:The\s+)?Threadline\s+Team/gi,
		signature || sellerCompany,
	);

	const greetingCheck = assertGreetingMatchesContact(draftText, contact);
	if (!greetingCheck.matches) {
		console.warn(
			`[Revival Guard] Aborting draft for deal "${deal.name}": ${greetingCheck.reason}`,
		);
		return null;
	}

	const structuredCitations = parseStructuredCitations(
		rawCitedEvidence,
		facts,
		threadMessages,
		tasks,
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
			citedEvidence: structuredCitations satisfies Prisma.InputJsonValue,
			stalledReason: stalled.stalledReason,
			priorityScore: stalled.priorityScore,
			status: OutboundDraftStatus.PENDING_APPROVAL,
			waLink,
		},
	});

	await postDraftToSlack(created.id);
	await notify(db, {
		kind: "revival.draft",
		title: `Follow-up draft ready for ${deal.name}`,
		body: stalled.stalledReason ?? undefined,
		entity: "deal",
		entityId: stalled.dealId,
		source: "revival",
	});

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

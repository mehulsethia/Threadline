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
import type { StalledDealInfo } from "./detector";

export type RevivalStrategy =
	| "nudge"
	| "address_objection"
	| "new_value"
	| "confirm_next_step"
	| "polite_close_out";

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
	citedEvidenceIds: string[];
	waLink?: string | null;
	stalledReason: string;
	priorityScore: number;
};

export async function generateRevivalDraft(
	stalled: StalledDealInfo,
): Promise<RevivalDraftResult | null> {
	const [contact, deal, facts, tasks, previousDrafts, playbook] =
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
		]);

	if (!contact || !deal || contact.optedOut) {
		return null;
	}

	const hasPhone = Boolean(contact.phone?.trim());
	const hasEmail = Boolean(contact.email?.trim());
	const channel: "WHATSAPP" | "EMAIL" =
		deal.whatsAppMessages.length > 0 || hasPhone || !hasEmail
			? "WHATSAPP"
			: "EMAIL";

	const languageFact = facts.find((f) => f.field === "language");
	const language = languageFact?.value || "en";

	const historyLines = deal.whatsAppMessages.map(
		(m) =>
			`[${m.timestamp.toISOString()}] (${m.direction === EmailDirection.INBOUND ? stalled.contactName : "Us"}): ${m.body}`,
	);

	const factsSummary = facts.map(
		(f) => `Fact #${f.id}: [${f.status}] ${f.field} = ${f.value}`,
	);

	const tasksSummary = tasks.map(
		(t) =>
			`Task: ${t.subject} (due: ${t.dueAt?.toISOString() ?? "none"}, completed: ${Boolean(t.completedAt)})`,
	);

	const previousDraftsSummary = previousDrafts.map(
		(d) =>
			`Draft (${d.status}, strategy: ${d.strategy ?? "unknown"}): ${d.draftText.slice(0, 100)}...`,
	);

	const prompt = [
		"You are the Threadline Autonomous Lead Revival Agent.",
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
		"",
		`WORKSPACE SALES PLAYBOOK (Guidance, Tone, Product Notes, Sign-off):`,
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
		"1. Choose exactly one strategy from: ['nudge', 'address_objection', 'new_value', 'confirm_next_step', 'polite_close_out'].",
		"2. Write the draft in the customer's language and channel style (concise for WhatsApp; clear subject line and body for Email).",
		"3. Directly reference the actual last topic or conversation detail.",
		"4. NEVER invent prices, discounts, timelines, or commitments not present in the facts ledger or playbook.",
		"5. Return citeEvidenceIds referencing the specific Fact #id numbers or specific message lines used.",
		"",
		"Return a valid JSON object conforming exactly to this schema:",
		JSON.stringify({
			strategy: "nudge",
			rationale:
				"Explanation of why this strategy was chosen given the stalled context",
			subject: "Subject line if email, or null for WhatsApp",
			draftText: "The exact follow-up message ready to send",
			confidence: 0.95,
			citedEvidenceIds: ["fact_id_1"],
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

	let strategy: RevivalStrategy = "nudge";
	let rationale = `Revival follow-up for stalled deal (${stalled.stalledReason})`;
	let subject: string | null = null;
	let draftText = "";
	let confidence = 0.85;
	let citedEvidenceIds: string[] = [];

	try {
		const parsed = JSON.parse(rawResponse) as Record<string, unknown>;
		if (
			typeof parsed.strategy === "string" &&
			[
				"nudge",
				"address_objection",
				"new_value",
				"confirm_next_step",
				"polite_close_out",
			].includes(parsed.strategy)
		) {
			strategy = parsed.strategy as RevivalStrategy;
		}
		if (typeof parsed.rationale === "string") {
			rationale = parsed.rationale;
		}
		if (typeof parsed.subject === "string") {
			subject = parsed.subject;
		}
		if (typeof parsed.draftText === "string") {
			draftText = parsed.draftText;
		}
		if (typeof parsed.confidence === "number") {
			confidence = Math.min(1.0, Math.max(0.1, parsed.confidence));
		}
		if (Array.isArray(parsed.citedEvidenceIds)) {
			citedEvidenceIds = parsed.citedEvidenceIds.map(String);
		}
	} catch {
		draftText = rawResponse.slice(0, 300);
	}

	if (!draftText.trim()) {
		return null;
	}

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
			citedEvidence: citedEvidenceIds as unknown as Prisma.InputJsonValue,
			stalledReason: stalled.stalledReason,
			priorityScore: stalled.priorityScore,
			status: OutboundDraftStatus.PENDING_APPROVAL,
			waLink,
		},
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
		citedEvidenceIds,
		waLink,
		stalledReason: stalled.stalledReason,
		priorityScore: stalled.priorityScore,
	};
}

import { ActivityType, DealStage, db, EmailDirection } from "@crm/db";
import { DEFAULT_STAGE_SLAS, readRevivalSlas } from "@crm/db/settings";

const FX_RATES_TO_USD = new Map<string, number>(
	Object.entries({
		USD: 1.0,
		EUR: 1.08,
		GBP: 1.28,
		INR: 0.012,
		CAD: 0.73,
		AUD: 0.65,
		JPY: 0.0066,
		CHF: 1.12,
		AED: 0.27,
		SGD: 0.74,
	}),
);

const STAGE_WEIGHTS = {
	[DealStage.UNQUALIFIED_TO_BUY]: 1.0,
	[DealStage.QUALIFIED_TO_BUY]: 1.5,
	[DealStage.DEMO_BOOKED]: 2.0,
	[DealStage.CONTRACT_SENT]: 2.5,
	[DealStage.DECISION_MAKER_BOUGHT_IN]: 3.0,
	[DealStage.CLOSED_WON]: 0.0,
	[DealStage.CLOSED_LOST]: 0.0,
} satisfies Record<DealStage, number>;

const OPT_OUT_PATTERNS = [
	/\bnot interested\b/i,
	/\bunsubscribe\b/i,
	// A bare "STOP" reply, or an explicit request to stop messaging. A plain
	// /\bstop\b/ opted out "we can't stop the rollout".
	/^\s*stop\s*[.!]?\s*$/i,
	/\bstop (?:messaging|contacting|emailing|texting) (?:me|us)\b/i,
	/\bleave me alone\b/i,
	/\bdon'?t contact\b/i,
	/\bkein interesse\b/i,
	/\bno me interesa\b/i,
	/\bpas int[eé]ress[eé]\b/i,
	/\bremove me\b/i,
];

type RevivalCandidate = {
	contactId: string;
	role: string | null;
	contact: { firstName: string; lastName: string | null };
};

/**
 * The one contact a revival draft is addressed to: whoever on the deal wrote
 * to us most recently, else the contact marked primary, else a stable pick.
 * `deal.contacts[0]` used to be unordered, so a multi-contact deal could get
 * a draft greeting one person in another person's language.
 */
export function pickRevivalContact<C extends RevivalCandidate>(
	contacts: C[],
	inboundNewestFirst: Array<{ contactId: string | null }>,
): C | undefined {
	if (contacts.length <= 1) return contacts[0];

	const byId = new Map(contacts.map((c) => [c.contactId, c]));
	for (const message of inboundNewestFirst) {
		const match = message.contactId ? byId.get(message.contactId) : undefined;
		if (match) return match;
	}

	const primary = contacts.find((c) => /primary/i.test(c.role ?? ""));
	if (primary) return primary;

	return [...contacts].sort((a, b) =>
		a.contactId.localeCompare(b.contactId),
	)[0];
}

/**
 * Messages that belong to this contact's thread. An unattributed message only
 * counts when the deal has a single contact, so it cannot be someone else's.
 */
export function messagesForContact<M extends { contactId: string | null }>(
	messages: M[],
	contactId: string,
	dealContactCount: number,
): M[] {
	return messages.filter(
		(m) =>
			m.contactId === contactId ||
			(m.contactId === null && dealContactCount <= 1),
	);
}

export type StalledDealInfo = {
	dealId: string;
	dealName: string;
	stage: DealStage;
	value: number | null;
	currency: string;
	normalisedValueUsd: number;
	contactId: string;
	contactName: string;
	contactPhone?: string | null;
	contactEmail?: string | null;
	contactTimezone: string;
	companyName?: string | null;
	lastInboundAt: Date | null;
	lastInboundChannel: "WHATSAPP" | "EMAIL";
	daysSinceInbound: number;
	stalledReason: string;
	priorityScore: number;
	stageWeight: number;
	stalenessFactor: number;
	unansweredQuestion?: string | null;
	overdueCheckTask?: string | null;
};

export async function detectStalledDeals(): Promise<StalledDealInfo[]> {
	const now = new Date();
	const stageSlas = await readRevivalSlas(db);

	const deals = await db.deal.findMany({
		where: {
			stage: {
				notIn: [DealStage.CLOSED_WON, DealStage.CLOSED_LOST],
			},
		},
		include: {
			company: {
				select: { id: true, name: true },
			},
			contacts: {
				include: {
					contact: {
						select: {
							id: true,
							firstName: true,
							lastName: true,
							phone: true,
							email: true,
							timezone: true,
							optedOut: true,
						},
					},
				},
			},
			whatsAppMessages: {
				orderBy: { timestamp: "desc" },
				take: 20,
			},
			activities: {
				where: {
					type: ActivityType.TASK,
				},
				orderBy: { createdAt: "desc" },
			},
			outboundDrafts: {
				orderBy: { createdAt: "desc" },
				take: 5,
			},
		},
	});

	const stalledDeals: StalledDealInfo[] = [];

	for (const deal of deals) {
		if (deal.id.startsWith("seed-deal-")) continue;
		if (deal.whatsAppMessages.length === 0) continue;

		const allInbound = deal.whatsAppMessages.filter(
			(m) => m.direction === EmailDirection.INBOUND,
		);
		const primaryContact = pickRevivalContact(
			deal.contacts,
			allInbound,
		)?.contact;
		if (!primaryContact) continue;

		if (primaryContact.optedOut) continue;

		const contactMessages = messagesForContact(
			deal.whatsAppMessages,
			primaryContact.id,
			deal.contacts.length,
		);
		const leadMessages = contactMessages.filter(
			(m) => m.direction === EmailDirection.INBOUND,
		);
		if (leadMessages.length === 0) continue;
		const hasOptOut = leadMessages.some((m) =>
			OPT_OUT_PATTERNS.some((pattern) => pattern.test(m.body)),
		);
		if (hasOptOut) {
			await db.contact.update({
				where: { id: primaryContact.id },
				data: { optedOut: true },
			});
			continue;
		}

		const recentDraft = deal.outboundDrafts.find((d) => {
			const ageDays = (now.getTime() - d.createdAt.getTime()) / (86400 * 1000);
			return ageDays < 3;
		});
		if (recentDraft) continue;

		const lastInboundMsg = leadMessages[0];
		const lastInboundAt = lastInboundMsg
			? lastInboundMsg.timestamp
			: deal.createdAt;
		const daysSinceInbound =
			(now.getTime() - lastInboundAt.getTime()) / (86400 * 1000);

		const slaDays =
			stageSlas[deal.stage] ??
			DEFAULT_STAGE_SLAS[deal.stage as keyof typeof DEFAULT_STAGE_SLAS] ??
			3;

		const isPastSla = daysSinceInbound >= slaDays;

		const overdueCheckTask = deal.activities.find((a) => {
			if (!a.subject || !a.dueAt || a.completedAt) return false;
			return (
				a.subject.toLowerCase().startsWith("check:") &&
				a.dueAt.getTime() < now.getTime()
			);
		});

		let unansweredQuestion: string | null = null;
		if (lastInboundMsg) {
			const isQuestion =
				lastInboundMsg.body.includes("?") ||
				/\b(price|pricing|cost|quote|when|how much|can we|can you|could you)\b/i.test(
					lastInboundMsg.body,
				);
			if (isQuestion) {
				const laterOutbound = contactMessages.find(
					(m) =>
						m.direction === EmailDirection.OUTBOUND &&
						m.timestamp.getTime() > lastInboundMsg.timestamp.getTime(),
				);
				if (!laterOutbound) {
					unansweredQuestion = lastInboundMsg.body;
				}
			}
		}

		if (!isPastSla && !overdueCheckTask && !unansweredQuestion) {
			continue;
		}

		const reasons: string[] = [];
		if (isPastSla) {
			reasons.push(
				`No inbound message for ${Math.floor(daysSinceInbound)} days (stage SLA: ${slaDays}d)`,
			);
		}
		if (overdueCheckTask) {
			reasons.push(`Overdue task: "${overdueCheckTask.subject}"`);
		}
		if (unansweredQuestion) {
			reasons.push(
				`Unanswered question from lead: "${unansweredQuestion.slice(0, 60)}"`,
			);
		}

		const currencyCode = deal.currency?.toUpperCase() || "USD";
		const fxRate = FX_RATES_TO_USD.get(currencyCode) ?? 1.0;
		const rawValue = deal.amount !== null ? Number(deal.amount) : 10000;
		const normalisedValueUsd = (rawValue / 100) * fxRate;

		const stageWeight = STAGE_WEIGHTS[deal.stage];
		const stalenessFactor = Math.max(1.0, daysSinceInbound / slaDays);
		const priorityScore = Math.round(
			normalisedValueUsd * stageWeight * stalenessFactor,
		);

		stalledDeals.push({
			dealId: deal.id,
			dealName: deal.name,
			stage: deal.stage,
			value: deal.amount !== null ? Number(deal.amount) : null,
			currency: currencyCode,
			normalisedValueUsd,
			contactId: primaryContact.id,
			contactName:
				`${primaryContact.firstName} ${primaryContact.lastName || ""}`.trim(),
			contactPhone: primaryContact.phone,
			contactEmail: primaryContact.email,
			contactTimezone: primaryContact.timezone || "UTC",
			companyName: deal.company?.name,
			lastInboundAt,
			lastInboundChannel:
				lastInboundMsg?.senderPhone?.includes("@") ||
				(primaryContact.email && !primaryContact.phone)
					? "EMAIL"
					: "WHATSAPP",
			daysSinceInbound: Math.floor(daysSinceInbound),
			stalledReason: reasons.join("; "),
			priorityScore,
			stageWeight,
			stalenessFactor: Number(stalenessFactor.toFixed(2)),
			unansweredQuestion,
			overdueCheckTask: overdueCheckTask?.subject ?? null,
		});
	}

	return stalledDeals.sort((a, b) => b.priorityScore - a.priorityScore);
}

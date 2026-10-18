import {
	ActivityType,
	db,
	EmailDirection,
	FactStatus,
	formatDealStage,
} from "@crm/db";
import { readPlaybook } from "@crm/db/settings";
import { readWorkspaceIdentity } from "@crm/db/workspace";
import { ASSIST } from "./assist-config";

export type EvidenceLine = { id: string; kind: string; text: string };

export type DealContext = {
	dealId: string;
	dealName: string;
	stage: string;
	amount: string | null;
	currency: string;
	contactName: string | null;
	contactEmail: string | null;
	contactPhone: string | null;
	companyName: string | null;
	repName: string | null;
	sellerName: string | null;
	sellerProfile: string | null;
	playbook: string | null;
	lastInboundAt: Date | null;
	lastOutboundAt: Date | null;
	inboundLast14d: number;
	outboundLast14d: number;
	evidence: EvidenceLine[];
	prompt: string;
};

function clip(text: string): string {
	const trimmed = text.replace(/\s+/g, " ").trim();
	return trimmed.length > ASSIST.context.maxCharactersPerMessage
		? `${trimmed.slice(0, ASSIST.context.maxCharactersPerMessage)}…`
		: trimmed;
}

export async function loadDealContext(
	dealId: string,
): Promise<DealContext | null> {
	const deal = await db.deal.findUnique({
		where: { id: dealId },
		select: {
			id: true,
			name: true,
			stage: true,
			amount: true,
			currency: true,
			expectedCloseDate: true,
			company: { select: { name: true } },
			owner: { select: { name: true } },
			contacts: {
				take: 1,
				select: {
					contact: {
						select: {
							id: true,
							firstName: true,
							lastName: true,
							email: true,
							phone: true,
							title: true,
						},
					},
				},
			},
		},
	});
	if (!deal) return null;

	const contact = deal.contacts[0]?.contact ?? null;
	const [facts, messages, emails, activities, commitments, playbook, identity] =
		await Promise.all([
			db.contactFact.findMany({
				where: {
					OR: [{ dealId }, ...(contact ? [{ contactId: contact.id }] : [])],
					status: { in: [FactStatus.APPLIED, FactStatus.PROPOSED] },
				},
				select: { id: true, field: true, value: true, status: true },
				orderBy: { observedAt: "desc" },
				take: 60,
			}),
			db.whatsAppMessage.findMany({
				where: { dealId },
				orderBy: { timestamp: "desc" },
				take: ASSIST.context.maxMessages,
				select: {
					id: true,
					body: true,
					direction: true,
					senderName: true,
					timestamp: true,
				},
			}),
			contact
				? db.emailMessage.findMany({
						where: { thread: { contactId: contact.id } },
						orderBy: { sentAt: "desc" },
						take: ASSIST.context.maxEmailMessages,
						select: {
							id: true,
							body: true,
							snippet: true,
							direction: true,
							fromName: true,
							fromEmail: true,
							sentAt: true,
						},
					})
				: Promise.resolve([]),
			db.activity.findMany({
				where: { dealId },
				orderBy: { createdAt: "desc" },
				take: ASSIST.context.maxActivities,
				select: {
					id: true,
					type: true,
					subject: true,
					body: true,
					dueAt: true,
					completedAt: true,
					occurredAt: true,
					createdAt: true,
				},
			}),
			db.commitment.findMany({
				where: { dealId },
				orderBy: { createdAt: "desc" },
				take: 20,
			}),
			readPlaybook(db),
			readWorkspaceIdentity(db),
		]);

	const evidence: EvidenceLine[] = [];
	for (const fact of facts) {
		evidence.push({
			id: fact.id,
			kind: "fact",
			text: `${fact.field} = ${fact.value}${fact.status === FactStatus.PROPOSED ? " (unconfirmed)" : ""}`,
		});
	}
	const contactName = contact
		? [contact.firstName, contact.lastName].filter(Boolean).join(" ")
		: null;
	const timeline = [
		...messages.map((m) => ({
			id: m.id,
			at: m.timestamp,
			inbound: m.direction === EmailDirection.INBOUND,
			who:
				m.senderName ??
				(m.direction === EmailDirection.INBOUND
					? contactName
					: deal.owner.name),
			text: m.body,
			kind: "message",
		})),
		...emails.map((e) => ({
			id: e.id,
			at: e.sentAt,
			inbound: e.direction === EmailDirection.INBOUND,
			who: e.fromName ?? e.fromEmail,
			text: e.body ?? e.snippet ?? "",
			kind: "email",
		})),
	].sort((a, b) => a.at.getTime() - b.at.getTime());
	for (const item of timeline) {
		evidence.push({
			id: item.id,
			kind: item.kind,
			text: `[${item.at.toISOString().slice(0, 16)}] ${item.who ?? "Unknown"}: ${clip(item.text)}`,
		});
	}
	for (const activity of activities) {
		if (activity.type === ActivityType.TASK) {
			evidence.push({
				id: activity.id,
				kind: "task",
				text: `Task: ${activity.subject ?? ""} (due ${activity.dueAt?.toISOString().slice(0, 10) ?? "none"}, ${activity.completedAt ? "done" : "open"})`,
			});
		} else if (activity.body || activity.subject) {
			evidence.push({
				id: activity.id,
				kind: "activity",
				text: `${activity.type} ${(activity.occurredAt ?? activity.createdAt).toISOString().slice(0, 10)}: ${clip(`${activity.subject ?? ""} ${activity.body ?? ""}`)}`,
			});
		}
	}
	for (const commitment of commitments) {
		evidence.push({
			id: commitment.id,
			kind: "promise",
			text: `Promise by ${commitment.owner === "us" ? "us" : "the lead"}: ${commitment.text} (due ${commitment.dueAt?.toISOString().slice(0, 10) ?? "none"}, ${commitment.status})`,
		});
	}

	const windowStart = Date.now() - ASSIST.score.engagementWindowMs;
	const inbound = timeline.filter((t) => t.inbound);
	const outbound = timeline.filter((t) => !t.inbound);
	const lastOf = (items: typeof timeline) => items.at(-1)?.at ?? null;

	const sellerProfile = identity?.profile
		? [
				identity.profile.narrative,
				identity.profile.sections.sells &&
					`Sells: ${identity.profile.sections.sells}`,
				identity.profile.sections.sellsTo &&
					`Sells to: ${identity.profile.sections.sellsTo}`,
			]
				.filter(Boolean)
				.join(" ")
		: null;

	const header = [
		`Deal: ${deal.name}`,
		`Stage: ${formatDealStage(deal.stage)}`,
		`Value: ${deal.amount ? `${deal.amount} ${deal.currency}` : "unknown"}`,
		`Expected close: ${deal.expectedCloseDate?.toISOString().slice(0, 10) ?? "unknown"}`,
		`Lead: ${contactName ?? "unknown"}${contact?.title ? `, ${contact.title}` : ""}`,
		`Lead company: ${deal.company?.name ?? "unknown"}`,
		`Our rep: ${deal.owner.name}`,
		`Our company: ${identity?.name ?? "unknown"}${sellerProfile ? ` — ${sellerProfile}` : ""}`,
		`Today: ${new Date().toISOString().slice(0, 10)}`,
	];

	return {
		dealId: deal.id,
		dealName: deal.name,
		stage: deal.stage,
		amount: deal.amount?.toString() ?? null,
		currency: deal.currency,
		contactName,
		contactEmail: contact?.email ?? null,
		contactPhone: contact?.phone ?? null,
		companyName: deal.company?.name ?? null,
		repName: deal.owner.name,
		sellerName: identity?.name ?? null,
		sellerProfile,
		playbook: playbook || null,
		lastInboundAt: lastOf(inbound),
		lastOutboundAt: lastOf(outbound),
		inboundLast14d: inbound.filter((t) => t.at.getTime() >= windowStart).length,
		outboundLast14d: outbound.filter((t) => t.at.getTime() >= windowStart)
			.length,
		evidence,
		prompt: [
			...header,
			"",
			"EVIDENCE (cite by id):",
			...evidence.map((line) => `#${line.id} (${line.kind}) ${line.text}`),
			...(playbook ? ["", `OUR PLAYBOOK: ${playbook}`] : []),
		].join("\n"),
	};
}

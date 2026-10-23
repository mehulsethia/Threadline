import { type Db, FactStatus, OutboundDraftStatus } from "@crm/db";
import { citedEvidenceList } from "@crm/validation/cited-evidence";
import { parseFactEvidence } from "@crm/validation/fact-evidence";
import { Injectable } from "@nestjs/common";
import { InjectDatabase } from "../database/database.constants";
import type { InboxItem, InboxList } from "./inbox.contracts";
import { INBOX } from "./inbox-config";

function personName(person: { firstName: string; lastName: string | null }) {
	return [person.firstName, person.lastName].filter(Boolean).join(" ");
}

@Injectable()
export class InboxService {
	constructor(@InjectDatabase() private readonly db: Db) {}

	private factWhere() {
		return {
			status: FactStatus.PROPOSED,
			field: { notIn: [...INBOX.hiddenFactFields] },
			OR: [
				{ deal: { archivedAt: null } },
				{ dealId: null, contact: { archivedAt: null } },
			],
		};
	}

	async count(): Promise<{ total: number }> {
		const [drafts, contacts, companies, facts] = await Promise.all([
			this.db.outboundDraft.count({
				where: { status: OutboundDraftStatus.PENDING_APPROVAL },
			}),
			this.db.contact.count({
				where: { pendingReview: true, archivedAt: null },
			}),
			this.db.company.count({
				where: {
					pendingReview: true,
					archivedAt: null,
					contacts: { none: { pendingReview: true, archivedAt: null } },
				},
			}),
			this.db.contactFact.count({ where: this.factWhere() }),
		]);
		return { total: drafts + contacts + companies + facts };
	}

	async list(): Promise<InboxList> {
		const [drafts, contacts, companies, facts] = await Promise.all([
			this.db.outboundDraft.findMany({
				where: { status: OutboundDraftStatus.PENDING_APPROVAL },
				orderBy: [{ priorityScore: "desc" }, { createdAt: "desc" }],
				take: INBOX.maxDrafts,
				select: {
					id: true,
					createdAt: true,
					strategy: true,
					channel: true,
					subject: true,
					draftText: true,
					contextRationale: true,
					stalledReason: true,
					proposedStage: true,
					citedEvidence: true,
					deal: {
						select: {
							id: true,
							name: true,
							company: { select: { name: true } },
						},
					},
					contact: { select: { firstName: true, lastName: true } },
				},
			}),
			this.db.contact.findMany({
				where: { pendingReview: true, archivedAt: null },
				orderBy: { createdAt: "desc" },
				take: INBOX.maxLeads,
				select: {
					id: true,
					firstName: true,
					lastName: true,
					email: true,
					createdAt: true,
					company: { select: { name: true } },
					emailThreads: {
						orderBy: { lastMessageAt: "desc" },
						take: 1,
						select: {
							subject: true,
							messages: {
								orderBy: { sentAt: "desc" },
								take: 1,
								select: { snippet: true },
							},
						},
					},
				},
			}),
			this.db.company.findMany({
				where: {
					pendingReview: true,
					archivedAt: null,
					contacts: { none: { pendingReview: true, archivedAt: null } },
				},
				orderBy: { createdAt: "desc" },
				take: INBOX.maxLeads,
				select: { id: true, name: true, domain: true, createdAt: true },
			}),
			this.db.contactFact.findMany({
				where: this.factWhere(),
				orderBy: { observedAt: "desc" },
				take: INBOX.maxFacts,
				select: {
					id: true,
					field: true,
					value: true,
					evidence: true,
					observedAt: true,
					deal: { select: { id: true, name: true } },
					contact: { select: { id: true, firstName: true, lastName: true } },
				},
			}),
		]);

		const items: InboxItem[] = [
			...drafts.map(
				(draft): InboxItem => ({
					kind: "draft",
					id: draft.id,
					at: draft.createdAt.toISOString(),
					afterCall: draft.strategy === "post_call",
					record: { kind: "deal", id: draft.deal.id, name: draft.deal.name },
					contactName: personName(draft.contact),
					companyName: draft.deal.company?.name ?? null,
					channel: draft.channel,
					subject: draft.subject,
					text: draft.draftText,
					summary: draft.contextRationale,
					reason: draft.stalledReason,
					proposedStage: draft.proposedStage,
					evidence: citedEvidenceList
						.parse(draft.citedEvidence)
						.map((cite) => ({ kind: cite.kind, text: cite.quote })),
				}),
			),
			...contacts.map((contact): InboxItem => {
				const thread = contact.emailThreads[0];
				const snippet = thread?.messages[0]?.snippet;
				return {
					kind: "lead",
					id: contact.id,
					at: contact.createdAt.toISOString(),
					record: {
						kind: "contact",
						id: contact.id,
						name: personName(contact),
					},
					email: contact.email,
					companyName: contact.company?.name ?? null,
					evidence: thread
						? [
								{
									kind: "email",
									text: [thread.subject, snippet].filter(Boolean).join(": "),
								},
							]
						: [],
				};
			}),
			...companies.map(
				(company): InboxItem => ({
					kind: "lead",
					id: company.id,
					at: company.createdAt.toISOString(),
					record: { kind: "company", id: company.id, name: company.name },
					email: company.domain,
					companyName: null,
					evidence: [],
				}),
			),
			...facts.flatMap((fact): InboxItem[] => {
				const owner = fact.deal
					? { kind: "deal" as const, id: fact.deal.id, name: fact.deal.name }
					: fact.contact
						? {
								kind: "contact" as const,
								id: fact.contact.id,
								name: personName(fact.contact),
							}
						: null;
				if (!owner) return [];
				return [
					{
						kind: "fact",
						id: fact.id,
						at: fact.observedAt.toISOString(),
						record: owner,
						field: fact.field,
						value: fact.value,
						evidence: parseFactEvidence(fact.evidence).map((item) => ({
							kind: item.kind,
							text: item.detail,
						})),
					},
				];
			}),
		];

		const rank = (item: InboxItem) =>
			item.kind === "draft"
				? item.afterCall
					? 0
					: 1
				: item.kind === "lead"
					? 2
					: 3;
		items.sort((a, b) => rank(a) - rank(b));

		return {
			counts: {
				drafts: drafts.length,
				leads: contacts.length + companies.length,
				facts: facts.length,
			},
			items,
		};
	}
}

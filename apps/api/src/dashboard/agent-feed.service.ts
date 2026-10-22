import { type Db, IntakeJobStatus, OutboundDraftStatus } from "@crm/db";
import { Injectable } from "@nestjs/common";
import { InjectDatabase } from "../database/database.constants";
import { AGENT_FEED } from "./agent-feed-config";
import type { AgentFeed, AgentFeedItem } from "./dashboard.contracts";

const SOURCE_LABEL: Record<string, string> = {
	WHATSAPP_EXPORT: "a WhatsApp chat",
	VOICE_NOTE: "a voice note",
	CALL_RECORDING: "a call recording",
	EMAIL_THREAD: "an email thread",
	SLACK_THREAD: "a Slack thread",
	MEETING_TRANSCRIPT: "a meeting transcript",
	FORM_SUBMISSION: "a form submission",
};

const CAPTURE_KINDS = ["sync.report", "contact.created"];

function name(person: { firstName: string; lastName: string | null }) {
	return [person.firstName, person.lastName].filter(Boolean).join(" ");
}

function plural(count: number, word: string): string {
	return `${count} ${word}${count === 1 ? "" : "s"}`;
}

@Injectable()
export class AgentFeedService {
	constructor(@InjectDatabase() private readonly db: Db) {}

	async activity(): Promise<AgentFeed> {
		const since = new Date(Date.now() - AGENT_FEED.windowMs);
		const take = AGENT_FEED.perSource;

		const [jobs, drafts, scored, promises, captures, stats] = await Promise.all(
			[
				this.db.intakeJob.findMany({
					where: { status: IntakeJobStatus.DONE, updatedAt: { gte: since } },
					orderBy: { updatedAt: "desc" },
					take,
					select: {
						id: true,
						sourceType: true,
						createdDealIds: true,
						createdContactIds: true,
						updatedAt: true,
					},
				}),
				this.db.outboundDraft.findMany({
					where: { createdAt: { gte: since } },
					orderBy: { createdAt: "desc" },
					take,
					select: {
						id: true,
						strategy: true,
						status: true,
						channel: true,
						createdAt: true,
						dealId: true,
						contextRationale: true,
						deal: { select: { name: true } },
						contact: { select: { firstName: true, lastName: true } },
					},
				}),
				this.db.deal.findMany({
					where: { leadScoredAt: { gte: since }, archivedAt: null },
					orderBy: { leadScoredAt: "desc" },
					take,
					select: {
						id: true,
						name: true,
						leadScore: true,
						health: true,
						leadScoredAt: true,
					},
				}),
				this.db.commitment.findMany({
					where: { createdAt: { gte: since } },
					orderBy: { createdAt: "desc" },
					take,
					select: {
						id: true,
						text: true,
						owner: true,
						dealId: true,
						createdAt: true,
						deal: { select: { name: true } },
					},
				}),
				this.db.notification.findMany({
					where: { createdAt: { gte: since }, kind: { in: CAPTURE_KINDS } },
					orderBy: { createdAt: "desc" },
					take,
					select: {
						id: true,
						kind: true,
						title: true,
						body: true,
						entity: true,
						entityId: true,
						createdAt: true,
					},
				}),
				this.stats(since),
			],
		);

		const items: AgentFeedItem[] = [
			...jobs.map(
				(job): AgentFeedItem => ({
					id: `read-${job.id}`,
					kind: "read",
					at: job.updatedAt.toISOString(),
					title: `Read ${SOURCE_LABEL[job.sourceType] ?? "a conversation"}`,
					detail: `${plural(job.createdContactIds.length, "contact")} and ${plural(job.createdDealIds.length, "deal")} filled in, each field linked to its quote`,
					record: job.createdDealIds[0]
						? { kind: "deal", id: job.createdDealIds[0] }
						: null,
					needsApproval: false,
				}),
			),
			...drafts.map((draft): AgentFeedItem => {
				const afterCall = draft.strategy === "post_call";
				const waiting = draft.status === OutboundDraftStatus.PENDING_APPROVAL;
				return {
					id: `draft-${draft.id}`,
					kind: afterCall ? "call" : "draft",
					at: draft.createdAt.toISOString(),
					title: afterCall
						? `Wrapped up a call with ${name(draft.contact)}`
						: `Drafted a follow-up to ${name(draft.contact)}`,
					detail: afterCall
						? draft.contextRationale
						: `${draft.deal.name}, by ${draft.channel === "WHATSAPP" ? "WhatsApp" : "email"}`,
					record: { kind: "deal", id: draft.dealId },
					needsApproval: waiting,
				};
			}),
			...scored.map(
				(deal): AgentFeedItem => ({
					id: `score-${deal.id}`,
					kind: "score",
					at: (deal.leadScoredAt ?? new Date()).toISOString(),
					title: `Scored ${deal.name}`,
					detail:
						deal.leadScore === null
							? null
							: `${deal.leadScore}/100${deal.health ? `, ${deal.health.replace("_", " ")}` : ""}`,
					record: { kind: "deal", id: deal.id },
					needsApproval: false,
				}),
			),
			...promises.map(
				(promise): AgentFeedItem => ({
					id: `promise-${promise.id}`,
					kind: "promise",
					at: promise.createdAt.toISOString(),
					title:
						promise.owner === "lead"
							? "Tracked a promise from the lead"
							: "Tracked a promise you made",
					detail: promise.deal
						? `${promise.text} (${promise.deal.name})`
						: promise.text,
					record: promise.dealId ? { kind: "deal", id: promise.dealId } : null,
					needsApproval: false,
				}),
			),
			...captures.map(
				(capture): AgentFeedItem => ({
					id: `capture-${capture.id}`,
					kind: capture.kind === "contact.created" ? "lead" : "read",
					at: capture.createdAt.toISOString(),
					title: capture.title,
					detail: capture.kind === "contact.created" ? capture.body : null,
					record:
						capture.entity === "contact" && capture.entityId
							? { kind: "contact", id: capture.entityId }
							: null,
					needsApproval: false,
				}),
			),
		];

		items.sort((a, b) => b.at.localeCompare(a.at));
		return { stats, items: items.slice(0, AGENT_FEED.maxItems) };
	}

	private async stats(since: Date): Promise<AgentFeed["stats"]> {
		const imported = await this.db.intakeJob.findMany({
			where: { status: IntakeJobStatus.DONE, updatedAt: { gte: since } },
			select: { createdContactIds: true },
		});
		const importedContactIds = imported.flatMap((job) => job.createdContactIds);
		const [emails, leads, scored, waiting] = await Promise.all([
			this.db.emailMessage.count({ where: { createdAt: { gte: since } } }),
			this.db.contact.count({
				where: {
					createdAt: { gte: since },
					archivedAt: null,
					OR: [
						{ source: { not: "MANUAL" } },
						{ id: { in: importedContactIds } },
					],
				},
			}),
			this.db.deal.count({ where: { leadScoredAt: { gte: since } } }),
			this.db.outboundDraft.count({
				where: { status: OutboundDraftStatus.PENDING_APPROVAL },
			}),
		]);
		return {
			conversations: imported.length + emails,
			leads,
			scored,
			waiting,
		};
	}
}

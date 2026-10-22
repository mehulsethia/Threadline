import type { Db } from "@crm/db";
import { consumeDemoQuota } from "@crm/db/demo";
import { pipelineForecast } from "@crm/db/forecast";
import { Inject, Injectable } from "@nestjs/common";
import { TRPCError } from "@trpc/server";
import type { z } from "zod";
import {
	agentEnvelope,
	agentHeaders,
	callAgent,
	requireBridge,
} from "../agent/agent-call";
import { AgentTriggerService } from "../agent/agent-trigger.service";
import { InjectDatabase } from "../database/database.constants";
import {
	type askInput,
	askOutput,
	briefOutput,
	type draftInput,
	draftOutput,
	insightsOutput,
	scoreFactors,
} from "./assist.contracts";

const AGENT_TIMEOUT_MS = 150_000;

type AgentRequest =
	| z.infer<typeof askInput>
	| z.infer<typeof draftInput>
	| { dealId: string }
	| Record<never, never>;

@Injectable()
export class AssistService {
	constructor(
		@InjectDatabase() private readonly db: Db,
		@Inject(AgentTriggerService) private readonly agent: AgentTriggerService,
	) {}

	private call<T>(
		operation: string,
		body: AgentRequest,
		schema: z.ZodType<T>,
	): Promise<T> {
		return callAgent(
			`/internal/crm/assist/${operation}`,
			body,
			schema,
			AGENT_TIMEOUT_MS,
		);
	}

	private async quota(userId: string): Promise<void> {
		if (!(await consumeDemoQuota(this.db, userId, "assist"))) {
			throw new TRPCError({
				code: "TOO_MANY_REQUESTS",
				message: "The demo account has used today's AI requests.",
			});
		}
	}

	async ask(
		userId: string,
		history: { role: "user" | "assistant"; text: string }[],
	) {
		await this.quota(userId);
		return this.call("ask", { history }, askOutput);
	}

	async streamAsk(
		userId: string,
		history: z.infer<typeof askInput>["history"],
	): Promise<Response> {
		await this.quota(userId);
		const agent = requireBridge();
		return fetch(agent.url("/internal/crm/assist/ask-stream"), {
			method: "POST",
			headers: {
				...(await agentHeaders(agent)),
				"content-type": "application/json",
			},
			body: JSON.stringify({ history }),
			signal: AbortSignal.timeout(AGENT_TIMEOUT_MS),
		});
	}

	async draft(userId: string, input: z.infer<typeof draftInput>) {
		await this.quota(userId);
		return this.call("draft", input, draftOutput.nullable());
	}

	async brief(userId: string, dealId: string) {
		await this.quota(userId);
		return this.call("brief", { dealId }, briefOutput.nullable());
	}

	async rescore(userId: string, dealId: string) {
		await this.quota(userId);
		await this.call("score", { dealId }, agentEnvelope.shape.result);
		return this.insights(dealId);
	}

	async rescoreAll(userId: string) {
		await this.quota(userId);
		return { queued: await this.agent.queueDealScoring() };
	}

	forecast() {
		return pipelineForecast(this.db);
	}

	async insights(dealId: string): Promise<z.infer<typeof insightsOutput>> {
		const [deal, promises] = await Promise.all([
			this.db.deal.findUnique({
				where: { id: dealId },
				select: {
					leadScore: true,
					leadScoreFactors: true,
					leadScoredAt: true,
					health: true,
					healthReason: true,
					winProbability: true,
				},
			}),
			this.db.commitment.findMany({
				where: { dealId },
				orderBy: [{ status: "asc" }, { dueAt: { sort: "asc", nulls: "last" } }],
			}),
		]);
		const factors = scoreFactors.safeParse(deal?.leadScoreFactors);
		return {
			leadScore: deal?.leadScore ?? null,
			factors: factors.success ? factors.data : null,
			health: deal?.health ?? null,
			healthReason: deal?.healthReason ?? null,
			winProbability: deal?.winProbability ?? null,
			scoredAt: deal?.leadScoredAt?.toISOString() ?? null,
			promises: promises.map((p) => ({
				id: p.id,
				owner: p.owner,
				text: p.text,
				dueAt: p.dueAt?.toISOString() ?? null,
				status: p.status,
				quote: p.quote,
			})),
		};
	}

	async promises(status: string | null | undefined) {
		const rows = await this.db.commitment.findMany({
			where: status ? { status } : { status: { in: ["open", "overdue"] } },
			orderBy: { dueAt: { sort: "asc", nulls: "last" } },
			take: 200,
			select: {
				id: true,
				owner: true,
				text: true,
				dueAt: true,
				status: true,
				quote: true,
				dealId: true,
				deal: { select: { name: true } },
			},
		});
		return rows.map((row) => ({
			id: row.id,
			owner: row.owner,
			text: row.text,
			dueAt: row.dueAt?.toISOString() ?? null,
			status: row.status,
			quote: row.quote,
			dealId: row.dealId,
			dealName: row.deal?.name ?? null,
		}));
	}

	async updatePromise(id: string, status: "open" | "kept" | "dropped") {
		await this.db.commitment.update({
			where: { id },
			data: {
				status,
				resolvedAt: status === "open" ? null : new Date(),
			},
		});
		return { ok: true };
	}
}

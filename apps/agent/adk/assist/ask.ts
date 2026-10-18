import { ActivityType, DealStage, db } from "@crm/db";
import { pipelineForecast } from "@crm/db/forecast";
import type { AskStreamEvent } from "@crm/validation/ask-stream";
import {
	createRunConfig,
	FunctionTool,
	Gemini,
	InMemoryRunner,
	LlmAgent,
	StreamingMode,
} from "@google/adk";
import { z } from "zod";
import { searchCrm } from "../../agent/lib/lookup";
import { ASSIST } from "./assist-config";
import { loadDealContext } from "./deal-context";

export type AskTurn = { role: "user" | "assistant"; text: string };

export type AskResult = { answer: string; tools: string[] };

export type AskEvent = AskStreamEvent;

const INSTRUCTION = `You are Threadline's CRM analyst. Answer the user's question about their sales pipeline using only the tools. Never guess numbers, names or dates.
- Call tools until you have what you need; prefer one precise call over many.
- When you mention a record, link it exactly like [Name](deal:ID), [Name](contact:ID) or [Name](company:ID) using the id from the tool result.
- Amounts are in the reporting currency the tools return.
- Be concise: lead with the direct answer, then a short bulleted list. Use a small markdown table for comparisons.
- If the data does not answer the question, say so and suggest what would.
- Reply in the user's language.`;

const stageEnum = z.enum(
	Object.values(DealStage) as [DealStage, ...DealStage[]],
);

let model: Gemini | null = null;

function gemini(): Gemini {
	model ??= new Gemini({
		model: process.env.GEMINI_ASK_MODEL || ASSIST.ask.model,
		vertexai: true,
		project: process.env.GOOGLE_CLOUD_PROJECT,
		location: process.env.GEMINI_ASK_LOCATION || ASSIST.ask.location,
	});
	return model;
}

function tools(called: string[], onTool?: (name: string) => void) {
	const track = (name: string) => {
		called.push(name);
		onTool?.(name);
		if (called.length > ASSIST.ask.maxToolCalls) {
			throw new Error("Too many tool calls for one question.");
		}
	};
	return [
		new FunctionTool({
			name: "search_records",
			description:
				"Find contacts, companies and deals by name, email, domain or keyword.",
			parameters: z.object({ query: z.string().min(1) }),
			execute: async ({ query }) => {
				track("search_records");
				return searchCrm(query, { limit: 10 });
			},
		}),
		new FunctionTool({
			name: "list_deals",
			description:
				"List deals with filters. Sort by score, value, closing date or recent activity.",
			parameters: z.object({
				stage: stageEnum.nullable().describe("Only this stage, or null."),
				health: z
					.enum(["on_track", "at_risk", "stalled"])
					.nullable()
					.describe("Only this health, or null."),
				minScore: z.number().nullable().describe("Minimum lead score 0-100."),
				closingBefore: z
					.string()
					.nullable()
					.describe("ISO date: expected close before this date."),
				includeClosed: z.boolean().describe("Include won and lost deals."),
				sortBy: z.enum(["score", "value", "closing", "recent"]),
			}),
			execute: async (args) => {
				track("list_deals");
				const deals = await db.deal.findMany({
					where: {
						archivedAt: null,
						stage:
							args.stage ??
							(args.includeClosed
								? undefined
								: { notIn: [DealStage.CLOSED_WON, DealStage.CLOSED_LOST] }),
						health: args.health ?? undefined,
						leadScore:
							args.minScore === null ? undefined : { gte: args.minScore },
						expectedCloseDate: args.closingBefore
							? { lte: new Date(args.closingBefore) }
							: undefined,
					},
					orderBy:
						args.sortBy === "score"
							? { leadScore: { sort: "desc", nulls: "last" } }
							: args.sortBy === "value"
								? { baseAmount: { sort: "desc", nulls: "last" } }
								: args.sortBy === "closing"
									? { expectedCloseDate: { sort: "asc", nulls: "last" } }
									: { lastActivityAt: { sort: "desc", nulls: "last" } },
					take: ASSIST.ask.listLimit,
					select: {
						id: true,
						name: true,
						stage: true,
						amount: true,
						currency: true,
						leadScore: true,
						health: true,
						healthReason: true,
						winProbability: true,
						expectedCloseDate: true,
						lastActivityAt: true,
						company: { select: { id: true, name: true } },
						owner: { select: { name: true } },
					},
				});
				return { deals };
			},
		}),
		new FunctionTool({
			name: "get_deal",
			description:
				"Everything known about one deal: facts, messages, tasks, promises, score.",
			parameters: z.object({ dealId: z.string() }),
			execute: async ({ dealId }) => {
				track("get_deal");
				const [context, deal] = await Promise.all([
					loadDealContext(dealId),
					db.deal.findUnique({
						where: { id: dealId },
						select: {
							leadScore: true,
							leadScoreFactors: true,
							health: true,
							healthReason: true,
							winProbability: true,
						},
					}),
				]);
				if (!context) return { error: "No deal with that id." };
				return { details: context.prompt, score: deal };
			},
		}),
		new FunctionTool({
			name: "search_conversations",
			description:
				"Search message, email, transcript and fact text for a phrase, e.g. a competitor name or 'discount'.",
			parameters: z.object({ text: z.string().min(2) }),
			execute: async ({ text }) => {
				track("search_conversations");
				const [messages, emails, facts] = await Promise.all([
					db.whatsAppMessage.findMany({
						where: { body: { contains: text, mode: "insensitive" } },
						take: 15,
						orderBy: { timestamp: "desc" },
						select: {
							body: true,
							timestamp: true,
							deal: { select: { id: true, name: true } },
							contact: {
								select: { id: true, firstName: true, lastName: true },
							},
						},
					}),
					db.emailMessage.findMany({
						where: { body: { contains: text, mode: "insensitive" } },
						take: 10,
						orderBy: { sentAt: "desc" },
						select: {
							snippet: true,
							sentAt: true,
							fromName: true,
							thread: { select: { contactId: true, subject: true } },
						},
					}),
					db.contactFact.findMany({
						where: { value: { contains: text, mode: "insensitive" } },
						take: 15,
						select: {
							field: true,
							value: true,
							deal: { select: { id: true, name: true } },
							contact: {
								select: { id: true, firstName: true, lastName: true },
							},
						},
					}),
				]);
				return { messages, emails, facts };
			},
		}),
		new FunctionTool({
			name: "pipeline_forecast",
			description:
				"Pipeline totals by stage, weighted forecast by month, health counts, hot leads, deals at risk, overdue promises.",
			parameters: z.object({}),
			execute: async () => {
				track("pipeline_forecast");
				return pipelineForecast(db);
			},
		}),
		new FunctionTool({
			name: "list_promises",
			description:
				"Promises made by us or by leads, with due dates and status (open, overdue, kept).",
			parameters: z.object({
				status: z.enum(["open", "overdue", "kept"]).nullable(),
				owner: z.enum(["us", "lead"]).nullable(),
			}),
			execute: async ({ status, owner }) => {
				track("list_promises");
				const promises = await db.commitment.findMany({
					where: {
						status: status ?? undefined,
						owner: owner ?? undefined,
					},
					orderBy: { dueAt: { sort: "asc", nulls: "last" } },
					take: ASSIST.ask.listLimit,
					select: {
						owner: true,
						text: true,
						dueAt: true,
						status: true,
						quote: true,
						deal: { select: { id: true, name: true } },
					},
				});
				return { promises };
			},
		}),
		new FunctionTool({
			name: "list_tasks",
			description: "Open follow-up tasks, optionally only overdue ones.",
			parameters: z.object({ overdueOnly: z.boolean() }),
			execute: async ({ overdueOnly }) => {
				track("list_tasks");
				const tasks = await db.activity.findMany({
					where: {
						type: ActivityType.TASK,
						completedAt: null,
						dueAt: overdueOnly ? { lt: new Date() } : undefined,
					},
					orderBy: { dueAt: { sort: "asc", nulls: "last" } },
					take: ASSIST.ask.listLimit,
					select: {
						subject: true,
						dueAt: true,
						deal: { select: { id: true, name: true } },
					},
				});
				return { tasks };
			},
		}),
	];
}

export function askCrm(history: AskTurn[]): Promise<AskResult> {
	return runAsk(history);
}

export async function runAsk(
	history: AskTurn[],
	emit?: (event: AskEvent) => void,
): Promise<AskResult> {
	const called: string[] = [];
	const agent = new LlmAgent({
		name: "threadline_crm_analyst",
		model: gemini(),
		instruction: `${INSTRUCTION}\nToday is ${new Date().toISOString().slice(0, 10)}.`,
		tools: tools(called, (name) => emit?.({ type: "tool", name })),
	});
	const runner = new InMemoryRunner({ agent });
	const turns = history.slice(-ASSIST.ask.maxTurns);
	const question = turns.at(-1)?.text ?? "";
	const earlier = turns
		.slice(0, -1)
		.map((t) => `${t.role === "user" ? "User" : "You"}: ${t.text}`)
		.join("\n");
	let answer = "";

	const run = async () => {
		for await (const event of runner.runEphemeral({
			userId: "threadline-ask",
			newMessage: {
				parts: [
					{
						text: earlier
							? `Conversation so far:\n${earlier}\n\nNew question: ${question}`
							: question,
					},
				],
			},
			runConfig: emit
				? createRunConfig({ streamingMode: StreamingMode.SSE })
				: undefined,
		})) {
			for (const partItem of event.content?.parts ?? []) {
				if (
					!("text" in partItem) ||
					!partItem.text ||
					event.author === "user"
				) {
					continue;
				}
				if (event.partial) {
					emit?.({ type: "text", delta: partItem.text });
				} else {
					answer = partItem.text.trim();
				}
			}
		}
	};

	await Promise.race([
		run(),
		new Promise<never>((_, reject) =>
			setTimeout(
				() => reject(new Error("The question took too long to answer.")),
				ASSIST.ask.timeoutMs,
			),
		),
	]);
	const result = {
		answer: answer || "I could not find an answer in your CRM data.",
		tools: called,
	};
	emit?.({ type: "done", ...result });
	return result;
}

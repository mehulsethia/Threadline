import { FunctionTool, Gemini, InMemoryRunner, LlmAgent } from "@google/adk";
import { z } from "zod";
import { FOLLOW_UP } from "./follow-up-config";

export type FollowUpContext = {
	source: string;
	lead: string;
	company: string | null;
	need: string | null;
	budget: number | null;
	currency: string | null;
	timeline: string | null;
	stage: string | null;
	objections: string[];
	nextStep: {
		value: string | null;
		owner: "us" | "lead" | null;
		dueAt: string | null;
	};
	sentiment: string | null;
	suggestedFacts: number;
	leadScore: number | null;
	health: string | null;
	newPromises: number;
	alreadyResearched: boolean;
	domainHint: string | null;
	today: string;
};

export type FollowUpActions = {
	research: (domain: string | null) => Promise<string>;
	createTask: (subject: string, dueAt: string | null) => Promise<string>;
	alert: (title: string, body: string) => Promise<string>;
};

export type FollowUpOutcome =
	| { ok: true; tools: string[]; createdTask: boolean; summary: string }
	| { ok: false; reason: string };

const INSTRUCTION = `You are Threadline's follow-up agent. A sales conversation was just imported and its facts are already saved with evidence.
Decide what should happen next, using only the tools. Rules:
- research_company: call it only if a company is named, it is not already researched, and knowing the company helps the deal. Pass the domain if one is given.
- create_follow_up_task: if the next step is ours, create one task for it. If the next step is the lead's and has a due date, create one task to check on it after that date. Never invent a step that is not in the facts. Due dates are ISO 8601.
- alert_team: call it only when a rep should act today: a hot lead, a deadline within 7 days, a strong objection, negative sentiment, or suggested facts that need review. Keep the title under 80 characters.
- Do nothing else. When done, reply with one sentence that says what you did and why.`;

let model: Gemini | null = null;

function gemini(): Gemini {
	model ??= new Gemini({
		model: process.env.GEMINI_FAST_MODEL || "gemini-2.5-flash",
		vertexai: true,
		project: process.env.GOOGLE_CLOUD_PROJECT,
		location: process.env.GEMINI_FAST_LOCATION || "us-central1",
	});
	return model;
}

export async function runFollowUpAgent(
	context: FollowUpContext,
	actions: FollowUpActions,
): Promise<FollowUpOutcome> {
	const called: string[] = [];
	let createdTask = false;
	const guard = (name: string) => {
		called.push(name);
		if (called.length > FOLLOW_UP.maxToolCalls) {
			throw new Error("Follow-up agent made too many tool calls.");
		}
	};

	const agent = new LlmAgent({
		name: "threadline_follow_up_agent",
		model: gemini(),
		instruction: INSTRUCTION,
		tools: [
			new FunctionTool({
				name: "research_company",
				description:
					"Research the lead's company with Google Search grounding and save a verified profile.",
				parameters: z.object({
					domain: z
						.string()
						.nullable()
						.describe("Company website domain, if known."),
				}),
				execute: async ({ domain }) => {
					guard("research_company");
					return { result: await actions.research(domain) };
				},
			}),
			new FunctionTool({
				name: "create_follow_up_task",
				description: "Create one follow-up task for the rep on this deal.",
				parameters: z.object({
					subject: z.string().min(3).max(200),
					dueAt: z.string().nullable().describe("ISO 8601 due date, or null."),
				}),
				execute: async ({ subject, dueAt }) => {
					guard("create_follow_up_task");
					createdTask = true;
					return { result: await actions.createTask(subject, dueAt) };
				},
			}),
			new FunctionTool({
				name: "alert_team",
				description:
					"Notify the team in the app and in Slack that this deal needs attention today.",
				parameters: z.object({
					title: z.string().min(3).max(120),
					body: z.string().max(400),
				}),
				execute: async ({ title, body }) => {
					guard("alert_team");
					return { result: await actions.alert(title, body) };
				},
			}),
		],
	});

	const runner = new InMemoryRunner({ agent });
	let summary = "";

	const run = async () => {
		for await (const event of runner.runEphemeral({
			userId: "threadline-intake",
			newMessage: {
				parts: [
					{
						text: `Imported conversation facts:\n${JSON.stringify(context, null, 2)}`,
					},
				],
			},
		})) {
			for (const part of event.content?.parts ?? []) {
				if ("text" in part && part.text) summary = part.text.trim();
			}
		}
	};

	try {
		await Promise.race([
			run(),
			new Promise<never>((_, reject) =>
				setTimeout(
					() => reject(new Error("Follow-up agent timed out.")),
					FOLLOW_UP.timeoutMs,
				),
			),
		]);
		return { ok: true, tools: called, createdTask, summary };
	} catch (error) {
		return {
			ok: false,
			reason: error instanceof Error ? error.message : String(error),
		};
	}
}

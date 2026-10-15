import { FunctionTool, Gemini, InMemoryRunner, LlmAgent } from "@google/adk";
import { z } from "zod";
import { searchCrm } from "../agent/lib/lookup";

const searchTool = new FunctionTool({
	name: "search_crm",
	description:
		"Search contacts, companies, and deals in the CRM database by query term.",
	parameters: z.object({
		query: z
			.string()
			.describe("A name, email address, domain, or search term."),
	}),
	execute: async ({ query }) => {
		console.log(`[Tool Executing] search_crm called with query="${query}"`);
		const result = await searchCrm(query);
		console.log(
			`[Tool Result] Found ${result.total} records (${result.contacts.length} contacts, ${result.companies.length} companies, ${result.deals.length} deals)`,
		);
		return result;
	},
});

const gemini = new Gemini({
	model: process.env.GEMINI_FAST_MODEL || "gemini-2.5-flash",
	vertexai: true,
	project: process.env.GOOGLE_CLOUD_PROJECT,
	location: process.env.GOOGLE_CLOUD_LOCATION || "us-central1",
});

const agent = new LlmAgent({
	name: "crm_search_agent",
	model: gemini,
	instruction:
		"You are a helpful CRM assistant. When the user asks to find or search for records such as contacts, companies, or deals, always use the search_crm tool to query the CRM database. Present the findings clearly to the user.",
	tools: [searchTool],
});

const runner = new InMemoryRunner({ agent });

const prompt = process.argv[2] ?? "find contacts named Lena";
console.log(`[Spike] Prompt: "${prompt}"`);

for await (const event of runner.runEphemeral({
	userId: "spike-user",
	newMessage: {
		parts: [{ text: prompt }],
	},
})) {
	if (!event.content?.parts) continue;
	for (const part of event.content.parts) {
		if ("functionCall" in part && part.functionCall) {
			console.log(
				`[Event Function Call]:`,
				JSON.stringify(part.functionCall, null, 2),
			);
		}
		if ("functionResponse" in part && part.functionResponse) {
			console.log(
				`[Event Function Response]:`,
				JSON.stringify(part.functionResponse, null, 2),
			);
		}
		if ("text" in part && part.text) {
			console.log(`\n[Agent Response]\n${part.text}`);
		}
	}
}

process.exit(0);

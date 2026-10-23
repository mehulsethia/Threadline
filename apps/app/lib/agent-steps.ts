import { fieldLabel } from "./fact-label";

export type AgentStep = {
	id: string;
	title: string;
	detail: string | null;
	at: string;
};

type RawStep = { id: string; tool: string; message: string; at: string };

const RECORD_ID = /\s*\((c[a-z0-9]{20,})\)/g;

function clean(message: string): string {
	return message.replace(RECORD_ID, "").trim();
}

function describe(
	tool: string,
	message: string,
): {
	title: string;
	detail: string | null;
} {
	const text = clean(message);
	const fact = text.match(
		/^Recorded fact "([^=]+?) = ([\s\S]+)" as (APPLIED|PROPOSED)/,
	);
	if (fact) {
		const [, field = "", value = "", status] = fact;
		return {
			title: `Found ${fieldLabel(field.trim())}: ${value.trim()}`,
			detail:
				status === "APPLIED"
					? "Written to the record, linked to the quote"
					: "Suggested for you to confirm",
		};
	}
	const parsed = text.match(/^Parsed (\d+) messages with participants: (.+)$/);
	if (parsed) {
		return {
			title: `Read ${parsed[1]} messages`,
			detail: `Between ${parsed[2]}`,
		};
	}
	const validated = text.match(/Validated (\d+) facts/);
	if (tool === "extract_lead_facts" && validated) {
		return {
			title: `Pulled out ${validated[1]} facts`,
			detail: "Each one keeps the quote it came from",
		};
	}
	const created = text.match(
		/^(Created|Updated|Matched) (company|contact|deal): "?([^"]+?)"?(?: for (.+?))?(?: \(stage.*)?$/,
	);
	if (created) {
		const [, verb = "", kind = "", name = "", amount] = created;
		return {
			title: `${verb} ${kind} ${name}`,
			detail: amount ? `Value ${amount}` : null,
		};
	}
	const promises = text.match(/^Tracked promises: (\d+) new/);
	if (promises) {
		return { title: `Tracked ${promises[1]} promises`, detail: null };
	}
	const titles: Record<string, string> = {
		intake_agent: "Agent picked up the conversation",
		load_intake_job: "Opened the file",
		transcribe_audio: "Transcribed the recording",
		read_transcript: "Read the transcript",
		find_matching_contact: "Checked for an existing contact",
		store_messages: "Saved the conversation",
		log_activity: "Logged it on the deal timeline",
		follow_up_agent: "Planning the next step",
		create_task: "Set a follow-up task",
		score_lead: "Scored the deal",
		research_company: "Researched the company",
		finish_job: "Done",
		start: "Started",
		list: "Listed recent email",
		dedupe: "Skipped what is already filed",
		filed: "Filed a conversation",
		read: "Reading",
		done: "Finished",
	};
	const title = titles[tool];
	if (!title) return { title: text, detail: null };
	return { title, detail: text === title ? null : text };
}

export function agentSteps(raw: readonly RawStep[]): AgentStep[] {
	return raw.map((step) => ({
		id: step.id,
		at: step.at,
		...describe(step.tool, step.message),
	}));
}

import { cn } from "@crm/ui/lib/utils";
import type { ReactNode } from "react";
import { LedgerMock } from "./mocks/ledger-mock";
import { RevivalMock } from "./mocks/revival-mock";
import { VoiceMock } from "./mocks/voice-mock";
import { Section, SectionHeading } from "./section-heading";

type Flow = {
	title: string;
	lede: string;
	points: string[];
	poweredBy: string;
};

const SELF_FILLING: Flow = {
	title: "Records that fill themselves, with receipts",
	lede: "Import a conversation in any language. Threadline creates or updates the contact and the deal, and every value keeps the quote, speaker and timestamp it came from.",
	points: [
		"Reads chats, email threads, PDFs, call recordings and voice notes.",
		"Detects the deal currency from the conversation and converts it for reporting.",
		"Importing the same export twice creates no duplicates.",
	],
	poweredBy: "Gemini on Vertex AI and a Google ADK intake agent",
};

const REVIVAL: Flow = {
	title: "Follow-ups before a deal goes cold",
	lede: "Every hour the revival agent looks for deals that missed their stage deadline, left a question unanswered or have an overdue task. It ranks them by value and drafts one message in the lead's language.",
	points: [
		"Chooses a strategy: a nudge, an answer to an objection, new value, or a polite close.",
		"Removes any claim the conversation does not support before you see the draft.",
		"Sends on WhatsApp or email only after you approve, in the app or in Slack. Opt-outs are permanent.",
	],
	poweredBy: "a Google ADK agent on Gemini",
};

const VOICE: Flow = {
	title: "Qualifying calls that write their own notes",
	lede: "Start a call from any deal. A voice agent asks what is still unknown about budget, authority, need and timeline, in the lead's language, and records each answer as a cited fact.",
	points: [
		"Talks and listens in real time, with short turns, in under three minutes.",
		"Proposes a stage and a qualification score. It never moves the deal on its own.",
		"When the call ends, it writes the summary, the stage proposal and the follow-up for one-tap approval.",
		"No live call possible? Record a voice note and get the same result.",
	],
	poweredBy: "Gemini Live API with native audio",
};

function FlowCopy({ flow, tone }: { flow: Flow; tone: "canvas" | "band" }) {
	return (
		<div className="flex flex-col gap-6">
			<SectionHeading title={flow.title} lede={flow.lede} tone={tone} />
			<ul className="flex flex-col gap-3">
				{flow.points.map((point) => (
					<li key={point} className="flex gap-3 text-base/7">
						<span
							aria-hidden="true"
							className="mt-3 h-px w-4 shrink-0 bg-thread"
						/>
						<span>{point}</span>
					</li>
				))}
			</ul>
			<p
				className={cn(
					"text-sm",
					tone === "band" ? "text-band-foreground/70" : "text-muted-foreground",
				)}
			>
				Runs on {flow.poweredBy}.
			</p>
		</div>
	);
}

function FlowRow({
	copy,
	visual,
	visualFirst,
}: {
	copy: ReactNode;
	visual: ReactNode;
	visualFirst?: boolean;
}) {
	return (
		<div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
			<div className={cn(visualFirst && "lg:order-2")}>{copy}</div>
			<div className={cn(visualFirst && "lg:order-1")}>{visual}</div>
		</div>
	);
}

export function AgentFlows() {
	return (
		<>
			<Section id="agents">
				<FlowRow
					copy={<FlowCopy flow={SELF_FILLING} tone="canvas" />}
					visual={<LedgerMock />}
				/>
			</Section>
			<Section tone="band">
				<FlowRow
					visualFirst
					copy={<FlowCopy flow={REVIVAL} tone="band" />}
					visual={<RevivalMock />}
				/>
			</Section>
			<Section>
				<FlowRow
					copy={<FlowCopy flow={VOICE} tone="canvas" />}
					visual={<VoiceMock />}
				/>
			</Section>
		</>
	);
}

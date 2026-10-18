import { Section, SectionHeading } from "./section-heading";

const STACK = [
	{
		name: "Gemini on Vertex AI",
		role: "Reads chats, PDFs and audio in any language, extracts facts and drafts messages.",
	},
	{
		name: "Google Agent Development Kit",
		role: "Runs the intake, revival, scoring and Ask your CRM agents as tool-using agents.",
	},
	{
		name: "Gemini Live API",
		role: "Holds real-time qualifying calls with native audio, in the lead's language.",
	},
	{
		name: "Google Search grounding",
		role: "Researches the company behind a lead and cites its sources. Below 0.70 match confidence it stores nothing.",
	},
	{
		name: "Cloud Run and Cloud Scheduler",
		role: "Web app, API and agent worker as three services. The agent accepts only service identity tokens.",
	},
	{
		name: "Cloud SQL and Cloud Storage",
		role: "One Postgres schema per workspace, so one team can never read another team's rows.",
	},
] as const;

export function GoogleCloud() {
	return (
		<Section id="google-cloud">
			<SectionHeading
				title="Built on Google Cloud"
				lede="Every agent, model call and record runs on Google Cloud. Models are set per task: a fast model for extraction, a reasoning model for drafts, and a live model for voice."
			/>
			<ul className="grid gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-3">
				{STACK.map((item) => (
					<li key={item.name} className="flex flex-col gap-2 bg-card p-6">
						<p className="font-medium">{item.name}</p>
						<p className="text-muted-foreground text-[15px]/7">{item.role}</p>
					</li>
				))}
			</ul>
		</Section>
	);
}

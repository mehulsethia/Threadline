import { Section, SectionHeading } from "./section-heading";

const ROADMAP = [
	{
		theme: "More channels in, more systems out",
		items: [
			"WhatsApp Business API: two-way capture and sending, with no exports",
			"Outlook and Teams capture for Microsoft 365 sales teams",
			"Approved write-back to Salesforce, HubSpot and other CRMs",
			"More third-party data inputs and enrichment sources",
		],
	},
	{
		theme: "Agents that reach further",
		items: [
			"Outbound qualifying calls over phone lines with Gemini Live",
			"Meetings booked straight from a qualifying call",
			"MCP connections to all major LLMs and AI agents",
			"An autonomy setting for each agent: suggest only, ask before sending, or act with a 24-hour undo",
			"Approve drafts and stage moves from your phone",
		],
	},
	{
		theme: "Built for bigger teams",
		items: [
			"Roles and a workspace switcher for larger teams",
			"A log of every data fetch, enrichment and scheduled job",
			"BigQuery export for revenue analytics",
			"A benchmark of 100+ labelled conversations in 10+ languages",
		],
	},
] as const;

export function Roadmap() {
	return (
		<Section id="roadmap">
			<SectionHeading
				title="Future roadmap"
				lede="What we are building next, so the CRM keeps filling itself as your team and your channels grow."
			/>
			<div className="grid gap-x-12 gap-y-10 border-border border-t pt-10 md:grid-cols-3">
				{ROADMAP.map((group) => (
					<div key={group.theme} className="flex flex-col gap-4">
						<h3 className="font-medium text-lg">{group.theme}</h3>
						<ul className="flex flex-col gap-3">
							{group.items.map((item) => (
								<li
									key={item}
									className="flex gap-3 text-[15px]/7 text-muted-foreground"
								>
									<span
										aria-hidden="true"
										className="mt-3 h-px w-4 shrink-0 bg-thread"
									/>
									{item}
								</li>
							))}
						</ul>
					</div>
				))}
			</div>
		</Section>
	);
}

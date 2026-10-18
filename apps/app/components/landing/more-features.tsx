import { Section, SectionHeading } from "./section-heading";

const FEATURES = [
	{
		title: "Ask your CRM",
		body: "Ask which deals are at risk this month, or what Weber asked last week. Answers link straight to the records.",
	},
	{
		title: "Lead scores with reasons",
		body: "A 0 to 100 score from fit, intent, engagement and risk, with the reasons written out, refreshed after every conversation.",
	},
	{
		title: "Forecast in one currency",
		body: "Pipeline and weighted forecast by stage and month, converted to your reporting currency with daily exchange rates.",
	},
	{
		title: "Promise tracker",
		body: "When someone promises to send a quote by Friday, it becomes a task. Later conversations mark it kept, or you get an alert.",
	},
	{
		title: "Drafts and meeting briefs",
		body: "Email, WhatsApp and LinkedIn drafts and a one-page prep brief for any deal, written only from what the evidence supports.",
	},
	{
		title: "Enquiry forms",
		body: "Put a form on your site. Each submission creates the contact and deal, scores it, and alerts the owner. Form details stay as suggestions.",
	},
] as const;

export function MoreFeatures() {
	return (
		<Section tone="sand">
			<SectionHeading
				title="And the rest of the busywork"
				lede="The same evidence ledger powers everything else a sales team needs each day."
			/>
			<dl className="grid gap-x-12 border-foreground/15 border-t md:grid-cols-2">
				{FEATURES.map((feature) => (
					<div
						key={feature.title}
						className="flex flex-col gap-2 border-foreground/15 border-b py-6"
					>
						<dt className="font-medium text-lg">{feature.title}</dt>
						<dd className="text-muted-foreground text-[15px]/7">
							{feature.body}
						</dd>
					</div>
				))}
			</dl>
		</Section>
	);
}

import { Section } from "./section-heading";

const POINTS = [
	{
		title: "The deal lives in a chat",
		body: "Budgets, deadlines and objections arrive on WhatsApp, in an email thread or on a call. Almost none of it reaches the CRM.",
	},
	{
		title: "Quiet deals die quietly",
		body: "A lead asks about volume pricing and nobody answers for a week. No dashboard tells you, because the question was never logged.",
	},
	{
		title: "AI that guesses is worse than a blank",
		body: "Auto-fill tools write plausible values with no source. A wrong budget looks exactly like a right one, so nobody trusts any of them.",
	},
] as const;

export function ProblemSection() {
	return (
		<Section>
			<div className="grid gap-12 lg:grid-cols-[1fr_1.1fr] lg:gap-20">
				<h2 className="max-w-[16ch] text-4xl/[1.08] tracking-[-0.03em] md:text-[52px]/[1.06]">
					Your CRM is empty because selling happens somewhere else.
				</h2>
				<dl className="flex flex-col divide-y divide-border border-border border-y">
					{POINTS.map((point) => (
						<div key={point.title} className="flex flex-col gap-2 py-6">
							<dt className="font-medium text-lg">{point.title}</dt>
							<dd className="text-muted-foreground text-base/7">
								{point.body}
							</dd>
						</div>
					))}
				</dl>
			</div>
		</Section>
	);
}

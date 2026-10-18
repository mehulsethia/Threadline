import { Section, SectionHeading } from "./section-heading";

const STEPS = [
	{
		title: "Bring in a conversation",
		body: "Upload a WhatsApp export, a call recording or a transcript, or connect Gmail, Slack, Google Meet, Fireflies or Fathom. New conversations arrive on their own.",
	},
	{
		title: "Every fact gets a source",
		body: "Gemini reads the conversation in its own language and pulls out the contact, need, budget, currency, timeline and next step. Each field keeps the exact quote it came from.",
	},
	{
		title: "Strong evidence writes, weak evidence asks",
		body: "A fact the lead stated is written to the record. A guess becomes a suggestion that a rep accepts or dismisses with one click.",
	},
	{
		title: "Agents work the pipeline",
		body: "Threadline finds deals that went quiet, drafts the follow-up, runs qualifying calls and tracks every promise. You approve anything that leaves the building.",
	},
] as const;

export function HowItWorks() {
	return (
		<Section id="how-it-works" tone="sand">
			<SectionHeading
				title="From a raw chat to an approved follow-up"
				lede="Four steps, no data entry. You stay in control of everything a customer sees."
			/>
			<ol className="relative grid gap-10 md:grid-cols-4 md:gap-8">
				<span
					aria-hidden="true"
					className="absolute top-[11px] right-0 left-3 hidden h-px bg-thread md:block"
				/>
				{STEPS.map((step, index) => (
					<li key={step.title} className="relative flex flex-col gap-3">
						<span className="flex size-6 items-center justify-center rounded-full bg-primary font-medium text-primary-foreground text-xs">
							{index + 1}
						</span>
						<h3 className="font-medium text-lg/7">{step.title}</h3>
						<p className="text-muted-foreground text-[15px]/7">{step.body}</p>
					</li>
				))}
			</ol>
		</Section>
	);
}

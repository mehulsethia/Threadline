import { Section, SectionHeading } from "./section-heading";

const QUESTIONS = [
	{
		q: "Does Threadline send messages on its own?",
		a: "No. Every outbound message waits for a person to approve it, in the app or in Slack. Leads who opt out are never contacted again.",
	},
	{
		q: "What happens when the AI is not sure?",
		a: "It does not write to the record. The value becomes a suggestion with its source, and a rep accepts or dismisses it. A dismissed value is never offered again.",
	},
	{
		q: "Which languages does it understand?",
		a: "Any language Gemini reads. We have tested English, German and Hindi conversations end to end, and drafts go out in the lead's own language.",
	},
	{
		q: "Can I try it without connecting my data?",
		a: "Yes. The live demo opens a sample workspace with 12 deals in several currencies. You can import your own export there too.",
	},
	{
		q: "Where is my data kept?",
		a: "In your workspace's own Postgres schema on Google Cloud SQL. Uploads stay in Cloud Storage. Integration keys are encrypted at rest.",
	},
	{
		q: "Is it open source?",
		a: "Yes. Threadline is MIT licensed and builds on Comp AI's open-source CRM. The code is on GitHub.",
	},
] as const;

export function Faq() {
	return (
		<Section id="faq">
			<div className="grid gap-12 lg:grid-cols-[1fr_1.6fr] lg:gap-20">
				<SectionHeading title="Questions sales leaders ask" />
				<div className="flex flex-col border-border border-t">
					{QUESTIONS.map((item) => (
						<details
							key={item.q}
							className="group border-border border-b [&_summary::-webkit-details-marker]:hidden"
						>
							<summary className="flex cursor-pointer list-none items-center justify-between gap-6 rounded-sm py-5 font-medium text-lg focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2">
								{item.q}
								<span
									aria-hidden="true"
									className="relative size-4 shrink-0 before:absolute before:top-1/2 before:left-0 before:h-px before:w-4 before:bg-foreground after:absolute after:top-0 after:left-1/2 after:h-4 after:w-px after:bg-foreground after:transition-transform group-open:after:scale-y-0 motion-reduce:after:transition-none"
								/>
							</summary>
							<p className="max-w-[62ch] pb-6 text-muted-foreground text-base/7">
								{item.a}
							</p>
						</details>
					))}
				</div>
			</div>
		</Section>
	);
}

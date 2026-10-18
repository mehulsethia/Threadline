import { Section, SectionHeading } from "./section-heading";

const ROWS = [
	{
		topic: "Where data comes from",
		crm: "Reps type it in, when they remember",
		addon: "A model summarises some emails",
		threadline: "Every chat, email, call and voice note",
	},
	{
		topic: "Proof behind a field",
		crm: "None",
		addon: "None",
		threadline: "The exact quote, speaker and time",
	},
	{
		topic: "When the AI is unsure",
		crm: "Not applicable",
		addon: "Writes its best guess",
		threadline: "Asks you with a suggestion",
	},
	{
		topic: "Stalled deals",
		crm: "Found in the quarterly review",
		addon: "A reminder, sometimes",
		threadline: "Found every hour, with a draft ready",
	},
	{
		topic: "Languages and currencies",
		crm: "One of each, set up by hand",
		addon: "Mostly English",
		threadline: "Detected per conversation and per deal",
	},
] as const;

export function Comparison() {
	return (
		<Section>
			<SectionHeading
				title="Evidence, not guesses"
				lede="A confidently wrong fact about a customer is worse than a blank field, because nobody can tell it is wrong. So Threadline never writes a fact it cannot point to."
			/>
			<div className="overflow-x-auto rounded-xl border border-border bg-card">
				<table className="w-full min-w-[640px] text-left text-[15px]">
					<caption className="sr-only">
						How Threadline compares with a typical CRM and a CRM with an AI
						add-on
					</caption>
					<thead>
						<tr className="border-border border-b">
							<th scope="col" className="w-1/4 px-5 py-4 font-normal">
								<span className="sr-only">Topic</span>
							</th>
							<th
								scope="col"
								className="px-5 py-4 font-normal text-muted-foreground"
							>
								Typical CRM
							</th>
							<th
								scope="col"
								className="px-5 py-4 font-normal text-muted-foreground"
							>
								CRM with an AI add-on
							</th>
							<th scope="col" className="bg-accent px-5 py-4 font-medium">
								Threadline
							</th>
						</tr>
					</thead>
					<tbody className="divide-y divide-border">
						{ROWS.map((row) => (
							<tr key={row.topic}>
								<th scope="row" className="px-5 py-4 font-medium">
									{row.topic}
								</th>
								<td className="px-5 py-4 text-muted-foreground">{row.crm}</td>
								<td className="px-5 py-4 text-muted-foreground">{row.addon}</td>
								<td className="bg-accent/60 px-5 py-4">{row.threadline}</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>
		</Section>
	);
}

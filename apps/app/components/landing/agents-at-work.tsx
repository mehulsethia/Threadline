import { Section, SectionHeading } from "./section-heading";

const ON_THEIR_OWN = [
	{
		cadence: "Every 15 minutes",
		work: "Read new email, file inbound leads and mark the strangers for your review.",
	},
	{
		cadence: "Every hour",
		work: "Find deals that went quiet, rank them by value and draft a follow-up in the lead's language.",
	},
	{
		cadence: "After every conversation",
		work: "Fill each field with its source, score the deal with written reasons and track every promise.",
	},
	{
		cadence: "After every call",
		work: "Write the call summary, propose the next stage and draft the follow-up.",
	},
] as const;

const WAITS_FOR_YOU = [
	"Any message that reaches a customer",
	"Any move to a new deal stage",
	"Any fact the evidence does not prove",
	"Keeping or removing a lead nobody has replied to",
] as const;

export function AgentsAtWork() {
	return (
		<Section id="autopilot">
			<SectionHeading
				title="What the agents do on their own"
				lede="Threadline is a CRM run by agents. They do the reading, the data entry and the chasing. You make the calls that matter, and every step they took is in the activity feed on your home screen."
			/>

			<div className="grid gap-12 lg:grid-cols-[1.6fr_1fr] lg:gap-16">
				<ol className="flex flex-col border-border border-t">
					{ON_THEIR_OWN.map((item) => (
						<li
							key={item.cadence}
							className="grid gap-1 border-border border-b py-5 sm:grid-cols-[13rem_1fr] sm:gap-6"
						>
							<span className="font-medium">{item.cadence}</span>
							<span className="text-[15px]/7 text-muted-foreground">
								{item.work}
							</span>
						</li>
					))}
				</ol>

				<div className="flex flex-col gap-4 self-start rounded-xl bg-accent p-6">
					<h3 className="font-medium text-lg">What waits for you</h3>
					<ul className="flex flex-col gap-3">
						{WAITS_FOR_YOU.map((item) => (
							<li key={item} className="flex gap-3 text-[15px]/7">
								<span
									aria-hidden="true"
									className="mt-3 h-px w-4 shrink-0 bg-thread"
								/>
								{item}
							</li>
						))}
					</ul>
					<p className="text-muted-foreground text-sm">
						One click approves the whole step: the message, the stage and the
						follow-up task.
					</p>
				</div>
			</div>

			<div className="grid gap-6 rounded-xl border border-border bg-card p-6 md:grid-cols-[1fr_1.4fr] md:gap-12 md:p-8">
				<h3 className="text-2xl/[1.15] tracking-[-0.02em] font-heading">
					A CRM built for your agents too
				</h3>
				<p className="text-[15px]/7 text-muted-foreground">
					Every record is open to your own agents through a typed REST API with
					an OpenAPI description. Create an API key in Settings and an agent can
					search deals, update contacts and accept or dismiss facts, with the
					same evidence rules a person works under.
				</p>
			</div>
		</Section>
	);
}

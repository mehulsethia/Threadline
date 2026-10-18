const FACTS = [
	{
		field: "Budget",
		value: "$48,000 per year",
		quote: "We have $48k approved for this fiscal year.",
		source: "Email from Sarah Jenkins, 8 Oct",
		verified: true,
	},
	{
		field: "Decision maker",
		value: "Compliance committee",
		quote: "Our compliance committee is reviewing the SOC2 details.",
		source: "Email from Sarah Jenkins, 8 Oct",
		verified: true,
	},
	{
		field: "Company size",
		value: "200 to 500 employees",
		quote: "Grounded web search, 3 cited sources",
		source: "Match confidence 0.82",
		verified: false,
	},
] as const;

export function LedgerMock() {
	return (
		<div className="flex flex-col overflow-hidden rounded-xl border border-border bg-card shadow-md">
			<div className="flex items-center justify-between gap-4 border-border border-b px-5 py-4">
				<div className="flex flex-col">
					<p className="font-medium">Datacore Cloud</p>
					<p className="text-muted-foreground text-sm">
						Enterprise security monitoring, $48,000
					</p>
				</div>
				<span className="rounded-full bg-accent px-3 py-1 text-sm">
					Negotiation
				</span>
			</div>
			<ul className="divide-y divide-border">
				{FACTS.map((fact) => (
					<li key={fact.field} className="flex flex-col gap-2 px-5 py-4">
						<div className="flex flex-wrap items-center justify-between gap-2">
							<p className="text-sm">
								<span className="text-muted-foreground">{fact.field}</span>
								<span className="ml-2 font-medium">{fact.value}</span>
							</p>
							{fact.verified ? (
								<span className="rounded-full bg-primary px-2.5 py-0.5 text-primary-foreground text-xs">
									Written to record
								</span>
							) : (
								<span className="rounded-full border border-foreground/30 border-dashed px-2.5 py-0.5 text-xs">
									Waiting for you
								</span>
							)}
						</div>
						<blockquote className="border-thread border-l-2 pl-3 text-[15px]/6">
							{fact.quote}
						</blockquote>
						<div className="flex flex-wrap items-center justify-between gap-2">
							<p className="text-muted-foreground text-xs">{fact.source}</p>
							{fact.verified ? null : (
								<div className="flex gap-2" aria-hidden="true">
									<span className="rounded-full bg-primary px-3 py-1 text-primary-foreground text-xs">
										Accept
									</span>
									<span className="rounded-full border border-border px-3 py-1 text-xs">
										Dismiss
									</span>
								</div>
							)}
						</div>
					</li>
				))}
			</ul>
		</div>
	);
}

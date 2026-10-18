export function RevivalMock() {
	return (
		<div className="flex flex-col overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-xl">
			<div className="flex flex-col gap-1 border-border border-b px-5 py-4">
				<div className="flex flex-wrap items-center justify-between gap-2">
					<p className="font-medium">Weber Precision Valves</p>
					<span className="rounded-full bg-accent px-3 py-1 text-sm">
						Proposal, quiet for 8 days
					</span>
				</div>
				<p className="text-muted-foreground text-sm">
					Why it stalled: Klaus asked about volume pricing for 500 valves and
					got no reply.
				</p>
			</div>
			<div className="flex flex-col gap-3 px-5 py-4">
				<div className="flex flex-wrap items-center gap-2 text-sm">
					<span className="text-muted-foreground">Strategy</span>
					<span className="font-medium">Answer the open question</span>
					<span className="text-muted-foreground">on WhatsApp, in German</span>
				</div>
				<div className="rounded-lg bg-muted px-4 py-3 text-[15px]/7">
					<p>
						Guten Tag Herr Weber, vielen Dank für Ihre Frage zu den
						Staffelpreisen für 500 Hochdruckventile. Gerne gehe ich die
						Konditionen mit Ihnen in einem kurzen Gespräch durch.{" "}
						<del className="text-muted-foreground decoration-destructive">
							Wir garantieren Lieferung in zwei Wochen.
						</del>
					</p>
					<p className="pt-3">
						Viele Grüße
						<br />
						Anna Schmidt, Northwind Systems
					</p>
				</div>
				<p className="flex items-start gap-2 text-sm">
					<span
						aria-hidden="true"
						className="mt-1.5 size-2 shrink-0 rounded-full bg-destructive"
					/>
					<span>
						Removed one claim. Nothing in the conversation supports a two-week
						delivery.
					</span>
				</p>
			</div>
			<div
				className="flex flex-wrap gap-2 border-border border-t px-5 py-4"
				aria-hidden="true"
			>
				<span className="rounded-full bg-primary px-4 py-2 text-primary-foreground text-sm">
					Approve and send on WhatsApp
				</span>
				<span className="rounded-full border border-border px-4 py-2 text-sm">
					Edit
				</span>
				<span className="rounded-full border border-border px-4 py-2 text-sm">
					Skip
				</span>
			</div>
		</div>
	);
}

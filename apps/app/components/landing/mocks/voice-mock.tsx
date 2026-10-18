const TURNS = [
	{ agent: true, text: "Who else signs off on a purchase like this?" },
	{
		agent: false,
		text: "Our CFO. She already approved $120,000 for the sales workflow upgrade.",
	},
	{ agent: true, text: "Thank you. When do you need it running?" },
] as const;

const CHECKLIST = [
	{ label: "Budget", value: "$120,000, approved by CFO", done: true },
	{ label: "Authority", value: "CFO signs off", done: true },
	{ label: "Need", value: "Sales workflow upgrade", done: true },
	{ label: "Timeline", value: "Asking now", done: false },
] as const;

export function VoiceMock() {
	return (
		<div className="grid overflow-hidden rounded-xl border border-border bg-card shadow-md sm:grid-cols-[1.25fr_1fr]">
			<div className="flex flex-col gap-3 border-border p-5 max-sm:border-b sm:border-r">
				<div className="flex items-center justify-between gap-2">
					<p className="font-medium">Live call with Lena Bergström</p>
					<span className="flex items-center gap-1.5 text-sm">
						<span
							aria-hidden="true"
							className="size-2 rounded-full bg-destructive"
						/>
						01:42
					</span>
				</div>
				<ul className="flex flex-col gap-2.5">
					{TURNS.map((turn) => (
						<li
							key={turn.text}
							className={
								turn.agent
									? "max-w-[90%] rounded-lg bg-muted px-3 py-2 text-[15px]/6"
									: "ml-auto max-w-[90%] rounded-lg bg-primary px-3 py-2 text-[15px]/6 text-primary-foreground"
							}
						>
							<span className="sr-only">
								{turn.agent ? "Threadline: " : "Lena: "}
							</span>
							{turn.text}
						</li>
					))}
				</ul>
			</div>
			<div className="flex flex-col gap-4 p-5">
				<p className="font-medium">Qualification</p>
				<ul className="flex flex-col gap-3">
					{CHECKLIST.map((item) => (
						<li key={item.label} className="flex gap-3 text-sm">
							<span
								aria-hidden="true"
								className={
									item.done
										? "mt-0.5 size-4 shrink-0 rounded-full bg-thread"
										: "mt-0.5 size-4 shrink-0 rounded-full border border-foreground/40 border-dashed"
								}
							/>
							<span className="flex flex-col">
								<span className="text-muted-foreground">{item.label}</span>
								<span>{item.value}</span>
							</span>
						</li>
					))}
				</ul>
				<p className="rounded-lg bg-accent px-3 py-2 text-sm">
					Proposed stage: Qualified, score 74. Waiting for your approval.
				</p>
			</div>
		</div>
	);
}

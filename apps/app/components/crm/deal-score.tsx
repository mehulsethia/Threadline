const HEALTH_LABEL = new Map<string, string>(
	Object.entries({
		on_track: "On track",
		at_risk: "At risk",
		stalled: "Stalled",
		won: "Won",
		lost: "Lost",
	}),
);

export function DealScore({
	score,
	health,
	reason,
}: {
	score: number | null;
	health: string | null;
	reason: string | null;
}) {
	if (score === null) {
		return (
			<span
				className="text-muted-foreground text-xs"
				title="Scored after the next conversation, or use Rescore all deals on the Forecast page."
			>
				Not scored
			</span>
		);
	}

	const label = health ? (HEALTH_LABEL.get(health) ?? health) : null;

	return (
		<span
			className="inline-flex items-baseline gap-2"
			title={reason ?? "Lead score from fit, intent, engagement and risk."}
		>
			<span className="font-medium tabular-nums">{score}</span>
			{label ? (
				<span
					className={
						health === "at_risk" || health === "stalled"
							? "text-destructive text-xs"
							: "text-muted-foreground text-xs"
					}
				>
					{label}
				</span>
			) : null}
		</span>
	);
}

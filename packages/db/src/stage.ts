export const DEAL_STAGE_LABELS = new Map<string, string>(
	Object.entries({
		UNQUALIFIED_TO_BUY: "Lead",
		QUALIFIED_TO_BUY: "Qualified",
		DEMO_BOOKED: "Meeting/Demo",
		CONTRACT_SENT: "Proposal",
		DECISION_MAKER_BOUGHT_IN: "Negotiation",
		CLOSED_WON: "Won",
		CLOSED_LOST: "Lost",
	}),
);

export function formatDealStage(stage?: string | null): string {
	if (!stage) return "Unknown";
	return DEAL_STAGE_LABELS.get(stage) ?? stage;
}

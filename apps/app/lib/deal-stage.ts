import { DealStage } from "@crm/db/enums";
import type { StatusTone } from "@crm/ui/components/status-indicator";

const ORDER = [
	DealStage.UNQUALIFIED_TO_BUY,
	DealStage.QUALIFIED_TO_BUY,
	DealStage.DEMO_BOOKED,
	DealStage.CONTRACT_SENT,
	DealStage.DECISION_MAKER_BOUGHT_IN,
	DealStage.CLOSED_WON,
	DealStage.CLOSED_LOST,
] as const;

type DealStagePresentation = Record<
	DealStage,
	{ label: string; tone: StatusTone }
>;

const PRESENTATION: DealStagePresentation = {
	UNQUALIFIED_TO_BUY: { label: "Lead", tone: "neutral" },
	QUALIFIED_TO_BUY: { label: "Qualified", tone: "info" },
	DEMO_BOOKED: { label: "Meeting/Demo", tone: "info" },
	CONTRACT_SENT: { label: "Proposal", tone: "warning" },
	DECISION_MAKER_BOUGHT_IN: { label: "Negotiation", tone: "warning" },
	CLOSED_WON: { label: "Won", tone: "success" },
	CLOSED_LOST: { label: "Lost", tone: "error" },
};

export const OPEN_STAGES = ORDER.slice(0, 5) as readonly DealStage[];

export const LOSING_STAGES: readonly DealStage[] = [DealStage.CLOSED_LOST];

export const DEAL_STAGE_OPTIONS = ORDER.map((value) => ({
	value,
	label: PRESENTATION[value].label,
}));

const OPEN_STAGE_COLORS = [
	"var(--chart-1)",
	"var(--chart-2)",
	"var(--chart-3)",
	"var(--chart-4)",
	"var(--chart-5)",
] as const;

export function isClosedStage(stage: DealStage): boolean {
	return !OPEN_STAGES.includes(stage);
}

export function dealStageColor(stage: DealStage): string {
	return OPEN_STAGE_COLORS[OPEN_STAGES.indexOf(stage)] ?? "var(--chart-5)";
}

export function dealStageLabel(stage: DealStage): string {
	return PRESENTATION[stage].label;
}

export function dealStagePresentation(stage: DealStage) {
	return PRESENTATION[stage];
}

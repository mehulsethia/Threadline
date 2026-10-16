import { DealStage } from "./generated/prisma/enums";

export const OPEN_DEAL_STAGES = [
	DealStage.UNQUALIFIED_TO_BUY,
	DealStage.QUALIFIED_TO_BUY,
	DealStage.DEMO_BOOKED,
	DealStage.CONTRACT_SENT,
	DealStage.DECISION_MAKER_BOUGHT_IN,
] as const;

export const CLOSED_DEAL_STAGES = [
	DealStage.CLOSED_WON,
	DealStage.CLOSED_LOST,
] as const;

export const LOSING_DEAL_STAGES = [DealStage.CLOSED_LOST] as const;

const CLOSED = new Set<DealStage>(CLOSED_DEAL_STAGES);

export function isClosedStage(stage: DealStage): boolean {
	return CLOSED.has(stage);
}

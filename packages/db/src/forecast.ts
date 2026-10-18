import type { Db } from "./client";
import { resolveRate } from "./fx";
import { DealStage } from "./generated/prisma/enums";
import { readReportingCurrency } from "./settings";

export const STAGE_PROBABILITY = {
	DEMO_BOOKED: 0.2,
	QUALIFIED_TO_BUY: 0.3,
	UNQUALIFIED_TO_BUY: 0.05,
	DECISION_MAKER_BOUGHT_IN: 0.6,
	CONTRACT_SENT: 0.8,
	CLOSED_WON: 1,
	CLOSED_LOST: 0,
} as const satisfies Record<DealStage, number>;

export type ForecastStage = {
	stage: DealStage;
	deals: number;
	total: number;
	weighted: number;
};

export type ForecastMonth = { month: string; weighted: number; deals: number };

export type Forecast = {
	currency: string;
	openDeals: number;
	pipeline: number;
	weighted: number;
	wonThisMonth: number;
	stages: ForecastStage[];
	months: ForecastMonth[];
	health: {
		on_track: number;
		at_risk: number;
		stalled: number;
		unscored: number;
	};
	hotLeads: { id: string; name: string; leadScore: number; amount: number }[];
	atRisk: {
		id: string;
		name: string;
		health: string;
		reason: string | null;
		amount: number;
	}[];
	overduePromises: number;
	unconverted: number;
};

const OPEN_MONTHS = 3;

function monthKey(date: Date): string {
	return date.toISOString().slice(0, 7);
}

export async function pipelineForecast(db: Db): Promise<Forecast> {
	const [deals, currency, overduePromises] = await Promise.all([
		db.deal.findMany({
			where: { archivedAt: null },
			select: {
				id: true,
				name: true,
				stage: true,
				amount: true,
				baseAmount: true,
				currency: true,
				winProbability: true,
				leadScore: true,
				health: true,
				healthReason: true,
				expectedCloseDate: true,
				closedAt: true,
			},
		}),
		readReportingCurrency(db),
		db.commitment.count({ where: { status: "overdue" } }),
	]);

	const reporting = currency ?? "USD";
	const rates = new Map<string, number | null>();
	for (const deal of deals) {
		if (deal.baseAmount !== null || rates.has(deal.currency)) continue;
		const rate = await resolveRate(db, reporting, deal.currency);
		rates.set(deal.currency, rate ? Number(rate.rate) : null);
	}
	const amountOf = (deal: (typeof deals)[number]) => {
		if (deal.baseAmount !== null) return Number(deal.baseAmount);
		if (deal.amount === null) return 0;
		if (deal.currency === reporting) return Number(deal.amount);
		const rate = rates.get(deal.currency);
		return rate ? Number(deal.amount) * rate : 0;
	};
	const unconverted = deals.filter(
		(d) =>
			d.baseAmount === null &&
			d.amount !== null &&
			d.currency !== reporting &&
			!rates.get(d.currency),
	).length;
	const open = deals.filter(
		(d) =>
			d.stage !== DealStage.CLOSED_WON && d.stage !== DealStage.CLOSED_LOST,
	);
	const probabilityOf = (deal: (typeof deals)[number]) =>
		deal.winProbability ?? STAGE_PROBABILITY[deal.stage];

	const stages = Object.values(DealStage).map((stage) => {
		const inStage = deals.filter((d) => d.stage === stage);
		return {
			stage,
			deals: inStage.length,
			total: inStage.reduce((sum, d) => sum + amountOf(d), 0),
			weighted: inStage.reduce(
				(sum, d) => sum + amountOf(d) * probabilityOf(d),
				0,
			),
		};
	});

	const now = new Date();
	const months: ForecastMonth[] = [];
	for (let offset = 0; offset < OPEN_MONTHS; offset += 1) {
		const month = monthKey(
			new Date(now.getFullYear(), now.getMonth() + offset, 15),
		);
		const due = open.filter(
			(d) => d.expectedCloseDate && monthKey(d.expectedCloseDate) === month,
		);
		months.push({
			month,
			deals: due.length,
			weighted: due.reduce((sum, d) => sum + amountOf(d) * probabilityOf(d), 0),
		});
	}

	const thisMonth = monthKey(now);
	return {
		currency: reporting,
		unconverted,
		openDeals: open.length,
		pipeline: open.reduce((sum, d) => sum + amountOf(d), 0),
		weighted: open.reduce((sum, d) => sum + amountOf(d) * probabilityOf(d), 0),
		wonThisMonth: deals
			.filter(
				(d) =>
					d.stage === DealStage.CLOSED_WON &&
					d.closedAt &&
					monthKey(d.closedAt) === thisMonth,
			)
			.reduce((sum, d) => sum + amountOf(d), 0),
		stages,
		months,
		health: {
			on_track: open.filter((d) => d.health === "on_track").length,
			at_risk: open.filter((d) => d.health === "at_risk").length,
			stalled: open.filter((d) => d.health === "stalled").length,
			unscored: open.filter((d) => !d.health).length,
		},
		hotLeads: open
			.filter((d) => (d.leadScore ?? 0) >= 75)
			.sort((a, b) => (b.leadScore ?? 0) - (a.leadScore ?? 0))
			.slice(0, 10)
			.map((d) => ({
				id: d.id,
				name: d.name,
				leadScore: d.leadScore ?? 0,
				amount: amountOf(d),
			})),
		atRisk: open
			.filter((d) => d.health === "at_risk" || d.health === "stalled")
			.sort((a, b) => amountOf(b) - amountOf(a))
			.slice(0, 10)
			.map((d) => ({
				id: d.id,
				name: d.name,
				health: d.health ?? "",
				reason: d.healthReason,
				amount: amountOf(d),
			})),
		overduePromises,
	};
}

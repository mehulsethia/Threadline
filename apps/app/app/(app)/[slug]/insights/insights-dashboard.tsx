"use client";

import { Badge } from "@crm/ui/components/badge";
import { Button } from "@crm/ui/components/button";
import { Spinner } from "@crm/ui/components/spinner";
import { formatMoney } from "@crm/ui/lib/format";
import { cn } from "@crm/ui/lib/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useOpenRecord } from "@/components/crm/record-sheet/record-stack";
import {
	PageShellActions,
	PageShellContent,
	PageShellDescription,
	PageShellHeader,
	PageShellHeading,
	PageShellTitle,
} from "@/components/page-shell";
import { useTRPC } from "@/lib/trpc/client";

const STAGE_LABEL = new Map<string, string>(
	Object.entries({
		DEMO_BOOKED: "Demo booked",
		QUALIFIED_TO_BUY: "Qualified",
		UNQUALIFIED_TO_BUY: "Unqualified",
		DECISION_MAKER_BOUGHT_IN: "Decision maker in",
		CONTRACT_SENT: "Contract sent",
		CLOSED_WON: "Won",
		CLOSED_LOST: "Lost",
	}),
);

function Stat({
	label,
	value,
	hint,
}: {
	label: string;
	value: string;
	hint?: string;
}) {
	return (
		<div className="flex flex-col gap-1 rounded-lg border bg-card p-4">
			<span className="text-muted-foreground text-xs">{label}</span>
			<span className="font-medium text-2xl tabular-nums">{value}</span>
			{hint ? (
				<span className="text-muted-foreground text-xs">{hint}</span>
			) : null}
		</div>
	);
}

export function InsightsDashboard() {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const openRecord = useOpenRecord();
	const forecast = useQuery(trpc.assist.forecast.queryOptions());
	const promises = useQuery(trpc.assist.promises.queryOptions({}));
	const rescoreAll = useMutation(
		trpc.assist.rescoreAll.mutationOptions({
			onSuccess: (data) =>
				toast.success(
					data.queued
						? "Rescoring every open deal in the background. You will get a notification when it is done."
						: "A rescore is already running.",
				),
			onError: (error) => toast.error(error.message),
		}),
	);
	const updatePromise = useMutation(
		trpc.assist.updatePromise.mutationOptions({
			onSuccess: () =>
				queryClient.invalidateQueries({
					queryKey: trpc.assist.promises.queryKey(),
				}),
		}),
	);

	const data = forecast.data;
	const money = (value: number) => formatMoney(value, data?.currency ?? "USD");
	const unconvertedNote =
		data && data.unconverted > 0
			? ` ${data.unconverted} deal(s) in other currencies have no exchange rate yet and are left out.`
			: "";
	const maxStage = Math.max(1, ...(data?.stages.map((s) => s.total) ?? [1]));

	return (
		<>
			<PageShellHeader>
				<PageShellHeading>
					<PageShellTitle>Forecast & deal health</PageShellTitle>
					<PageShellDescription>
						Weighted by each deal's AI win probability. Scores refresh after
						every conversation and every hour.
					</PageShellDescription>
				</PageShellHeading>
				<PageShellActions>
					<Button
						size="sm"
						variant="outline"
						disabled={rescoreAll.isPending}
						onClick={() => rescoreAll.mutate()}
					>
						{rescoreAll.isPending ? <Spinner data-icon="inline-start" /> : null}
						Rescore all deals
					</Button>
				</PageShellActions>
			</PageShellHeader>
			<PageShellContent className="flex flex-col gap-8">
				{data ? (
					<>
						<div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
							<Stat
								label="Open pipeline"
								value={money(data.pipeline)}
								hint={`${data.openDeals} open deals.${unconvertedNote}`}
							/>
							<Stat
								label="Weighted forecast"
								value={money(data.weighted)}
								hint="Pipeline × win probability"
							/>
							<Stat label="Won this month" value={money(data.wonThisMonth)} />
							<Stat
								label="Deal health"
								value={`${data.health.on_track} on track`}
								hint={`${data.health.at_risk} at risk · ${data.health.stalled} stalled · ${data.health.unscored} unscored`}
							/>
						</div>

						<section className="flex flex-col gap-3">
							<h2 className="font-medium text-base">By stage</h2>
							<div className="flex flex-col gap-2">
								{data.stages
									.filter((stage) => stage.deals > 0)
									.map((stage) => (
										<div
											key={stage.stage}
											className="grid grid-cols-[10rem_1fr_auto] items-center gap-3 text-sm"
										>
											<span>{STAGE_LABEL.get(stage.stage) ?? stage.stage}</span>
											<div className="h-2 rounded-full bg-muted">
												<div
													className="h-2 rounded-full bg-primary"
													style={{
														width: `${(stage.total / maxStage) * 100}%`,
													}}
												/>
											</div>
											<span className="text-muted-foreground tabular-nums">
												{stage.deals} · {money(stage.total)} · weighted{" "}
												{money(stage.weighted)}
											</span>
										</div>
									))}
							</div>
						</section>

						<section className="flex flex-col gap-3">
							<h2 className="font-medium text-base">
								Next 3 months (by expected close)
							</h2>
							<div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
								{data.months.map((month) => (
									<Stat
										key={month.month}
										label={new Date(`${month.month}-15`).toLocaleDateString(
											undefined,
											{ month: "long", year: "numeric" },
										)}
										value={money(month.weighted)}
										hint={`${month.deals} deals expected to close`}
									/>
								))}
							</div>
						</section>

						<div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
							<section className="flex flex-col gap-3">
								<h2 className="font-medium text-base">Hot leads</h2>
								{data.hotLeads.length === 0 ? (
									<p className="text-muted-foreground text-sm">
										No deals score 75 or above yet.
									</p>
								) : (
									<ul className="flex flex-col divide-y rounded-lg border">
										{data.hotLeads.map((lead) => (
											<li key={lead.id}>
												<button
													type="button"
													onClick={() =>
														openRecord({ kind: "deal", id: lead.id })
													}
													className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm hover:bg-accent"
												>
													<span className="font-medium">{lead.name}</span>
													<span className="flex items-center gap-3">
														<span className="text-muted-foreground tabular-nums">
															{money(lead.amount)}
														</span>
														<Badge variant="success">{lead.leadScore}</Badge>
													</span>
												</button>
											</li>
										))}
									</ul>
								)}
							</section>
							<section className="flex flex-col gap-3">
								<h2 className="font-medium text-base">At risk</h2>
								{data.atRisk.length === 0 ? (
									<p className="text-muted-foreground text-sm">
										No deals are flagged at risk.
									</p>
								) : (
									<ul className="flex flex-col divide-y rounded-lg border">
										{data.atRisk.map((deal) => (
											<li key={deal.id}>
												<button
													type="button"
													onClick={() =>
														openRecord({ kind: "deal", id: deal.id })
													}
													className="flex w-full flex-col gap-1 px-4 py-3 text-left text-sm hover:bg-accent"
												>
													<span className="flex items-center justify-between gap-3">
														<span className="font-medium">{deal.name}</span>
														<span
															className={cn(
																"text-xs font-medium",
																deal.health === "stalled"
																	? "text-destructive"
																	: "text-warning",
															)}
														>
															{deal.health === "stalled"
																? "Stalled"
																: "At risk"}
														</span>
													</span>
													<span className="text-muted-foreground text-xs">
														{money(deal.amount)}
														{deal.reason ? ` · ${deal.reason}` : ""}
													</span>
												</button>
											</li>
										))}
									</ul>
								)}
							</section>
						</div>

						<section className="flex flex-col gap-3">
							<h2 className="font-medium text-base">
								Open promises
								{data.overduePromises > 0
									? ` (${data.overduePromises} overdue)`
									: ""}
							</h2>
							{(promises.data ?? []).length === 0 ? (
								<p className="text-muted-foreground text-sm">
									No open promises. Threadline finds them in every conversation
									it reads.
								</p>
							) : (
								<ul className="flex flex-col divide-y rounded-lg border">
									{(promises.data ?? []).map((item) => (
										<li
											key={item.id}
											className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm"
										>
											<Badge variant="outline">
												{item.owner === "us" ? "We promised" : "They promised"}
											</Badge>
											<span className="min-w-0 flex-1">{item.text}</span>
											{item.dealName && item.dealId ? (
												<button
													type="button"
													className="text-muted-foreground text-xs underline underline-offset-2"
													onClick={() =>
														item.dealId &&
														openRecord({ kind: "deal", id: item.dealId })
													}
												>
													{item.dealName}
												</button>
											) : null}
											<span
												className={cn(
													"text-xs",
													item.status === "overdue"
														? "font-medium text-destructive"
														: "text-muted-foreground",
												)}
											>
												{item.status === "overdue"
													? "Overdue"
													: item.dueAt
														? `Due ${new Date(item.dueAt).toLocaleDateString()}`
														: "No date"}
											</span>
											<Button
												size="xs"
												variant="outline"
												disabled={updatePromise.isPending}
												onClick={() =>
													updatePromise.mutate({ id: item.id, status: "kept" })
												}
											>
												Mark kept
											</Button>
										</li>
									))}
								</ul>
							)}
						</section>
					</>
				) : (
					<Spinner />
				)}
			</PageShellContent>
		</>
	);
}

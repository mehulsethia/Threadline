"use client";

import Analytics from "@carbon/icons-react/es/Analytics";
import Document from "@carbon/icons-react/es/Document";
import Email from "@carbon/icons-react/es/Email";
import PhoneVoice from "@carbon/icons-react/es/PhoneVoice";
import Task from "@carbon/icons-react/es/Task";
import UserFollow from "@carbon/icons-react/es/UserFollow";
import { Badge } from "@crm/ui/components/badge";
import { Button } from "@crm/ui/components/button";
import {
	Card,
	CardAction,
	CardDescription,
	CardHeader,
	CardPanel,
	CardPanelEmpty,
	CardTitle,
} from "@crm/ui/components/card";
import { type CarbonIcon, Icon } from "@crm/ui/components/icon";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useOpenRecord } from "@/components/crm/record-sheet/record-stack";
import { LocalRelativeTime } from "@/components/local-date-time";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";
import { useWorkspaceUrl } from "@/lib/use-workspace-url";

type AgentActivity = RouterOutputs["dashboard"]["agentActivity"];
type ActivityItem = AgentActivity["items"][number];

const REFRESH_MS = 30_000;

const KIND_ICON: Record<ActivityItem["kind"], CarbonIcon> = {
	read: Document,
	lead: UserFollow,
	call: PhoneVoice,
	draft: Email,
	score: Analytics,
	promise: Task,
};

const STATS: { key: keyof AgentActivity["stats"]; label: string }[] = [
	{ key: "conversations", label: "Conversations read" },
	{ key: "leads", label: "Leads filed" },
	{ key: "scored", label: "Deals scored" },
	{ key: "waiting", label: "Waiting for you" },
];

export function AgentActivityCard() {
	const trpc = useTRPC();
	const workspaceUrl = useWorkspaceUrl();
	const openRecord = useOpenRecord();
	const activity = useQuery({
		...trpc.dashboard.agentActivity.queryOptions(),
		refetchInterval: REFRESH_MS,
	});

	const data = activity.data;

	return (
		<Card className="min-w-0">
			<CardHeader>
				<CardTitle>Agent activity</CardTitle>
				<CardDescription>
					What the agents did on their own in the last 7 days
				</CardDescription>
				<CardAction>
					<Button asChild variant="contrast" size="sm">
						<Link href={workspaceUrl("/revival")}>Review drafts</Link>
					</Button>
				</CardAction>
			</CardHeader>

			{data && (
				<dl className="grid grid-cols-2 gap-x-6 gap-y-3 px-6 pb-4 sm:grid-cols-4">
					{STATS.map((stat) => (
						<div key={stat.key} className="flex flex-col gap-0.5">
							<dt className="text-muted-foreground text-xs">{stat.label}</dt>
							<dd className="font-medium text-xl tabular-nums">
								{data.stats[stat.key].toLocaleString()}
							</dd>
						</div>
					))}
				</dl>
			)}

			<CardPanel>
				{!data || data.items.length === 0 ? (
					<CardPanelEmpty>
						{activity.isPending
							? "Loading what the agents did…"
							: "Nothing yet. Import a conversation or connect Gmail and the agents start working."}
					</CardPanelEmpty>
				) : (
					<ul className="flex flex-col divide-y">
						{data.items.map((item) => {
							const record = item.record;
							return (
								<li key={item.id}>
									<button
										type="button"
										disabled={!record}
										onClick={() => record && openRecord(record)}
										className="flex w-full items-start gap-3 px-5 py-3 text-left transition-colors enabled:hover:bg-muted/50"
									>
										<span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-muted">
											<Icon icon={KIND_ICON[item.kind]} size={16} />
										</span>
										<span className="flex min-w-0 flex-1 flex-col gap-0.5">
											<span className="flex flex-wrap items-center gap-2">
												<span className="font-medium text-sm">
													{item.title}
												</span>
												{item.needsApproval && (
													<Badge variant="secondary">Needs your approval</Badge>
												)}
											</span>
											{item.detail && (
												<span className="line-clamp-2 text-muted-foreground text-sm">
													{item.detail}
												</span>
											)}
										</span>
										<span className="shrink-0 text-muted-foreground text-xs">
											<LocalRelativeTime date={item.at} />
										</span>
									</button>
								</li>
							);
						})}
					</ul>
				)}
			</CardPanel>
		</Card>
	);
}

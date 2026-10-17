"use client";

import Notification from "@carbon/icons-react/es/Notification";
import NotificationNew from "@carbon/icons-react/es/NotificationNew";
import { Button } from "@crm/ui/components/button";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@crm/ui/components/popover";
import { cn } from "@crm/ui/lib/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useOpenRecord } from "@/components/crm/record-sheet/record-stack";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";

type Item = RouterOutputs["notifications"]["list"]["items"][number];

const POLL_MS = 20_000;

const SOURCE_LABEL = new Map<string, string>(
	Object.entries({
		email: "Email",
		calendar: "Calendar",
		slack: "Slack",
		meeting: "Meeting",
		whatsapp: "WhatsApp",
		voice: "Voice",
		upload: "Upload",
		revival: "Revival",
		research: "Research",
	}),
);

function ago(iso: string): string {
	const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
	if (minutes < 1) return "now";
	if (minutes < 60) return `${minutes}m`;
	const hours = Math.round(minutes / 60);
	if (hours < 24) return `${hours}h`;
	return `${Math.round(hours / 24)}d`;
}

export function NotificationBell() {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const openRecord = useOpenRecord();
	const [open, setOpen] = useState(false);

	const list = useQuery({
		...trpc.notifications.list.queryOptions({ limit: 30 }),
		refetchInterval: POLL_MS,
	});
	const markRead = useMutation(
		trpc.notifications.markRead.mutationOptions({
			onSuccess: () =>
				queryClient.invalidateQueries({
					queryKey: trpc.notifications.list.queryKey(),
				}),
		}),
	);

	const items = list.data?.items ?? [];
	const unread = list.data?.unread ?? 0;

	const select = (item: Item) => {
		if (!item.read) markRead.mutate({ ids: [item.id] });
		if (item.entity && item.entityId) {
			setOpen(false);
			openRecord({ kind: item.entity, id: item.entityId });
		}
	};

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<Button
					variant="ghost"
					size="icon"
					className="relative"
					aria-label={
						unread > 0 ? `Notifications, ${unread} unread` : "Notifications"
					}
				>
					{unread > 0 ? <NotificationNew /> : <Notification />}
					{unread > 0 ? (
						<span className="absolute top-1 right-1 flex min-w-4 items-center justify-center rounded-full bg-primary px-1 font-mono text-[10px] text-primary-foreground tabular-nums">
							{unread > 99 ? "99+" : unread}
						</span>
					) : null}
				</Button>
			</PopoverTrigger>

			<PopoverContent align="end" size="panel">
				<div className="flex items-center justify-between border-b px-4 py-3">
					<span className="font-semibold text-popover-foreground text-sm">
						Notifications
					</span>
					<Button
						variant="ghost"
						size="sm"
						disabled={unread === 0 || markRead.isPending}
						onClick={() => markRead.mutate({})}
					>
						Mark all read
					</Button>
				</div>

				{items.length === 0 ? (
					<div className="flex flex-col gap-1 px-6 py-8 text-center">
						<span className="font-medium text-popover-foreground text-sm">
							Nothing yet
						</span>
						<span className="text-muted-foreground text-xs">
							New facts, contacts and follow-up drafts from your email, Slack
							and meetings show up here.
						</span>
					</div>
				) : (
					<ul className="max-h-96 overflow-y-auto">
						{items.map((item) => (
							<li key={item.id}>
								<button
									type="button"
									onClick={() => select(item)}
									className={cn(
										"flex w-full flex-col gap-1 border-b px-4 py-3 text-left last:border-b-0 hover:bg-accent focus-visible:bg-accent focus-visible:outline-none",
										!item.read && "bg-muted",
									)}
								>
									<span className="flex items-center gap-2 text-muted-foreground text-xs">
										{!item.read ? (
											<>
												<span
													className="size-2 rounded-full bg-primary"
													aria-hidden="true"
												/>
												<span className="sr-only">Unread</span>
											</>
										) : null}
										<span>
											{SOURCE_LABEL.get(item.source ?? "") ?? "Threadline"}
										</span>
										<span aria-hidden="true">·</span>
										<span>{ago(item.createdAt)}</span>
									</span>
									<span className="font-medium text-popover-foreground text-sm">
										{item.title}
									</span>
									{item.body ? (
										<span className="line-clamp-2 text-muted-foreground text-xs">
											{item.body}
										</span>
									) : null}
								</button>
							</li>
						))}
					</ul>
				)}
			</PopoverContent>
		</Popover>
	);
}

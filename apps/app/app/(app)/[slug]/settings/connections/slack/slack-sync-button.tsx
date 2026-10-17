"use client";

import { Button } from "@crm/ui/components/button";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { useTRPC } from "@/lib/trpc/client";

export function SlackSyncButton() {
	const trpc = useTRPC();
	const sync = useMutation(
		trpc.slack.syncNow.mutationOptions({
			onSuccess: (result) =>
				toast.success(
					result.channels > 0
						? `Reading the last day of ${result.channels} channels.`
						: "No new messages in channels the app has joined.",
				),
			onError: () => toast.error("Could not sync Slack."),
		}),
	);
	return (
		<Button
			variant="outline"
			size="sm"
			disabled={sync.isPending}
			onClick={() => sync.mutate()}
		>
			{sync.isPending ? "Syncing…" : "Sync now"}
		</Button>
	);
}

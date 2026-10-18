"use client";

import { Button } from "@crm/ui/components/button";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { CONNECTION_SYNC_COPY } from "@/lib/connection-sync-copy";
import { useTRPC } from "@/lib/trpc/client";

const SLACK_SYNC_TOAST = "slack-sync";

export function SlackSyncButton() {
	const trpc = useTRPC();
	const sync = useMutation(
		trpc.slack.syncNow.mutationOptions({
			onMutate: () => {
				toast.loading(CONNECTION_SYNC_COPY.slack.checking, {
					id: SLACK_SYNC_TOAST,
				});
			},
			onSuccess: (result) =>
				toast.success(
					result.channels > 0
						? `Reading the last 24 hours of ${result.channels} ${result.channels === 1 ? "channel" : "channels"}.`
						: "The app is not in any channels yet. Invite it to a channel, then sync again.",
					{
						id: SLACK_SYNC_TOAST,
						description:
							result.channels > 0
								? "New messages become facts and deals in the background."
								: undefined,
					},
				),
			onError: () =>
				toast.error("Slack sync did not start. Try again.", {
					id: SLACK_SYNC_TOAST,
				}),
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

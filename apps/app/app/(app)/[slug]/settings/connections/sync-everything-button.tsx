"use client";

import { Button } from "@crm/ui/components/button";
import { Spinner } from "@crm/ui/components/spinner";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { useTRPC } from "@/lib/trpc/client";

const SYNC_ALL_TOAST = "sync-everything";

export function SyncEverythingButton() {
	const trpc = useTRPC();
	const google = useMutation(trpc.google.syncNow.mutationOptions());
	const slack = useMutation(trpc.slack.syncNow.mutationOptions());
	const recorders = useMutation(trpc.recorders.syncNow.mutationOptions());
	const revival = useMutation(trpc.revival.runNow.mutationOptions());
	const rescore = useMutation(trpc.assist.rescoreAll.mutationOptions());
	const pending =
		google.isPending ||
		slack.isPending ||
		recorders.isPending ||
		revival.isPending ||
		rescore.isPending;

	async function run() {
		toast.loading(
			"Syncing Gmail, Calendar, Meet, Slack and recorders, then reviving and rescoring deals",
			{ id: SYNC_ALL_TOAST },
		);
		const steps = [
			{ label: "Google", run: () => google.mutateAsync() },
			{ label: "Slack", run: () => slack.mutateAsync() },
			{ label: "Meeting recorders", run: () => recorders.mutateAsync() },
			{ label: "Lead revival", run: () => revival.mutateAsync({}) },
			{ label: "Lead scores", run: () => rescore.mutateAsync() },
		];
		const results = await Promise.allSettled(steps.map((step) => step.run()));
		const skipped = steps
			.filter((_, index) => results[index]?.status === "rejected")
			.map((step) => step.label);
		toast.success("Everything is queued", {
			id: SYNC_ALL_TOAST,
			duration: 10_000,
			description: `New conversations become contacts, deals and facts over the next few minutes.${
				skipped.length > 0
					? ` Not connected or not available: ${skipped.join(", ")}.`
					: ""
			}`,
		});
	}

	return (
		<Button
			variant="outline"
			disabled={pending}
			onClick={() => {
				void run();
			}}
		>
			{pending ? <Spinner data-icon="inline-start" /> : null}
			Sync everything now
		</Button>
	);
}

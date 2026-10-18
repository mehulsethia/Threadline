"use client";

import { Button } from "@crm/ui/components/button";
import { Input } from "@crm/ui/components/input";
import { Label } from "@crm/ui/components/label";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { CONNECTION_SYNC_COPY } from "@/lib/connection-sync-copy";
import { useTRPC } from "@/lib/trpc/client";

type Provider = "fireflies" | "fathom";

const COPY = {
	fireflies: {
		name: "Fireflies.ai",
		where: "Fireflies → Settings → Developer settings → API key",
	},
	fathom: {
		name: "Fathom",
		where: "Fathom → Settings → API Access → Generate API key",
	},
} as const satisfies Record<Provider, { name: string; where: string }>;

const RECORDER_SYNC_TOAST = "recorder-sync";

export function RecorderKeys() {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const status = useQuery(trpc.recorders.status.queryOptions());
	const refresh = () =>
		queryClient.invalidateQueries({
			queryKey: trpc.recorders.status.queryKey(),
		});
	const sync = useMutation(
		trpc.recorders.syncNow.mutationOptions({
			onMutate: () => {
				toast.loading(CONNECTION_SYNC_COPY.recorders.checking, {
					id: RECORDER_SYNC_TOAST,
				});
			},
			onSuccess: () =>
				toast.success(CONNECTION_SYNC_COPY.recorders.checked.title, {
					id: RECORDER_SYNC_TOAST,
					description: CONNECTION_SYNC_COPY.recorders.checked.description,
				}),
			onError: () =>
				toast.error("The sync did not start. Try again.", {
					id: RECORDER_SYNC_TOAST,
				}),
		}),
	);

	const providers = status.data?.providers ?? [];
	const anyConnected = providers.some((p) => p.connected);

	return (
		<div className="flex flex-col gap-3">
			{providers.map((row) => (
				<RecorderCard
					key={row.provider}
					provider={row.provider}
					connected={row.connected}
					hint={row.hint}
					onChange={refresh}
				/>
			))}
			<div className="flex items-center justify-between gap-3 px-(--spacing-block-inline) text-muted-foreground text-sm">
				<span>
					{status.data?.lastSyncedAt
						? `Last checked ${new Date(status.data.lastSyncedAt).toLocaleString()}`
						: "Not checked yet"}
				</span>
				<Button
					variant="outline"
					size="sm"
					disabled={!anyConnected || sync.isPending}
					onClick={() => sync.mutate()}
				>
					Sync now
				</Button>
			</div>
		</div>
	);
}

function RecorderCard({
	provider,
	connected,
	hint,
	onChange,
}: {
	provider: Provider;
	connected: boolean;
	hint: string | null;
	onChange: () => void;
}) {
	const trpc = useTRPC();
	const [apiKey, setApiKey] = useState("");
	const save = useMutation(
		trpc.recorders.setKey.mutationOptions({
			onSuccess: () => {
				setApiKey("");
				const notice = CONNECTION_SYNC_COPY.recorders.connected(
					COPY[provider].name,
				);
				toast.success(notice.title, {
					description: notice.description,
					duration: 10_000,
				});
				onChange();
			},
			onError: () => toast.error("That key was not saved."),
		}),
	);
	const remove = useMutation(
		trpc.recorders.removeKey.mutationOptions({
			onSuccess: () => {
				toast.success(`${COPY[provider].name} disconnected.`);
				onChange();
			},
		}),
	);
	const inputId = `${provider}-key`;

	return (
		<section className="flex flex-col gap-4 rounded-lg border bg-card p-6">
			<div className="flex items-center justify-between gap-3">
				<h2 className="font-medium text-base">{COPY[provider].name}</h2>
				<span className="text-muted-foreground text-sm">
					{connected ? `Connected ${hint ?? ""}` : "Not connected"}
				</span>
			</div>
			<form
				className="flex flex-col gap-2"
				onSubmit={(event) => {
					event.preventDefault();
					if (apiKey.trim()) save.mutate({ provider, apiKey: apiKey.trim() });
				}}
			>
				<Label htmlFor={inputId}>API key</Label>
				<div className="flex flex-wrap gap-2">
					<Input
						id={inputId}
						type="password"
						autoComplete="off"
						value={apiKey}
						onChange={(event) => setApiKey(event.target.value)}
						placeholder={connected ? "Paste a new key to replace it" : ""}
						className="min-w-0 flex-1"
					/>
					<Button type="submit" disabled={!apiKey.trim() || save.isPending}>
						Save
					</Button>
					{connected ? (
						<Button
							type="button"
							variant="outline"
							disabled={remove.isPending}
							onClick={() => remove.mutate({ provider })}
						>
							Disconnect
						</Button>
					) : null}
				</div>
				<p className="text-muted-foreground text-xs">{COPY[provider].where}</p>
			</form>
		</section>
	);
}

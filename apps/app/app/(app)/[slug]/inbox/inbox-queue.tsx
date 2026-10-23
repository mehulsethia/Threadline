"use client";

import { Badge } from "@crm/ui/components/badge";
import { Button } from "@crm/ui/components/button";
import { Spinner } from "@crm/ui/components/spinner";
import { Tabs, TabsList, TabsTrigger } from "@crm/ui/components/tabs";
import { Textarea } from "@crm/ui/components/textarea";
import { cn } from "@crm/ui/lib/utils";
import { useMutation, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { RecordLink } from "@/components/crm/record-sheet/record-link";
import { LocalRelativeTime } from "@/components/local-date-time";
import { DEAL_STAGE_OPTIONS } from "@/lib/deal-stage";
import { fieldLabel } from "@/lib/fact-label";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";
import { useWorkspaceUrl } from "@/lib/use-workspace-url";

type InboxItem = RouterOutputs["inbox"]["list"]["items"][number];
type Filter = "all" | InboxItem["kind"];

const REFRESH_MS = 30_000;

const FILTERS: { value: Filter; label: string }[] = [
	{ value: "all", label: "All" },
	{ value: "draft", label: "Drafts" },
	{ value: "lead", label: "New leads" },
	{ value: "fact", label: "Facts" },
];

function itemKey(item: InboxItem): string {
	return `${item.kind}:${item.id}`;
}

function stageLabel(stage: string | null): string | null {
	return (
		DEAL_STAGE_OPTIONS.find((option) => option.value === stage)?.label ?? null
	);
}

function typing(target: EventTarget | null): boolean {
	return (
		target instanceof HTMLElement &&
		(target.isContentEditable ||
			["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
	);
}

export function InboxQueue() {
	const trpc = useTRPC();
	const cache = useCrmCache();
	const workspaceUrl = useWorkspaceUrl();
	const list = useQuery({
		...trpc.inbox.list.queryOptions(),
		refetchInterval: REFRESH_MS,
	});

	const [filter, setFilter] = useState<Filter>("all");
	const [done, setDone] = useState<ReadonlySet<string>>(new Set());
	const [selectedKey, setSelectedKey] = useState<string | null>(null);
	const [editingKey, setEditingKey] = useState<string | null>(null);
	const [editText, setEditText] = useState("");
	const [busyKey, setBusyKey] = useState<string | null>(null);

	const all = (list.data?.items ?? []).filter(
		(item) => !done.has(itemKey(item)),
	);
	const items = all.filter((item) => filter === "all" || item.kind === filter);
	const selectedIndex = Math.max(
		0,
		items.findIndex((item) => itemKey(item) === selectedKey),
	);
	const selected = items[selectedIndex];

	const finish = (item: InboxItem, message: string) => {
		const key = itemKey(item);
		const next = items[selectedIndex + 1] ?? items[selectedIndex - 1];
		setDone((prev) => new Set(prev).add(key));
		setSelectedKey(next ? itemKey(next) : null);
		setEditingKey(null);
		setBusyKey(null);
		toast.success(message);
		void cache.activity();
	};
	const fail = (error: { message: string }) => {
		setBusyKey(null);
		toast.error(error.message);
	};

	const approveDraft = useMutation(
		trpc.revival.approveAndSend.mutationOptions({ onError: fail }),
	);
	const rejectDraft = useMutation(
		trpc.revival.rejectDraft.mutationOptions({ onError: fail }),
	);
	const reviewContact = useMutation(
		trpc.contacts.review.mutationOptions({ onError: fail }),
	);
	const reviewCompany = useMutation(
		trpc.companies.review.mutationOptions({ onError: fail }),
	);
	const decideDealFact = useMutation(
		trpc.deals.decideFact.mutationOptions({ onError: fail }),
	);
	const decideContactFact = useMutation(
		trpc.contacts.decideFact.mutationOptions({ onError: fail }),
	);

	const act = (item: InboxItem, decision: "approve" | "skip") => {
		setBusyKey(itemKey(item));
		if (item.kind === "draft") {
			if (decision === "approve") {
				const text = editingKey === itemKey(item) ? editText : undefined;
				approveDraft.mutate(
					{ draftId: item.id, draftText: text },
					{
						onSuccess: (result) => {
							if (result.actionUrl) {
								window.open(result.actionUrl, "_blank", "noopener,noreferrer");
							}
							void cache.deal(item.record.id);
							finish(
								item,
								result.stageChanged
									? "Approved. The deal moved stage and the message is ready."
									: "Approved. The message is ready to send.",
							);
						},
					},
				);
			} else {
				rejectDraft.mutate(
					{ draftId: item.id },
					{ onSuccess: () => finish(item, "Draft skipped.") },
				);
			}
			return;
		}
		if (item.kind === "lead") {
			const input = {
				id: item.id,
				decision: decision === "approve" ? "keep" : "remove",
			} as const;
			const onSuccess = () =>
				finish(
					item,
					decision === "approve" ? "Kept as a lead." : "Removed from the CRM.",
				);
			if (item.record.kind === "company")
				reviewCompany.mutate(input, { onSuccess });
			else reviewContact.mutate(input, { onSuccess });
			return;
		}
		const input = {
			factId: item.id,
			decision: decision === "approve" ? "accept" : "dismiss",
		} as const;
		const onSuccess = () => {
			void (item.record.kind === "deal"
				? cache.deal(item.record.id)
				: cache.contact(item.record.id));
			finish(
				item,
				decision === "approve" ? "Fact accepted." : "Fact dismissed.",
			);
		};
		if (item.record.kind === "deal")
			decideDealFact.mutate(input, { onSuccess });
		else decideContactFact.mutate(input, { onSuccess });
	};

	const startEdit = (item: InboxItem) => {
		if (item.kind !== "draft") return;
		setSelectedKey(itemKey(item));
		setEditingKey(itemKey(item));
		setEditText(item.text);
	};

	const keys = useRef({
		items,
		selectedIndex,
		selected,
		editingKey,
		busyKey,
		act,
		startEdit,
	});
	keys.current = {
		items,
		selectedIndex,
		selected,
		editingKey,
		busyKey,
		act,
		startEdit,
	};

	useEffect(() => {
		const onKey = (event: KeyboardEvent) => {
			if (
				event.metaKey ||
				event.ctrlKey ||
				event.altKey ||
				typing(event.target)
			)
				return;
			const state = keys.current;
			const move = (by: number) => {
				const next = state.items[state.selectedIndex + by];
				if (next) {
					event.preventDefault();
					movedByKey.current = true;
					setSelectedKey(itemKey(next));
				}
			};
			if (event.key === "j" || event.key === "ArrowDown") move(1);
			else if (event.key === "k" || event.key === "ArrowUp") move(-1);
			else if (!state.selected || state.busyKey) return;
			else if (event.key === "a") {
				event.preventDefault();
				state.act(state.selected, "approve");
			} else if (event.key === "s") {
				event.preventDefault();
				state.act(state.selected, "skip");
			} else if (event.key === "e") {
				event.preventDefault();
				state.startEdit(state.selected);
			}
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, []);

	const selectedRef = useRef<HTMLLIElement | null>(null);
	const movedByKey = useRef(false);
	const selectedId = selected ? itemKey(selected) : null;
	useEffect(() => {
		if (!selectedId || !movedByKey.current) return;
		movedByKey.current = false;
		selectedRef.current?.scrollIntoView({ block: "nearest" });
	}, [selectedId]);

	if (list.isPending) {
		return (
			<div className="flex justify-center py-12">
				<Spinner />
			</div>
		);
	}

	const counts = {
		all: all.length,
		draft: all.filter((item) => item.kind === "draft").length,
		lead: all.filter((item) => item.kind === "lead").length,
		fact: all.filter((item) => item.kind === "fact").length,
	};

	return (
		<div className="flex flex-col gap-4">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<div className="-mx-1 max-w-full overflow-x-auto px-1">
					<Tabs
						value={filter}
						onValueChange={(value) => setFilter(value as Filter)}
					>
						<TabsList className="w-max">
							{FILTERS.map((option) => (
								<TabsTrigger key={option.value} value={option.value}>
									{option.label}
									<span className="ml-1.5 text-muted-foreground tabular-nums">
										{counts[option.value]}
									</span>
								</TabsTrigger>
							))}
						</TabsList>
					</Tabs>
				</div>
				<p className="hidden text-muted-foreground text-xs md:block">
					<kbd className="font-sans">J</kbd>/<kbd className="font-sans">K</kbd>{" "}
					move · <kbd className="font-sans">A</kbd> approve ·{" "}
					<kbd className="font-sans">E</kbd> edit ·{" "}
					<kbd className="font-sans">S</kbd> skip
				</p>
			</div>

			{items.length === 0 ? (
				<div className="flex flex-col items-center gap-3 rounded-lg border bg-card px-4 py-12 text-center">
					<p className="font-medium text-base">All clear</p>
					<p className="max-w-md text-muted-foreground text-sm">
						Nothing is waiting for you. The agents put every new draft, lead and
						fact here as they find it.
					</p>
					<Button asChild variant="outline" size="sm">
						<Link href={workspaceUrl("/")}>See what the agents did</Link>
					</Button>
				</div>
			) : (
				<ul className="flex flex-col gap-3">
					{items.map((item, index) => {
						const key = itemKey(item);
						const isSelected = index === selectedIndex;
						return (
							<li
								key={key}
								ref={isSelected ? selectedRef : undefined}
								onPointerDown={() => setSelectedKey(key)}
								onFocusCapture={() => setSelectedKey(key)}
								className={cn(
									"flex flex-col gap-3 rounded-lg border bg-card p-4 transition-shadow sm:p-5",
									isSelected && "ring-2 ring-ring",
								)}
							>
								<ItemBody
									item={item}
									editing={editingKey === key}
									editText={editText}
									onEditText={setEditText}
								/>
								<ItemActions
									item={item}
									busy={busyKey === key}
									editing={editingKey === key}
									onApprove={() => act(item, "approve")}
									onSkip={() => act(item, "skip")}
									onEdit={() => startEdit(item)}
									onCancelEdit={() => setEditingKey(null)}
								/>
							</li>
						);
					})}
				</ul>
			)}
		</div>
	);
}

function ItemBody({
	item,
	editing,
	editText,
	onEditText,
}: {
	item: InboxItem;
	editing: boolean;
	editText: string;
	onEditText: (text: string) => void;
}) {
	const label =
		item.kind === "draft"
			? item.afterCall
				? "After the call"
				: "Follow-up draft"
			: item.kind === "lead"
				? "New inbound lead"
				: "Suggested fact";

	return (
		<div className="flex flex-col gap-2.5">
			<div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
				<Badge variant="secondary">{label}</Badge>
				<RecordLink kind={item.record.kind} id={item.record.id}>
					{item.record.name}
				</RecordLink>
				<span className="ml-auto text-muted-foreground">
					<LocalRelativeTime date={item.at} />
				</span>
			</div>

			{item.kind === "draft" ? (
				<>
					<p className="font-medium text-sm">
						{item.afterCall
							? `Call with ${item.contactName}`
							: `To ${item.contactName}`}
						{item.companyName ? `, ${item.companyName}` : ""} by{" "}
						{item.channel === "WHATSAPP" ? "WhatsApp" : "email"}
					</p>
					{item.summary ? (
						<p className="text-muted-foreground text-sm">{item.summary}</p>
					) : null}
					{stageLabel(item.proposedStage) ? (
						<p className="text-sm">
							Proposes moving the deal to{" "}
							<span className="font-medium">
								{stageLabel(item.proposedStage)}
							</span>
						</p>
					) : null}
					{editing ? (
						<Textarea
							autoFocus
							value={editText}
							onChange={(event) => onEditText(event.target.value)}
							className="min-h-36 text-base sm:text-sm"
						/>
					) : (
						<div className="whitespace-pre-wrap rounded-md bg-muted px-3 py-2.5 text-sm">
							{item.subject ? (
								<p className="pb-1.5 font-medium">{item.subject}</p>
							) : null}
							{item.text}
						</div>
					)}
				</>
			) : item.kind === "lead" ? (
				<p className="text-sm">
					{item.email ?? item.record.name}
					{item.companyName ? ` at ${item.companyName}` : ""} wrote to you
					first. Nobody has replied, and they are not a known contact yet.
				</p>
			) : (
				<p className="text-sm">
					<span className="text-muted-foreground">
						{fieldLabel(item.field)}:{" "}
					</span>
					<span className="font-medium">{item.value}</span>
				</p>
			)}

			{item.evidence.length > 0 ? (
				<ul className="flex flex-col gap-1.5">
					{item.evidence.slice(0, 3).map((quote) => (
						<li
							key={`${quote.kind}:${quote.text}`}
							className="break-words border-thread border-l-2 pl-2.5 text-muted-foreground text-xs"
						>
							{quote.text}
						</li>
					))}
				</ul>
			) : null}
		</div>
	);
}

function ItemActions({
	item,
	busy,
	editing,
	onApprove,
	onSkip,
	onEdit,
	onCancelEdit,
}: {
	item: InboxItem;
	busy: boolean;
	editing: boolean;
	onApprove: () => void;
	onSkip: () => void;
	onEdit: () => void;
	onCancelEdit: () => void;
}) {
	const approveLabel =
		item.kind === "draft"
			? stageLabel(item.proposedStage)
				? `Approve, move to ${stageLabel(item.proposedStage)} & send`
				: "Approve & send"
			: item.kind === "lead"
				? "Keep"
				: "Accept";
	const skipLabel =
		item.kind === "draft"
			? "Skip"
			: item.kind === "lead"
				? "Remove"
				: "Dismiss";

	return (
		<div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
			<Button size="sm" disabled={busy} onClick={onApprove}>
				{busy ? <Spinner data-icon="inline-start" /> : null}
				{approveLabel}
			</Button>
			{item.kind === "draft" ? (
				editing ? (
					<Button
						size="sm"
						variant="outline"
						disabled={busy}
						onClick={onCancelEdit}
					>
						Cancel edit
					</Button>
				) : (
					<Button size="sm" variant="outline" disabled={busy} onClick={onEdit}>
						Edit
					</Button>
				)
			) : null}
			<Button size="sm" variant="ghost" disabled={busy} onClick={onSkip}>
				{skipLabel}
			</Button>
		</div>
	);
}

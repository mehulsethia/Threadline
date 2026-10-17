"use client";

import Chat from "@carbon/icons-react/es/Chat";
import Checkmark from "@carbon/icons-react/es/Checkmark";
import Close from "@carbon/icons-react/es/Close";
import Edit from "@carbon/icons-react/es/Edit";
import Email from "@carbon/icons-react/es/Email";
import Information from "@carbon/icons-react/es/Information";
import Renew from "@carbon/icons-react/es/Renew";
import Send from "@carbon/icons-react/es/Send";
import Settings from "@carbon/icons-react/es/Settings";
import Warning from "@carbon/icons-react/es/Warning";
import type { DealStage } from "@crm/db/enums";
import { Badge } from "@crm/ui/components/badge";
import { Button } from "@crm/ui/components/button";
import {
	Card,
	CardContent,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@crm/ui/components/card";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@crm/ui/components/dialog";
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@crm/ui/components/empty";
import { Input } from "@crm/ui/components/input";
import { Label } from "@crm/ui/components/label";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@crm/ui/components/popover";
import { Spinner } from "@crm/ui/components/spinner";
import { Tabs, TabsList, TabsTrigger } from "@crm/ui/components/tabs";
import { Textarea } from "@crm/ui/components/textarea";
import { formatMoney } from "@crm/ui/lib/format";
import { cn } from "@crm/ui/lib/utils";
import type { CitedEvidenceItem } from "@crm/validation/cited-evidence";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { DealStageIndicator } from "@/components/crm/deal-stage";
import {
	PageShellActions,
	PageShellContent,
	PageShellDescription,
	PageShellHeader,
	PageShellHeading,
	PageShellTitle,
} from "@/components/page-shell";
import { useTRPC } from "@/lib/trpc/client";

type DraftStatusTab = "PENDING_APPROVAL" | "SENT" | "REJECTED";

type RevivalDraft = {
	id: string;
	dealId: string;
	dealName: string;
	dealStage: string;
	dealValue: number | null;
	dealCurrency: string;
	contactId: string;
	contactName: string;
	contactPhone: string | null;
	contactEmail: string | null;
	companyName: string | null;
	channel: string;
	strategy: string | null;
	contextRationale: string;
	draftText: string;
	subject: string | null;
	confidence: number | null;
	citedEvidence: CitedEvidenceItem[];
	stalledReason: string | null;
	priorityScore: number | null;
	status: string;
	waLink: string | null;
	createdAt: string;
};

export function RevivalDashboard() {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const [activeTab, setActiveTab] =
		useState<DraftStatusTab>("PENDING_APPROVAL");
	const [settingsOpen, setSettingsOpen] = useState(false);

	const draftsQuery = useQuery(
		trpc.revival.listDrafts.queryOptions({ status: activeTab }),
	);

	const runNowMutation = useMutation(
		trpc.revival.runNow.mutationOptions({
			onSuccess: () => {
				toast.success("Revival sweep queued. Refreshing drafts...");
				queryClient.invalidateQueries({
					queryKey: trpc.revival.listDrafts.queryKey(),
				});
			},
			onError: (err) => {
				toast.error(err.message || "Failed to start revival run");
			},
		}),
	);

	const drafts: RevivalDraft[] = draftsQuery.data?.drafts ?? [];

	return (
		<>
			<PageShellHeader>
				<PageShellHeading>
					<PageShellTitle>Lead Revival</PageShellTitle>
					<PageShellDescription>
						Autonomous, evidence-backed follow-ups for stalled pipeline deals.
					</PageShellDescription>
				</PageShellHeading>
				<PageShellActions>
					<Button
						variant="outline"
						size="sm"
						onClick={() => setSettingsOpen(true)}
						className="gap-1.5"
					>
						<Settings className="size-4" />
						Settings
					</Button>
					<Button
						size="sm"
						disabled={runNowMutation.isPending}
						onClick={() => runNowMutation.mutate({})}
						className="gap-1.5"
					>
						{runNowMutation.isPending ? (
							<Spinner className="size-4" />
						) : (
							<Renew className="size-4" />
						)}
						Run revival now
					</Button>
				</PageShellActions>
			</PageShellHeader>

			<PageShellContent className="space-y-6">
				<div className="flex items-center justify-between border-b pb-3">
					<Tabs
						value={activeTab}
						onValueChange={(val) => setActiveTab(val as DraftStatusTab)}
					>
						<TabsList>
							<TabsTrigger value="PENDING_APPROVAL" className="gap-2">
								Pending Approval
								{activeTab === "PENDING_APPROVAL" && drafts.length > 0 && (
									<Badge variant="secondary" className="px-1.5 py-0 text-xs">
										{drafts.length}
									</Badge>
								)}
							</TabsTrigger>
							<TabsTrigger value="SENT">Sent</TabsTrigger>
							<TabsTrigger value="REJECTED">Skipped</TabsTrigger>
						</TabsList>
					</Tabs>
				</div>

				{draftsQuery.isLoading ? (
					<div className="flex h-64 items-center justify-center">
						<Spinner className="size-8 text-muted-foreground" />
					</div>
				) : drafts.length === 0 ? (
					<Empty className="py-16">
						<EmptyMedia variant="icon">
							<Renew className="size-5 text-muted-foreground" />
						</EmptyMedia>
						<EmptyHeader>
							<EmptyTitle>No stalled drafts found</EmptyTitle>
							<EmptyDescription>
								{activeTab === "PENDING_APPROVAL"
									? "All active leads are progressing within SLA standards, or none currently qualify for automated outreach."
									: `No ${activeTab.toLowerCase()} revival drafts found.`}
							</EmptyDescription>
						</EmptyHeader>
						{activeTab === "PENDING_APPROVAL" && (
							<EmptyContent>
								<Button
									size="sm"
									disabled={runNowMutation.isPending}
									onClick={() => runNowMutation.mutate({})}
									className="gap-1.5"
								>
									<Renew className="size-4" />
									Check for stalled leads now
								</Button>
							</EmptyContent>
						)}
					</Empty>
				) : (
					<div className="grid gap-6">
						{drafts.map((draft) => (
							<RevivalDraftCard
								key={draft.id}
								draft={draft}
								onRefresh={() => {
									queryClient.invalidateQueries({
										queryKey: trpc.revival.listDrafts.queryKey(),
									});
								}}
							/>
						))}
					</div>
				)}
			</PageShellContent>

			<RevivalSettingsDialog
				open={settingsOpen}
				onOpenChange={setSettingsOpen}
			/>
		</>
	);
}

function RevivalDraftCard({
	draft,
	onRefresh,
}: {
	draft: RevivalDraft;
	onRefresh: () => void;
}) {
	const trpc = useTRPC();
	const [isEditing, setIsEditing] = useState(false);
	const [editedText, setEditedText] = useState(draft.draftText);
	const [editedSubject, setEditedSubject] = useState(draft.subject || "");

	const approveMutation = useMutation(
		trpc.revival.approveAndSend.mutationOptions({
			onSuccess: (result) => {
				toast.success("Draft approved and marked as sent");
				if (result.actionUrl) {
					window.open(result.actionUrl, "_blank", "noopener,noreferrer");
				}
				onRefresh();
			},
			onError: (err) => {
				toast.error(err.message || "Failed to approve draft");
			},
		}),
	);

	const updateMutation = useMutation(
		trpc.revival.updateDraft.mutationOptions({
			onSuccess: () => {
				toast.success("Draft updated");
				setIsEditing(false);
				onRefresh();
			},
			onError: (err) => {
				toast.error(err.message || "Failed to update draft");
			},
		}),
	);

	const rejectMutation = useMutation(
		trpc.revival.rejectDraft.mutationOptions({
			onSuccess: () => {
				toast.info("Draft skipped");
				onRefresh();
			},
			onError: (err) => {
				toast.error(err.message || "Failed to skip draft");
			},
		}),
	);

	const amountCents = draft.dealValue
		? Math.round(Number(draft.dealValue) * 100)
		: 0;
	const formattedValue = draft.dealCurrency
		? formatMoney(amountCents, draft.dealCurrency)
		: "Unknown";

	const citations = draft.citedEvidence;

	const isPending = draft.status === "PENDING_APPROVAL";

	return (
		<Card className="overflow-hidden border transition-all">
			<CardHeader className="bg-muted/30 pb-4">
				<div className="flex flex-wrap items-start justify-between gap-4">
					<div className="space-y-1">
						<div className="flex flex-wrap items-center gap-2">
							<CardTitle className="text-base font-semibold">
								{draft.dealName || "Unnamed Deal"}
							</CardTitle>
							{draft.dealStage && (
								<DealStageIndicator stage={draft.dealStage as DealStage} />
							)}
							<Badge variant="outline" className="text-xs">
								{formattedValue}
							</Badge>
						</div>
						<div className="text-xs text-muted-foreground flex flex-wrap items-center gap-2">
							{draft.companyName && <span>{draft.companyName} • </span>}
							<span>{draft.contactName}</span>
							<span>•</span>
							<span>
								{draft.channel === "WHATSAPP"
									? draft.contactPhone || "No phone"
									: draft.contactEmail || "No email"}
							</span>
						</div>
					</div>

					<div className="flex items-center gap-2">
						<Badge
							variant="secondary"
							className={cn(
								"font-mono text-xs",
								(draft.priorityScore ?? 0) >= 70
									? "border-warning/20 bg-warning/10 text-warning"
									: "",
							)}
						>
							Priority Score: {Math.round(draft.priorityScore ?? 0)}
						</Badge>
					</div>
				</div>

				{draft.stalledReason && (
					<div className="mt-3 flex items-start gap-2 rounded-md bg-warning/10 p-2.5 text-xs text-warning">
						<Warning className="mt-0.5 size-4 shrink-0 text-warning" />
						<div>
							<span className="font-semibold">Why stalled: </span>
							{draft.stalledReason}
						</div>
					</div>
				)}
			</CardHeader>

			<CardContent className="space-y-4 pt-4">
				<div className="flex flex-wrap items-center justify-between gap-2 border-b pb-3">
					<div className="flex items-center gap-2">
						<Badge variant="outline" className="capitalize text-xs font-medium">
							Strategy: {draft.strategy?.replace("_", " ") || "nudge"}
						</Badge>
						{draft.confidence && (
							<span className="text-xs text-muted-foreground">
								{Math.round(draft.confidence * 100)}% confidence
							</span>
						)}
					</div>

					<div className="flex items-center gap-1.5">
						{draft.channel === "WHATSAPP" ? (
							<Badge variant="outline" className="gap-1 text-xs">
								<Chat className="size-3" />
								WhatsApp
							</Badge>
						) : (
							<Badge variant="outline" className="gap-1 text-xs">
								<Email className="size-3" />
								Email
							</Badge>
						)}
						<Badge variant="secondary" className="uppercase text-[10px]">
							{draft.strategy || "en"}
						</Badge>
					</div>
				</div>

				{draft.contextRationale && (
					<div className="text-xs text-muted-foreground">
						<span className="font-medium text-foreground">Rationale: </span>
						{draft.contextRationale}
					</div>
				)}

				{citations.length > 0 && (
					<div className="flex flex-wrap items-center gap-1.5">
						<span className="text-xs font-medium text-muted-foreground">
							Cited evidence:
						</span>
						{citations.map((cite, idx) => {
							const citeId = cite.evidenceId || String(idx);
							const quoteText = cite.quote || "Evidence quote";
							const citeLabel = `[${cite.kind || "evidence"}] ${quoteText.slice(0, 24)}...`;
							const citeDetail = cite.quote || "Evidence citation";

							return (
								<Popover key={citeId}>
									<PopoverTrigger asChild>
										<button
											type="button"
											className="inline-flex items-center gap-1 rounded bg-muted px-2 py-0.5 text-[11px] font-mono text-muted-foreground hover:bg-muted/80 transition-colors"
										>
											<Information className="size-3" />
											{citeLabel}
										</button>
									</PopoverTrigger>
									<PopoverContent className="w-80 text-xs">
										<div className="font-semibold mb-1">
											Grounded Evidence Citation
										</div>
										<div className="text-muted-foreground">{citeDetail}</div>
									</PopoverContent>
								</Popover>
							);
						})}
					</div>
				)}

				<div className="rounded-md border bg-muted/20 p-3 space-y-2">
					{draft.channel === "EMAIL" && (
						<div className="border-b pb-2">
							<Label className="text-[11px] text-muted-foreground uppercase">
								Subject
							</Label>
							{isEditing ? (
								<Input
									value={editedSubject}
									onChange={(e) => setEditedSubject(e.target.value)}
									className="mt-1 h-8 text-sm"
								/>
							) : (
								<p className="font-medium text-sm">
									{draft.subject || "No subject"}
								</p>
							)}
						</div>
					)}

					<div>
						<Label className="text-[11px] text-muted-foreground uppercase">
							Draft Content
						</Label>
						{isEditing ? (
							<div className="mt-1 space-y-2">
								<Textarea
									value={editedText}
									onChange={(e) => setEditedText(e.target.value)}
									rows={4}
									className="text-sm font-sans"
								/>
								<div className="flex justify-end gap-2">
									<Button
										size="xs"
										variant="ghost"
										onClick={() => {
											setEditedText(draft.draftText);
											setEditedSubject(draft.subject || "");
											setIsEditing(false);
										}}
									>
										Cancel
									</Button>
									<Button
										size="xs"
										disabled={updateMutation.isPending}
										onClick={() =>
											updateMutation.mutate({
												draftId: draft.id,
												draftText: editedText,
												subject: editedSubject,
											})
										}
									>
										Save edits
									</Button>
								</div>
							</div>
						) : (
							<div className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-foreground">
								{draft.draftText}
							</div>
						)}
					</div>
				</div>
			</CardContent>

			{isPending && (
				<CardFooter className="flex items-center justify-between border-t bg-muted/10 py-3">
					<div className="flex items-center gap-2">
						<Button
							variant="ghost"
							size="sm"
							onClick={() => setIsEditing(!isEditing)}
							className="gap-1.5 text-xs"
						>
							<Edit className="size-3.5" />
							{isEditing ? "Done editing" : "Edit draft"}
						</Button>
						<Button
							variant="ghost"
							size="sm"
							disabled={rejectMutation.isPending}
							onClick={() =>
								rejectMutation.mutate({
									draftId: draft.id,
								})
							}
							className="gap-1.5 text-xs text-muted-foreground hover:text-destructive"
						>
							<Close className="size-3.5" />
							Skip
						</Button>
					</div>

					<Button
						size="sm"
						disabled={approveMutation.isPending}
						onClick={() =>
							approveMutation.mutate({
								draftId: draft.id,
								draftText: editedText,
							})
						}
						className="gap-1.5 text-xs"
					>
						{approveMutation.isPending ? (
							<Spinner className="size-3.5" />
						) : (
							<Send className="size-3.5" />
						)}
						Approve & Send
					</Button>
				</CardFooter>
			)}

			{!isPending && (
				<CardFooter className="flex items-center justify-between border-t bg-muted/10 py-2.5 text-xs text-muted-foreground">
					<div className="flex items-center gap-1.5">
						<Checkmark className="size-3.5 text-success" />
						Status:{" "}
						<span className="font-medium capitalize">{draft.status}</span>
					</div>
					{draft.createdAt && (
						<div>Created at {new Date(draft.createdAt).toLocaleString()}</div>
					)}
				</CardFooter>
			)}
		</Card>
	);
}

function RevivalSettingsDialog({
	open,
	onOpenChange,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const settingsQuery = useQuery(trpc.revival.getSettings.queryOptions({}));

	const [stageSlas, setStageSlas] = useState({
		Lead: 3,
		Qualified: 5,
		MeetingDemo: 4,
		Proposal: 5,
		Negotiation: 3,
	});

	const [playbook, setPlaybook] = useState("");
	const [initialized, setInitialized] = useState(false);

	if (settingsQuery.data && !initialized) {
		const slas = settingsQuery.data.slas;
		setStageSlas({
			Lead: slas.UNQUALIFIED_TO_BUY ?? 3,
			Qualified: slas.QUALIFIED_TO_BUY ?? 5,
			MeetingDemo: slas.DEMO_BOOKED ?? 4,
			Proposal: slas.CONTRACT_SENT ?? 5,
			Negotiation: slas.DECISION_MAKER_BOUGHT_IN ?? 3,
		});
		setPlaybook(settingsQuery.data.playbook ?? "");
		setInitialized(true);
	}

	const updateSettingsMutation = useMutation(
		trpc.revival.updateSettings.mutationOptions({
			onSuccess: () => {
				toast.success("Revival settings updated");
				queryClient.invalidateQueries({
					queryKey: trpc.revival.getSettings.queryKey(),
				});
				onOpenChange(false);
			},
			onError: (err) => {
				toast.error(err.message || "Failed to update settings");
			},
		}),
	);

	const handleSave = () => {
		updateSettingsMutation.mutate({
			slas: {
				UNQUALIFIED_TO_BUY: stageSlas.Lead,
				QUALIFIED_TO_BUY: stageSlas.Qualified,
				DEMO_BOOKED: stageSlas.MeetingDemo,
				CONTRACT_SENT: stageSlas.Proposal,
				DECISION_MAKER_BOUGHT_IN: stageSlas.Negotiation,
			},
			playbook,
		});
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-md">
				<DialogHeader>
					<DialogTitle>Lead Revival Configuration</DialogTitle>
					<DialogDescription>
						Configure stage inactivity thresholds (SLAs) and your sales
						playbook.
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-4 py-2">
					<div className="space-y-2">
						<Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
							Stage Inactivity SLAs (Days)
						</Label>
						<div className="grid grid-cols-2 gap-2 text-xs">
							<div>
								<Label className="text-xs">Lead</Label>
								<Input
									type="number"
									min={1}
									max={90}
									value={stageSlas.Lead}
									onChange={(e) =>
										setStageSlas({
											...stageSlas,
											Lead: Number.parseInt(e.target.value, 10) || 1,
										})
									}
								/>
							</div>
							<div>
								<Label className="text-xs">Qualified</Label>
								<Input
									type="number"
									min={1}
									max={90}
									value={stageSlas.Qualified}
									onChange={(e) =>
										setStageSlas({
											...stageSlas,
											Qualified: Number.parseInt(e.target.value, 10) || 1,
										})
									}
								/>
							</div>
							<div>
								<Label className="text-xs">Meeting / Demo</Label>
								<Input
									type="number"
									min={1}
									max={90}
									value={stageSlas.MeetingDemo}
									onChange={(e) =>
										setStageSlas({
											...stageSlas,
											MeetingDemo: Number.parseInt(e.target.value, 10) || 1,
										})
									}
								/>
							</div>
							<div>
								<Label className="text-xs">Proposal</Label>
								<Input
									type="number"
									min={1}
									max={90}
									value={stageSlas.Proposal}
									onChange={(e) =>
										setStageSlas({
											...stageSlas,
											Proposal: Number.parseInt(e.target.value, 10) || 1,
										})
									}
								/>
							</div>
							<div className="col-span-2">
								<Label className="text-xs">Negotiation</Label>
								<Input
									type="number"
									min={1}
									max={90}
									value={stageSlas.Negotiation}
									onChange={(e) =>
										setStageSlas({
											...stageSlas,
											Negotiation: Number.parseInt(e.target.value, 10) || 1,
										})
									}
								/>
							</div>
						</div>
					</div>

					<div className="space-y-2">
						<Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
							Sales Playbook Guidance
						</Label>
						<Textarea
							value={playbook}
							onChange={(e) => setPlaybook(e.target.value)}
							rows={5}
							placeholder="Add product/pricing guidelines, target value propositions, preferred tone, and sign-offs..."
							className="text-xs"
						/>
					</div>
				</div>

				<DialogFooter>
					<Button
						variant="outline"
						size="sm"
						onClick={() => onOpenChange(false)}
					>
						Cancel
					</Button>
					<Button
						size="sm"
						disabled={updateSettingsMutation.isPending}
						onClick={handleSave}
					>
						{updateSettingsMutation.isPending ? (
							<Spinner className="size-4" />
						) : (
							"Save Settings"
						)}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

"use client";

import { Badge } from "@crm/ui/components/badge";
import { Button } from "@crm/ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@crm/ui/components/dialog";
import { Label } from "@crm/ui/components/label";
import { Spinner } from "@crm/ui/components/spinner";
import { Textarea } from "@crm/ui/components/textarea";
import { ToggleGroup, ToggleGroupItem } from "@crm/ui/components/toggle-group";
import { cn } from "@crm/ui/lib/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";

type Insights = RouterOutputs["assist"]["insights"];
type Draft = NonNullable<RouterOutputs["assist"]["draft"]>;
type Brief = NonNullable<RouterOutputs["assist"]["brief"]>;
type Channel = Draft["channel"];

const HEALTH = new Map<string, { label: string; tone: string }>(
	Object.entries({
		on_track: { label: "On track", tone: "text-success" },
		at_risk: { label: "At risk", tone: "text-warning" },
		stalled: { label: "Stalled", tone: "text-destructive" },
		won: { label: "Won", tone: "text-success" },
		lost: { label: "Lost", tone: "text-muted-foreground" },
	}),
);

const FACTORS = [
	["fit", "Fit"],
	["intent", "Intent"],
	["engagement", "Engagement"],
	["risk", "Risk"],
] as const;

function scoreTone(score: number): string {
	if (score >= 75) return "text-success";
	if (score >= 45) return "text-warning";
	return "text-destructive";
}

export function DealAssist({ dealId }: { dealId: string }) {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const [draftOpen, setDraftOpen] = useState(false);
	const [briefOpen, setBriefOpen] = useState(false);
	const insights = useQuery(trpc.assist.insights.queryOptions({ dealId }));
	const refresh = () =>
		queryClient.invalidateQueries({
			queryKey: trpc.assist.insights.queryKey({ dealId }),
		});
	const rescore = useMutation(
		trpc.assist.rescore.mutationOptions({
			onSuccess: (data) =>
				queryClient.setQueryData(
					trpc.assist.insights.queryKey({ dealId }),
					data,
				),
			onError: (error) => toast.error(error.message),
		}),
	);
	const promise = useMutation(
		trpc.assist.updatePromise.mutationOptions({
			onSuccess: refresh,
			onError: (error) => toast.error(error.message),
		}),
	);

	if (insights.isPending) {
		return (
			<div className="flex justify-center p-8">
				<Spinner />
			</div>
		);
	}
	const data = insights.data;

	return (
		<div className="flex flex-col gap-6 p-4">
			<section className="flex flex-col gap-3">
				<div className="flex items-center justify-between gap-3">
					<h3 className="font-medium text-sm">Lead score</h3>
					<Button
						variant="outline"
						size="sm"
						disabled={rescore.isPending}
						onClick={() => rescore.mutate({ dealId })}
					>
						{rescore.isPending ? <Spinner data-icon="inline-start" /> : null}
						{data?.leadScore === null || data?.leadScore === undefined
							? "Score now"
							: "Rescore"}
					</Button>
				</div>
				{data && data.leadScore !== null ? (
					<ScoreCard insights={data} />
				) : (
					<p className="text-muted-foreground text-sm">
						Not scored yet. Scores update after every new conversation.
					</p>
				)}
			</section>

			<section className="flex flex-col gap-2">
				<h3 className="font-medium text-sm">Next move</h3>
				<div className="flex flex-wrap gap-2">
					<Button size="sm" onClick={() => setDraftOpen(true)}>
						Draft personalized message
					</Button>
					<Button
						size="sm"
						variant="outline"
						onClick={() => setBriefOpen(true)}
					>
						Meeting prep
					</Button>
				</div>
			</section>

			<section className="flex flex-col gap-2">
				<h3 className="font-medium text-sm">Promises</h3>
				{data && data.promises.length > 0 ? (
					<ul className="flex flex-col divide-y rounded-md border">
						{data.promises.map((item) => (
							<li key={item.id} className="flex flex-col gap-1 p-3">
								<div className="flex items-center gap-2 text-xs">
									<Badge variant="outline">
										{item.owner === "us" ? "We promised" : "They promised"}
									</Badge>
									<span
										className={cn(
											"font-medium",
											item.status === "overdue" && "text-destructive",
											item.status === "kept" && "text-success",
										)}
									>
										{item.status}
									</span>
									{item.dueAt ? (
										<span className="text-muted-foreground">
											due {new Date(item.dueAt).toLocaleDateString()}
										</span>
									) : null}
								</div>
								<p className="text-sm">{item.text}</p>
								{item.quote ? (
									<p className="text-muted-foreground text-xs">
										“{item.quote}”
									</p>
								) : null}
								{item.status === "open" || item.status === "overdue" ? (
									<div className="flex gap-2 pt-1">
										<Button
											size="xs"
											variant="outline"
											disabled={promise.isPending}
											onClick={() =>
												promise.mutate({ id: item.id, status: "kept" })
											}
										>
											Mark kept
										</Button>
										<Button
											size="xs"
											variant="ghost"
											disabled={promise.isPending}
											onClick={() =>
												promise.mutate({ id: item.id, status: "dropped" })
											}
										>
											Drop
										</Button>
									</div>
								) : null}
							</li>
						))}
					</ul>
				) : (
					<p className="text-muted-foreground text-sm">
						No promises found in this deal's conversations yet.
					</p>
				)}
			</section>

			<DraftDialog
				dealId={dealId}
				open={draftOpen}
				onOpenChange={setDraftOpen}
			/>
			<BriefDialog
				dealId={dealId}
				open={briefOpen}
				onOpenChange={setBriefOpen}
			/>
		</div>
	);
}

function ScoreCard({ insights }: { insights: Insights }) {
	const score = insights.leadScore ?? 0;
	const health = HEALTH.get(insights.health ?? "");
	return (
		<div className="flex flex-col gap-3 rounded-md border p-3">
			<div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
				<span
					className={cn("font-medium text-3xl tabular-nums", scoreTone(score))}
				>
					{score}
				</span>
				<span className="text-muted-foreground text-sm">/ 100</span>
				{health ? (
					<span className={cn("font-medium text-sm", health.tone)}>
						{health.label}
					</span>
				) : null}
				{insights.winProbability !== null ? (
					<span className="text-muted-foreground text-sm">
						{Math.round(insights.winProbability * 100)}% win probability
					</span>
				) : null}
			</div>
			{insights.healthReason ? (
				<p className="text-muted-foreground text-xs">{insights.healthReason}</p>
			) : null}
			{insights.factors ? (
				<>
					<p className="text-sm">{insights.factors.summary}</p>
					<ul className="flex flex-col gap-2">
						{FACTORS.map(([key, label]) => {
							const factor = insights.factors?.[key];
							if (!factor) return null;
							return (
								<li key={key} className="flex flex-col gap-1">
									<div className="flex items-center justify-between text-xs">
										<span className="font-medium">{label}</span>
										<span className="tabular-nums">
											{Math.round(factor.score)}
										</span>
									</div>
									<div className="h-1.5 rounded-full bg-muted">
										<div
											className={cn(
												"h-1.5 rounded-full",
												key === "risk" ? "bg-destructive" : "bg-primary",
											)}
											style={{
												width: `${Math.max(2, Math.min(100, factor.score))}%`,
											}}
										/>
									</div>
									{factor.reasons.length > 0 ? (
										<p className="text-muted-foreground text-xs">
											{factor.reasons.join(" · ")}
										</p>
									) : null}
								</li>
							);
						})}
					</ul>
				</>
			) : null}
			{insights.scoredAt ? (
				<p className="text-muted-foreground text-xs">
					Scored {new Date(insights.scoredAt).toLocaleString()}
				</p>
			) : null}
		</div>
	);
}

function DraftDialog({
	dealId,
	open,
	onOpenChange,
}: {
	dealId: string;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const trpc = useTRPC();
	const [channel, setChannel] = useState<Channel>("email");
	const [goal, setGoal] = useState("");
	const [draft, setDraft] = useState<Draft | null>(null);
	const generate = useMutation(
		trpc.assist.draft.mutationOptions({
			onSuccess: (data) => {
				if (!data) toast.error("This deal could not be read.");
				setDraft(data);
			},
			onError: (error) => toast.error(error.message),
		}),
	);
	const text = draft
		? draft.subject
			? `Subject: ${draft.subject}\n\n${draft.body}`
			: draft.body
		: "";
	const sendHref = draft
		? draft.channel === "email" && draft.to
			? `mailto:${draft.to}?subject=${encodeURIComponent(draft.subject ?? "")}&body=${encodeURIComponent(draft.body)}`
			: draft.channel === "whatsapp" && draft.to
				? `https://wa.me/${draft.to.replace(/[^0-9]/g, "")}?text=${encodeURIComponent(draft.body)}`
				: null
		: null;

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-xl">
				<DialogHeader>
					<DialogTitle>Personalized message</DialogTitle>
					<DialogDescription>
						Written from this lead's own words, numbers and open promises. Every
						claim comes from the deal's evidence.
					</DialogDescription>
				</DialogHeader>
				<div className="flex flex-col gap-4">
					<div className="flex flex-col gap-2">
						<Label>Channel</Label>
						<ToggleGroup
							type="single"
							variant="outline"
							value={channel}
							onValueChange={(value) => {
								if (
									value === "email" ||
									value === "whatsapp" ||
									value === "linkedin"
								) {
									setChannel(value);
								}
							}}
						>
							<ToggleGroupItem value="email">Email</ToggleGroupItem>
							<ToggleGroupItem value="whatsapp">WhatsApp</ToggleGroupItem>
							<ToggleGroupItem value="linkedin">LinkedIn</ToggleGroupItem>
						</ToggleGroup>
					</div>
					<div className="flex flex-col gap-2">
						<Label htmlFor="draft-goal">Goal (optional)</Label>
						<Textarea
							id="draft-goal"
							rows={2}
							value={goal}
							onChange={(event) => setGoal(event.target.value)}
							placeholder="e.g. get them to book the security review this week"
						/>
					</div>
					<Button
						disabled={generate.isPending}
						onClick={() =>
							generate.mutate({ dealId, channel, goal: goal.trim() || null })
						}
					>
						{generate.isPending ? <Spinner data-icon="inline-start" /> : null}
						{draft ? "Write another" : "Write message"}
					</Button>
					{draft ? (
						<div className="flex flex-col gap-3">
							<Textarea
								rows={10}
								value={text}
								readOnly
								aria-label="Drafted message"
							/>
							<div className="flex flex-wrap gap-2">
								<Button
									variant="outline"
									size="sm"
									onClick={() => {
										void navigator.clipboard.writeText(text);
										toast.success("Copied.");
									}}
								>
									Copy
								</Button>
								{sendHref ? (
									<Button asChild size="sm">
										<a href={sendHref} target="_blank" rel="noreferrer">
											{draft.channel === "email"
												? "Open in email"
												: "Open in WhatsApp"}
										</a>
									</Button>
								) : null}
							</div>
							{draft.personalization.length > 0 ? (
								<div className="flex flex-col gap-1">
									<span className="font-medium text-xs">
										What made it personal
									</span>
									<ul className="list-disc pl-5 text-muted-foreground text-xs">
										{draft.personalization.map((item) => (
											<li key={item}>{item}</li>
										))}
									</ul>
								</div>
							) : null}
							{draft.removedClaims.length > 0 ? (
								<p className="text-warning text-xs">
									Removed claims the evidence does not support:{" "}
									{draft.removedClaims.join(", ")}
								</p>
							) : null}
						</div>
					) : null}
				</div>
			</DialogContent>
		</Dialog>
	);
}

function BriefDialog({
	dealId,
	open,
	onOpenChange,
}: {
	dealId: string;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const trpc = useTRPC();
	const [brief, setBrief] = useState<Brief | null>(null);
	const generate = useMutation(
		trpc.assist.brief.mutationOptions({
			onSuccess: (data) => setBrief(data),
			onError: (error) => toast.error(error.message),
		}),
	);

	return (
		<Dialog
			open={open}
			onOpenChange={(next) => {
				onOpenChange(next);
				if (next && !brief && !generate.isPending) generate.mutate({ dealId });
			}}
		>
			<DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-xl">
				<DialogHeader>
					<DialogTitle>Meeting prep</DialogTitle>
					<DialogDescription>
						Talking points, questions and objection handling for this lead.
					</DialogDescription>
				</DialogHeader>
				{generate.isPending ? (
					<div className="flex items-center gap-2 py-6 text-muted-foreground text-sm">
						<Spinner /> Preparing your brief…
					</div>
				) : brief ? (
					<div className="flex flex-col gap-4 text-sm">
						<p>{brief.summary}</p>
						{brief.goal ? (
							<p>
								<span className="font-medium">Goal: </span>
								{brief.goal}
							</p>
						) : null}
						<BriefList
							title="Talking points"
							items={brief.talkingPoints.map((p) => p.point)}
						/>
						<BriefList title="Questions to ask" items={brief.questions} />
						{brief.objections.length > 0 ? (
							<div className="flex flex-col gap-2">
								<span className="font-medium">Objections</span>
								{brief.objections.map((item) => (
									<div key={item.objection} className="rounded-md border p-2">
										<p className="font-medium text-xs">{item.objection}</p>
										<p className="text-muted-foreground text-xs">
											{item.response}
										</p>
									</div>
								))}
							</div>
						) : null}
						<BriefList title="Open promises" items={brief.openPromises} />
						<BriefList title="Risks" items={brief.risks} />
						<Button
							variant="outline"
							size="sm"
							onClick={() => generate.mutate({ dealId })}
						>
							Regenerate
						</Button>
					</div>
				) : null}
			</DialogContent>
		</Dialog>
	);
}

function BriefList({ title, items }: { title: string; items: string[] }) {
	if (items.length === 0) return null;
	return (
		<div className="flex flex-col gap-1">
			<span className="font-medium">{title}</span>
			<ul className="list-disc pl-5">
				{items.map((item) => (
					<li key={item}>{item}</li>
				))}
			</ul>
		</div>
	);
}

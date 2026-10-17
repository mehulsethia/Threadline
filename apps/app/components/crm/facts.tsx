"use client";

import Checkmark from "@carbon/icons-react/es/Checkmark";
import Close from "@carbon/icons-react/es/Close";
import Information from "@carbon/icons-react/es/Information";
import { Badge } from "@crm/ui/components/badge";
import { Button } from "@crm/ui/components/button";
import { Icon } from "@crm/ui/components/icon";
import { Provenance } from "@crm/ui/components/sourced-value";
import { Suggestion } from "@crm/ui/components/suggestion";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { DetailSheetSection } from "@/components/detail-sheet";
import { LocalDateTime } from "@/components/local-date-time";
import type { ContactFact } from "@/lib/contact-facts";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";

export type GenericFact = {
	id: string;
	field: string;
	value: string;
	score: number;
	band: string;
	evidence: Array<{
		kind: string;
		detail: string;
		sourceUrl?: string;
		matchConfidence?: number;
		matchReasons?: string[];
	}>;
	method: string;
	sourceUrl?: string | null;
	status: string;
	observedAt: string;
};

/** A ledger quote and who said it. */
export type EvidenceDetail = { quote: string; speaker: "lead" | "us" };

export function parseEvidenceDetail(detail: string): EvidenceDetail {
	const quoteMatch = detail.match(/^"([^"]+)"\s*\(speaker:\s*(lead|us)\)/i);
	if (quoteMatch) {
		return {
			quote: quoteMatch[1] ?? detail,
			speaker: quoteMatch[2]?.toLowerCase() === "us" ? "us" : "lead",
		};
	}

	const speakerMatch = detail.match(/\(speaker:\s*(lead|us)\)/i);
	const speaker = speakerMatch?.[1]?.toLowerCase() === "us" ? "us" : "lead";
	const cleanQuote = detail.replace(/\(speaker:\s*(lead|us)\)/gi, "").trim();

	return {
		quote: cleanQuote.replace(/^"|"$/g, ""),
		speaker,
	};
}

export function EvidenceChip({
	quote,
	speaker,
	timestamp,
}: {
	quote: string;
	speaker?: "lead" | "us" | string;
	timestamp?: string;
}) {
	const isUs = speaker === "us";

	return (
		<div className="flex flex-wrap items-center gap-1.5 rounded-md border border-border/60 bg-muted/20 px-2 py-1 text-xs">
			<Badge
				variant={isUs ? "outline" : "secondary"}
				className="h-4 px-1.5 py-0 font-mono text-[10px] uppercase tracking-wider"
			>
				{isUs ? "us" : "lead"}
			</Badge>
			<span className="min-w-0 flex-1 break-words italic text-muted-foreground">
				"{quote}"
			</span>
			{timestamp ? (
				<span className="shrink-0 text-[10px] text-muted-foreground/70">
					<LocalDateTime
						date={timestamp}
						options={{
							month: "short",
							day: "numeric",
							hour: "numeric",
							minute: "2-digit",
						}}
					/>
				</span>
			) : null}
		</div>
	);
}

export function FactEvidenceChips({ fact }: { fact: GenericFact }) {
	if (!fact.evidence || fact.evidence.length === 0) return null;

	return (
		<div className="mt-1 flex flex-col gap-1">
			{fact.evidence.map((item) => {
				const parsed = parseEvidenceDetail(item.detail);
				return (
					<div
						key={`${fact.id}-${item.kind}-${item.detail}`}
						className="flex flex-wrap items-center gap-1.5"
					>
						<EvidenceChip
							quote={parsed.quote}
							speaker={parsed.speaker}
							timestamp={fact.observedAt}
						/>
						{item.matchConfidence !== undefined ? (
							<Badge
								variant="outline"
								className="h-4 px-1.5 py-0 font-mono text-[10px] text-success"
							>
								Match: {Math.round(item.matchConfidence * 100)}%
							</Badge>
						) : null}
					</div>
				);
			})}
		</div>
	);
}

export function FactProvenance({ fact }: { fact: ContactFact }) {
	return (
		<Provenance
			claim={fact.value}
			reasons={fact.evidence.map((item) => item.detail)}
			observedAt={
				<LocalDateTime
					date={fact.observedAt}
					options={{ month: "short", day: "numeric", year: "numeric" }}
				/>
			}
			sourceUrl={fact.sourceUrl}
		/>
	);
}

export function FactSuggestion({
	fact,
	contactId,
}: {
	fact: ContactFact;
	contactId: string;
}) {
	const trpc = useTRPC();
	const cache = useCrmCache();

	const decide = useMutation(
		trpc.contacts.decideFact.mutationOptions({
			onSuccess: (result) => {
				toast.success(
					result.applied
						? "Added to the record."
						: "Dismissed — it won't be suggested again.",
				);
				return cache.contact(contactId, { settle: "record" });
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	return (
		<div className="space-y-1">
			<Suggestion
				value={fact.value}
				rationale={fact.evidence.map((item) => item.detail).join(" · ")}
				pending={decide.isPending}
				onAccept={() => decide.mutate({ factId: fact.id, decision: "accept" })}
				onDismiss={() =>
					decide.mutate({ factId: fact.id, decision: "dismiss" })
				}
			/>
			<FactEvidenceChips fact={fact as GenericFact} />
		</div>
	);
}

export function DealFactSuggestion({
	fact,
	dealId,
}: {
	fact: GenericFact;
	dealId: string;
}) {
	const trpc = useTRPC();
	const cache = useCrmCache();

	const decide = useMutation(
		trpc.deals.decideFact.mutationOptions({
			onSuccess: (result) => {
				toast.success(
					result.applied
						? "Added to the record."
						: "Dismissed — it won't be suggested again.",
				);
				return cache.deal(dealId, { settle: "record" });
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	return (
		<div className="space-y-1">
			<Suggestion
				value={fact.value}
				rationale={fact.evidence.map((item) => item.detail).join(" · ")}
				pending={decide.isPending}
				onAccept={() => decide.mutate({ factId: fact.id, decision: "accept" })}
				onDismiss={() =>
					decide.mutate({ factId: fact.id, decision: "dismiss" })
				}
			/>
			<FactEvidenceChips fact={fact} />
		</div>
	);
}

const FIELD_LABELS = new Map<string, string>(
	Object.entries({
		need: "Requirement",
		leadBudget: "Lead budget",
		quotedValue: "Quoted value",
		timeline: "Timeline",
		stage: "Stage suggestion",
		language: "Language preference",
		sentiment: "Sentiment",
		objections: "Objection",
		objection: "Objection",
		nextStep: "Next step",
		possibleDuplicate: "Possible duplicate",
		competitors: "Competitors",
		decisionMakers: "Decision makers",
		companyProfile: "Company profile",
		companySize: "Company scale",
		companyNews: "Company news",
	}),
);

export function humanFieldLabel(field: string): string {
	return (
		FIELD_LABELS.get(field) ||
		field.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase())
	);
}

export function RecordFactsSection({
	facts,
	recordKind,
	recordId,
}: {
	facts: GenericFact[];
	recordKind: "contact" | "deal";
	recordId: string;
}) {
	const trpc = useTRPC();
	const cache = useCrmCache();

	const decideContact = useMutation(
		trpc.contacts.decideFact.mutationOptions({
			onSuccess: (result) => {
				toast.success(result.applied ? "Fact accepted." : "Fact dismissed.");
				return cache.contact(recordId, { settle: "record" });
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	const decideDeal = useMutation(
		trpc.deals.decideFact.mutationOptions({
			onSuccess: (result) => {
				toast.success(result.applied ? "Fact accepted." : "Fact dismissed.");
				return cache.deal(recordId, { settle: "record" });
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	const isPending = decideContact.isPending || decideDeal.isPending;

	const handleDecision = (factId: string, decision: "accept" | "dismiss") => {
		if (recordKind === "contact") {
			decideContact.mutate({ factId, decision });
		} else {
			decideDeal.mutate({ factId, decision });
		}
	};

	const proposed = facts.filter((f) => f.status === "PROPOSED");
	const applied = facts.filter((f) => f.status === "APPLIED");

	if (facts.length === 0) {
		return null;
	}

	return (
		<DetailSheetSection
			title="Conversation Facts & Evidence"
			action={
				<span className="text-xs text-muted-foreground">
					{applied.length} verified · {proposed.length} proposed
				</span>
			}
		>
			<div className="flex flex-col gap-3 py-1">
				{proposed.length > 0 ? (
					<div className="space-y-2">
						<div className="flex items-center gap-1.5 font-medium text-warning text-xs">
							<Icon icon={Information} className="size-3.5" />
							<span>Proposed Suggestions (Requires Approval)</span>
						</div>
						<div className="flex flex-col gap-2">
							{proposed.map((fact) => {
								const matchConfidence = fact.evidence?.find(
									(e) => e.matchConfidence !== undefined,
								)?.matchConfidence;

								return (
									<div
										key={fact.id}
										className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-2.5 text-xs"
									>
										<div className="flex items-start justify-between gap-2">
											<div className="min-w-0 flex-1">
												<div className="flex flex-wrap items-center gap-1.5">
													<span className="font-medium text-muted-foreground">
														{humanFieldLabel(fact.field)}:
													</span>
													{matchConfidence !== undefined ? (
														<Badge
															variant="outline"
															className="h-4 px-1.5 py-0 font-mono text-[10px] text-success"
														>
															Match: {Math.round(matchConfidence * 100)}%
														</Badge>
													) : null}
												</div>
												<span className="font-semibold text-foreground">
													{fact.value}
												</span>
											</div>
											<div className="flex shrink-0 items-center gap-1">
												<Button
													variant="ghost"
													size="icon-xs"
													disabled={isPending}
													onClick={() => handleDecision(fact.id, "accept")}
													aria-label="Accept suggestion"
													className="hover:bg-primary/10 hover:text-primary"
												>
													<Icon icon={Checkmark} />
												</Button>
												<Button
													variant="ghost"
													size="icon-xs"
													disabled={isPending}
													onClick={() => handleDecision(fact.id, "dismiss")}
													aria-label="Dismiss suggestion"
													className="hover:bg-destructive/10 hover:text-destructive"
												>
													<Icon icon={Close} />
												</Button>
											</div>
										</div>
										<FactEvidenceChips fact={fact} />
									</div>
								);
							})}
						</div>
					</div>
				) : null}

				{applied.length > 0 ? (
					<div className="space-y-2">
						<div className="flex items-center gap-1.5 font-medium text-xs text-foreground">
							<span>Verified Evidence Ledger</span>
						</div>
						<div className="flex flex-col gap-2">
							{applied.map((fact) => (
								<div
									key={fact.id}
									className="rounded-lg border border-border/80 bg-background/50 p-2.5 text-xs"
								>
									<div className="flex items-start justify-between gap-2">
										<div className="min-w-0 flex-1">
											<span className="font-medium text-muted-foreground">
												{humanFieldLabel(fact.field)}:
											</span>{" "}
											<span className="font-medium text-foreground">
												{fact.value}
											</span>
										</div>
										<Badge
											variant="mono"
											className="shrink-0 text-[10px] text-primary"
										>
											Verified
										</Badge>
									</div>
									<FactEvidenceChips fact={fact} />
								</div>
							))}
						</div>
					</div>
				) : null}
			</div>
		</DetailSheetSection>
	);
}

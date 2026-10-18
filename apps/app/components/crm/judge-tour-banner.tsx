"use client";

import ArrowRight from "@carbon/icons-react/es/ArrowRight";
import Close from "@carbon/icons-react/es/Close";
import Document from "@carbon/icons-react/es/Document";
import Phone from "@carbon/icons-react/es/Phone";
import Renew from "@carbon/icons-react/es/Renew";
import Upload from "@carbon/icons-react/es/Upload";
import { Badge } from "@crm/ui/components/badge";
import { Button } from "@crm/ui/components/button";
import Link from "next/link";
import { useState } from "react";
import { useOpenRecord } from "@/components/crm/record-sheet/record-stack";
import { useWorkspaceUrl } from "@/lib/use-workspace-url";

export function JudgeTourBanner() {
	const [dismissed, setDismissed] = useState(false);
	const workspaceUrl = useWorkspaceUrl();
	const openRecord = useOpenRecord();

	if (dismissed) {
		return (
			<div className="flex justify-end pb-2">
				<Button
					variant="outline"
					size="sm"
					className="h-7 text-xs gap-1.5"
					onClick={() => setDismissed(false)}
				>
					<span>✨</span>
					<span>Show Hackathon Evaluation Guide</span>
				</Button>
			</div>
		);
	}

	return (
		<div className="relative mb-4 rounded-xl border border-primary/20 bg-gradient-to-r from-primary/5 via-card to-background p-4 shadow-sm">
			<div className="flex items-start justify-between gap-4 mb-3">
				<div className="space-y-1">
					<div className="flex items-center gap-2">
						<Badge
							variant="outline"
							className="bg-primary/10 text-primary border-primary/30 font-medium text-xs px-2 py-0.5"
						>
							Hackathon Judge Guide
						</Badge>
						<span className="text-xs text-muted-foreground font-mono">
							Northwind Systems Demo Org
						</span>
					</div>
					<h3 className="text-sm font-semibold tracking-tight text-foreground">
						Threadline Agent Evaluation Tour
					</h3>
					<p className="text-xs text-muted-foreground max-w-3xl">
						Follow this sequence to evaluate Threadline's core agent workflows:
					</p>
				</div>
				<Button
					variant="ghost"
					size="icon"
					className="h-7 w-7 text-muted-foreground hover:text-foreground shrink-0"
					onClick={() => setDismissed(true)}
					aria-label="Dismiss guide"
				>
					<Close size={16} />
				</Button>
			</div>

			<div className="grid grid-cols-1 gap-3 pt-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
				<div className="flex flex-col justify-between rounded-lg border border-border/80 bg-background/80 p-3 shadow-2xs">
					<div className="space-y-1">
						<div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
							<Upload size={14} className="text-primary" />
							<span>1. Ingest Pipeline</span>
						</div>
						<p className="text-[11px] text-muted-foreground leading-snug">
							Import real transcripts with multi-speaker detection and line
							provenance.
						</p>
					</div>
					<div className="pt-2">
						<Link
							href={workspaceUrl("/settings/connections")}
							className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
						>
							<span>View Connections</span>
							<ArrowRight size={12} />
						</Link>
					</div>
				</div>

				<div className="flex flex-col justify-between rounded-lg border border-border/80 bg-background/80 p-3 shadow-2xs">
					<div className="space-y-1">
						<div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
							<Document size={14} className="text-primary" />
							<span>2. Evidence Ledger</span>
						</div>
						<p className="text-[11px] text-muted-foreground leading-snug">
							Inspect grounded facts, confidence scores, and verbatim quoted
							evidence.
						</p>
					</div>
					<div className="pt-2">
						<button
							type="button"
							onClick={() =>
								openRecord({
									kind: "deal",
									id: "demo-deal-1-acme",
								})
							}
							className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline cursor-pointer"
						>
							<span>Open Acme Cloud</span>
							<ArrowRight size={12} />
						</button>
					</div>
				</div>

				<div className="flex flex-col justify-between rounded-lg border border-border/80 bg-background/80 p-3 shadow-2xs">
					<div className="space-y-1">
						<div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
							<Renew size={14} className="text-primary" />
							<span>3. Lead Revival</span>
						</div>
						<p className="text-[11px] text-muted-foreground leading-snug">
							Review AI drafts in native languages with rep sign-off and quiet
							periods.
						</p>
					</div>
					<div className="pt-2">
						<Link
							href={workspaceUrl("/revival")}
							className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
						>
							<span>Open Revival Queue</span>
							<ArrowRight size={12} />
						</Link>
					</div>
				</div>

				<div className="flex flex-col justify-between rounded-lg border border-border/80 bg-background/80 p-3 shadow-2xs">
					<div className="space-y-1">
						<div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
							<span>💬</span>
							<span>4. Slack Alerts</span>
						</div>
						<p className="text-[11px] text-muted-foreground leading-snug">
							Interactive Block Kit cards with real-time rep approval in Slack.
						</p>
					</div>
					<div className="pt-2">
						<Link
							href={workspaceUrl("/settings/connections")}
							className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
						>
							<span>Slack Integration</span>
							<ArrowRight size={12} />
						</Link>
					</div>
				</div>

				<div className="flex flex-col justify-between rounded-lg border border-border/80 bg-background/80 p-3 shadow-2xs">
					<div className="space-y-1">
						<div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
							<Phone size={14} className="text-primary" />
							<span>5. Voice Qualifier</span>
						</div>
						<p className="text-[11px] text-muted-foreground leading-snug">
							Bidirectional Gemini Live voice session with real-time BANT
							checklist.
						</p>
					</div>
					<div className="pt-2">
						<button
							type="button"
							onClick={() =>
								openRecord({
									kind: "deal",
									id: "demo-deal-1-acme",
								})
							}
							className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline cursor-pointer"
						>
							<span>Try Voice Call</span>
							<ArrowRight size={12} />
						</button>
					</div>
				</div>
			</div>
		</div>
	);
}

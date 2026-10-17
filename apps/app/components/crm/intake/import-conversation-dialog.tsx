"use client";

import Checkmark from "@carbon/icons-react/es/Checkmark";
import Close from "@carbon/icons-react/es/Close";
import Document from "@carbon/icons-react/es/Document";
import Partnership from "@carbon/icons-react/es/Partnership";
import Upload from "@carbon/icons-react/es/Upload";
import UserAvatar from "@carbon/icons-react/es/UserAvatar";
import { Badge } from "@crm/ui/components/badge";
import { Button } from "@crm/ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@crm/ui/components/dialog";
import { Icon } from "@crm/ui/components/icon";
import { Input } from "@crm/ui/components/input";
import { Label } from "@crm/ui/components/label";
import { Spinner } from "@crm/ui/components/spinner";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { useOpenRecord } from "@/components/crm/record-sheet/record-stack";
import { LocalDateTime } from "@/components/local-date-time";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";

type Step = "upload" | "preview" | "processing" | "result";

const TOOL_TITLES = new Map<string, string>(
	Object.entries({
		intake_agent: "Starting intake agent",
		load_intake_job: "Loading conversation file",
		parse_whatsapp_export: "Parsing WhatsApp messages",
		transcribe_audio: "Transcribing audio recording",
		extract_lead_facts: "Extracting lead facts & quotes",
		find_matching_contact: "Checking existing contacts",
		upsert_company: "Resolving company",
		upsert_contact: "Creating or updating contact",
		upsert_deal: "Setting up deal & budget",
		record_fact: "Recording fact to evidence ledger",
		store_messages: "Storing conversation history",
		log_activity: "Logging timeline activity",
		create_task: "Scheduling follow-up task",
		finish_job: "Finalizing intake",
		agent_thinking: "Agent reasoning",
	}),
);

export function ImportConversationDialog() {
	const [open, setOpen] = useState(false);
	const [step, setStep] = useState<Step>("upload");
	const [uploading, setUploading] = useState(false);
	const [dragOver, setDragOver] = useState(false);
	const [file, setFile] = useState<File | null>(null);
	const [jobId, setJobId] = useState<string | null>(null);
	const [sourceType, setSourceType] = useState<string>("WHATSAPP_EXPORT");
	const [participants, setParticipants] = useState<string[]>([]);
	const [selectedMe, setSelectedMe] = useState<string>("");
	const [selectedChoice, setSelectedChoice] = useState<string>("");
	const [autoDetectedMe, setAutoDetectedMe] = useState<string | null>(null);
	const [confidence, setConfidence] = useState<number>(0);
	const [customMe, setCustomMe] = useState<string>("");

	const fileInputRef = useRef<HTMLInputElement>(null);
	const trpc = useTRPC();
	const cache = useCrmCache();
	const openRecord = useOpenRecord();

	const statusQuery = useQuery({
		...trpc.intake.status.queryOptions(
			{ jobId: jobId ?? "" },
			{
				enabled: Boolean(jobId && (step === "processing" || step === "result")),
			},
		),
		refetchInterval: (query) => {
			if (step !== "processing") return false;
			const st = query.state.data?.status;
			return st === "DONE" || st === "FAILED" ? false : 1500;
		},
	});

	const startMutation = useMutation(
		trpc.intake.start.mutationOptions({
			onSuccess: () => {
				setStep("processing");
			},
			onError: (err) => {
				toast.error(err.message);
			},
		}),
	);

	const reset = () => {
		setStep("upload");
		setUploading(false);
		setDragOver(false);
		setFile(null);
		setJobId(null);
		setSourceType("WHATSAPP_EXPORT");
		setParticipants([]);
		setSelectedMe("");
		setSelectedChoice("");
		setAutoDetectedMe(null);
		setConfidence(0);
		setCustomMe("");
	};

	const handleFileChosen = async (chosenFile: File) => {
		setFile(chosenFile);
		setUploading(true);

		try {
			const formData = new FormData();
			formData.append("file", chosenFile);
			formData.append("autoStart", "false");

			const res = await fetch("/api/intake/upload", {
				method: "POST",
				body: formData,
			});

			if (!res.ok) {
				const errData = await res.json().catch(() => ({}));
				throw new Error(errData.message || "Failed to upload file");
			}

			const data = (await res.json()) as {
				jobId: string;
				status: string;
				sourceType: string;
				fileUrl: string;
			};

			setJobId(data.jobId);
			setSourceType(data.sourceType);

			if (data.sourceType === "WHATSAPP_EXPORT") {
				const previewRes = await fetch(
					`/api/trpc/intake.previewParticipants?input=${encodeURIComponent(
						JSON.stringify({ jobId: data.jobId }),
					)}`,
				);
				const previewJson = await previewRes.json();
				const preview = previewJson?.result?.data?.json;

				if (preview && preview.participants?.length > 0) {
					setParticipants(preview.participants);
					const initialMe = preview.autoDetected
						? preview.me
						: preview.participants[0] || "";
					setSelectedMe(initialMe);
					setSelectedChoice(initialMe);
					setAutoDetectedMe(preview.autoDetected ? preview.me : null);
					setConfidence(preview.confidence || 0);
					setStep("preview");
				} else {
					setSelectedChoice("someone_else");
					setStep("preview");
				}
			} else {
				setSelectedChoice("someone_else");
				setStep("preview");
			}
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Upload error");
			setFile(null);
		} finally {
			setUploading(false);
		}
	};

	const handleDrop = (e: React.DragEvent<HTMLElement>) => {
		e.preventDefault();
		setDragOver(false);
		const dropped = e.dataTransfer.files[0];
		if (dropped) {
			handleFileChosen(dropped);
		}
	};

	const handleStart = () => {
		if (!jobId) return;
		const me =
			selectedChoice === "someone_else"
				? customMe.trim() || undefined
				: selectedChoice || selectedMe || undefined;
		startMutation.mutate({ jobId, me });
	};

	const statusData = statusQuery.data;
	const isCompleted = statusData?.status === "DONE";
	const isFailed = statusData?.status === "FAILED";

	if (step === "processing" && isCompleted) {
		setStep("result");
		void cache.everything();
	}

	const createdContactId = statusData?.createdContactIds?.[0];
	const createdDealId = statusData?.createdDealIds?.[0];

	const timelineEvents = statusData?.timeline ?? [];
	const factsApplied = timelineEvents.filter(
		(ev) => ev.tool === "record_fact" && ev.message.includes("as APPLIED"),
	).length;
	const factsSuggested = timelineEvents.filter(
		(ev) => ev.tool === "record_fact" && ev.message.includes("as PROPOSED"),
	).length;
	const tasksCreated = timelineEvents.filter(
		(ev) => ev.tool === "create_task",
	).length;

	return (
		<Dialog
			open={open}
			onOpenChange={(next) => {
				setOpen(next);
				if (!next) reset();
			}}
		>
			<DialogTrigger asChild>
				<Button
					variant="outline"
					size="sm"
					className="h-8 gap-1.5 border-primary/20 bg-primary/5 text-primary hover:bg-primary/10 hover:text-primary dark:border-primary/30"
				>
					<Icon icon={Upload} className="size-3.5" />
					<span className="hidden sm:inline">Import conversation</span>
					<span className="sm:hidden">Import</span>
				</Button>
			</DialogTrigger>

			<DialogContent className="max-w-md sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>Import conversation</DialogTitle>
					<DialogDescription>
						{step === "upload" &&
							"Upload WhatsApp chat export (.txt/.zip) or voice recording (.opus/.m4a/.mp3/.wav)."}
						{step === "preview" &&
							"Identify which participant is you so Threadline extracts lead details for the other person."}
						{step === "processing" &&
							"Autonomous agent is extracting lead facts, verifying evidence, and creating CRM records."}
						{step === "result" &&
							"Conversation imported and synced to evidence ledger."}
					</DialogDescription>
				</DialogHeader>

				{step === "upload" && (
					<div className="space-y-4 py-2">
						<input
							ref={fileInputRef}
							type="file"
							accept=".txt,.zip,.opus,.m4a,.mp3,.wav"
							className="hidden"
							onChange={(e) => {
								const selected = e.target.files?.[0];
								if (selected) handleFileChosen(selected);
							}}
						/>
						<button
							type="button"
							onDragOver={(e) => {
								e.preventDefault();
								setDragOver(true);
							}}
							onDragLeave={() => setDragOver(false)}
							onDrop={handleDrop}
							onClick={() => fileInputRef.current?.click()}
							className={`flex w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-8 text-center transition-colors ${
								dragOver
									? "border-primary bg-primary/5"
									: "border-border hover:border-primary/50 hover:bg-muted/30"
							}`}
						>
							{uploading ? (
								<div className="flex flex-col items-center gap-2">
									<Spinner className="size-6 text-primary" />
									<p className="font-medium text-xs">Uploading {file?.name}…</p>
								</div>
							) : (
								<>
									<div className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
										<Icon icon={Upload} className="size-5" />
									</div>
									<div>
										<p className="font-medium text-xs">
											Drop your export or recording here
										</p>
										<p className="text-[11px] text-muted-foreground">
											or click to browse files from your computer
										</p>
									</div>
									<div className="flex flex-wrap items-center justify-center gap-1 pt-1">
										<Badge variant="mono" className="text-[10px]">
											.txt
										</Badge>
										<Badge variant="mono" className="text-[10px]">
											.zip
										</Badge>
										<Badge variant="mono" className="text-[10px]">
											.opus
										</Badge>
										<Badge variant="mono" className="text-[10px]">
											.m4a
										</Badge>
										<Badge variant="mono" className="text-[10px]">
											.mp3
										</Badge>
										<Badge variant="mono" className="text-[10px]">
											.wav
										</Badge>
									</div>
								</>
							)}
						</button>
					</div>
				)}

				{step === "preview" && (
					<div className="space-y-4 py-2">
						<div className="rounded-md border bg-muted/20 p-2.5 text-xs">
							<div className="flex items-center gap-2">
								<Icon
									icon={Document}
									className="size-4 text-muted-foreground"
								/>
								<span className="font-medium truncate">{file?.name}</span>
								<Badge variant="mono" className="ml-auto text-[10px]">
									{sourceType === "WHATSAPP_EXPORT"
										? "WhatsApp Chat"
										: "Audio Recording"}
								</Badge>
							</div>
						</div>

						{participants.length > 0 ? (
							<div className="space-y-3">
								<Label className="font-medium text-xs">
									Which participant is you?
								</Label>
								<div className="space-y-2">
									{participants.map((person) => {
										const isSelected = selectedChoice === person;
										const isDetected = autoDetectedMe === person;

										return (
											<label
												key={person}
												className={`flex cursor-pointer items-center justify-between rounded-lg border p-3 text-left text-xs transition-colors ${
													isSelected
														? "border-primary bg-primary/5 font-medium"
														: "border-border hover:bg-muted/40"
												}`}
											>
												<div className="flex items-center gap-2.5">
													<input
														type="radio"
														name="participant-me-choice"
														value={person}
														checked={isSelected}
														onChange={() => {
															setSelectedChoice(person);
															setSelectedMe(person);
														}}
														className="size-4 text-primary"
													/>
													<span className="text-foreground">{person}</span>
												</div>
												{isDetected ? (
													<Badge
														variant="secondary"
														className="text-[10px] text-primary"
													>
														Auto-detected (
														{Math.round((confidence || 0.8) * 100)}%)
													</Badge>
												) : null}
											</label>
										);
									})}

									<label
										className={`flex cursor-pointer flex-col gap-2 rounded-lg border p-3 text-left text-xs transition-colors ${
											selectedChoice === "someone_else"
												? "border-primary bg-primary/5"
												: "border-border hover:bg-muted/40"
										}`}
									>
										<div className="flex items-center gap-2.5">
											<input
												type="radio"
												name="participant-me-choice"
												value="someone_else"
												checked={selectedChoice === "someone_else"}
												onChange={() => setSelectedChoice("someone_else")}
												className="size-4 text-primary"
											/>
											<span className="font-medium text-foreground">
												Someone else
											</span>
										</div>
										{selectedChoice === "someone_else" && (
											<Input
												id="custom-me-input"
												placeholder="Enter your name / sender handle"
												value={customMe}
												onChange={(e) => setCustomMe(e.target.value)}
												className="mt-1 text-xs"
												autoFocus
											/>
										)}
									</label>
								</div>
							</div>
						) : (
							<div className="space-y-2">
								<Label
									htmlFor="custom-me-input"
									className="font-medium text-xs"
								>
									Your name / sender (optional)
								</Label>
								<Input
									id="custom-me-input"
									placeholder="e.g. Sales Rep Name"
									value={customMe}
									onChange={(e) => setCustomMe(e.target.value)}
									className="text-xs"
								/>
							</div>
						)}

						<DialogFooter className="gap-2 pt-2">
							<Button variant="ghost" size="sm" onClick={reset}>
								Back
							</Button>
							<Button
								size="sm"
								disabled={startMutation.isPending}
								onClick={handleStart}
								className="gap-1.5"
							>
								{startMutation.isPending ? (
									<Spinner className="size-3" />
								) : null}
								Start Import
							</Button>
						</DialogFooter>
					</div>
				)}

				{step === "processing" && (
					<div className="space-y-4 py-2">
						<div className="flex items-center gap-3 rounded-lg border bg-muted/20 p-3 text-xs">
							<Spinner className="size-4 shrink-0 text-primary" />
							<div>
								<p className="font-medium">Processing conversation…</p>
								<p className="text-muted-foreground">
									Multimodal Gemini is extracting identity, facts, and
									objections.
								</p>
							</div>
						</div>

						<div className="max-h-60 overflow-y-auto rounded-lg border bg-background/50 p-3 text-xs">
							<p className="mb-2 font-medium text-[11px] text-muted-foreground uppercase tracking-wider">
								Agent Step Timeline
							</p>
							<div className="space-y-2.5">
								{(statusData?.timeline ?? []).map((ev) => (
									<div key={ev.id} className="flex items-start gap-2 text-xs">
										<div className="mt-0.5 flex size-3.5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
											<Icon icon={Checkmark} className="size-2.5" />
										</div>
										<div className="min-w-0 flex-1">
											<p className="font-medium text-foreground">
												{TOOL_TITLES.get(ev.tool) || ev.tool}
											</p>
											<p className="text-muted-foreground text-[11px] break-words">
												{ev.message}
											</p>
										</div>
										<span className="shrink-0 text-[10px] text-muted-foreground/60">
											<LocalDateTime
												date={ev.timestamp}
												options={{
													hour: "numeric",
													minute: "2-digit",
													second: "2-digit",
												}}
											/>
										</span>
									</div>
								))}

								{(!statusData?.timeline ||
									statusData.timeline.length === 0) && (
									<p className="text-muted-foreground text-xs italic">
										Agent is picking up task from queue…
									</p>
								)}
							</div>
						</div>
					</div>
				)}

				{step === "result" && (
					<div className="space-y-4 py-2">
						<div className="flex items-center gap-2.5 rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs text-primary">
							<div className="flex size-6 items-center justify-center rounded-full bg-primary text-primary-foreground">
								<Icon icon={Checkmark} className="size-3.5" />
							</div>
							<div>
								<p className="font-semibold text-foreground">
									Conversation imported successfully!
								</p>
								<p className="text-muted-foreground text-[11px]">
									Lead facts and quotes were written to the evidence ledger.
								</p>
							</div>
						</div>

						<div className="grid grid-cols-2 gap-2 text-xs">
							{createdContactId ? (
								<button
									type="button"
									onClick={() => {
										setOpen(false);
										openRecord({ kind: "contact", id: createdContactId });
									}}
									className="flex flex-col items-start gap-1 rounded-lg border p-3 text-left transition-colors hover:border-primary/50 hover:bg-muted/30"
								>
									<div className="flex items-center gap-1.5 text-muted-foreground">
										<Icon icon={UserAvatar} className="size-3.5" />
										<span className="text-[11px]">Contact Record</span>
									</div>
									<span className="font-medium text-foreground underline-offset-2 hover:underline">
										View Contact
									</span>
								</button>
							) : null}

							{createdDealId ? (
								<button
									type="button"
									onClick={() => {
										setOpen(false);
										openRecord({ kind: "deal", id: createdDealId });
									}}
									className="flex flex-col items-start gap-1 rounded-lg border p-3 text-left transition-colors hover:border-primary/50 hover:bg-muted/30"
								>
									<div className="flex items-center gap-1.5 text-muted-foreground">
										<Icon icon={Partnership} className="size-3.5" />
										<span className="text-[11px]">Deal Record</span>
									</div>
									<span className="font-medium text-foreground underline-offset-2 hover:underline">
										View Deal
									</span>
								</button>
							) : null}
						</div>

						<div className="rounded-lg border bg-muted/20 p-3 text-xs">
							<p className="mb-2 font-medium text-[11px] text-muted-foreground uppercase tracking-wider">
								Imported Summary
							</p>
							<div className="grid grid-cols-3 gap-2">
								<div className="rounded border bg-background/60 p-2 text-center">
									<p className="font-semibold text-foreground text-sm">
										{statusData?.createdContactIds?.length || 0}
									</p>
									<p className="text-[10px] text-muted-foreground">Contacts</p>
								</div>
								<div className="rounded border bg-background/60 p-2 text-center">
									<p className="font-semibold text-foreground text-sm">
										{statusData?.createdDealIds?.length || 0}
									</p>
									<p className="text-[10px] text-muted-foreground">Deals</p>
								</div>
								<div className="rounded border bg-background/60 p-2 text-center">
									<p className="font-semibold text-foreground text-sm">
										{tasksCreated}
									</p>
									<p className="text-[10px] text-muted-foreground">
										Tasks Created
									</p>
								</div>
								<div className="col-span-1 rounded border bg-background/60 p-2 text-center">
									<p className="font-semibold text-primary text-sm">
										{factsApplied}
									</p>
									<p className="text-[10px] text-muted-foreground">
										Facts Applied
									</p>
								</div>
								<div className="col-span-2 rounded border bg-background/60 p-2 text-center">
									<p className="font-semibold text-muted-foreground text-sm">
										{factsSuggested}
									</p>
									<p className="text-[10px] text-muted-foreground">
										Facts Suggested
									</p>
								</div>
							</div>
						</div>

						<details className="group rounded-lg border bg-background/50 p-3 text-xs">
							<summary className="flex cursor-pointer select-none items-center justify-between font-medium text-[11px] text-muted-foreground uppercase tracking-wider">
								<span>Agent Step Timeline ({timelineEvents.length} steps)</span>
								<span className="text-[10px] text-primary group-open:hidden">
									Expand
								</span>
								<span className="hidden text-[10px] text-primary group-open:inline">
									Collapse
								</span>
							</summary>
							<div className="mt-3 max-h-52 space-y-2.5 overflow-y-auto border-t pt-2.5">
								{timelineEvents.map((ev) => (
									<div key={ev.id} className="flex items-start gap-2 text-xs">
										<div className="mt-0.5 flex size-3.5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
											<Icon icon={Checkmark} className="size-2.5" />
										</div>
										<div className="min-w-0 flex-1">
											<p className="font-medium text-foreground">
												{TOOL_TITLES.get(ev.tool) || ev.tool}
											</p>
											<p className="text-muted-foreground text-[11px] break-words">
												{ev.message}
											</p>
										</div>
										<span className="shrink-0 text-[10px] text-muted-foreground/60">
											<LocalDateTime
												date={ev.timestamp}
												options={{
													hour: "numeric",
													minute: "2-digit",
													second: "2-digit",
												}}
											/>
										</span>
									</div>
								))}
							</div>
						</details>

						<DialogFooter className="gap-2 pt-2">
							<Button variant="ghost" size="sm" onClick={reset}>
								Import Another
							</Button>
							<Button size="sm" onClick={() => setOpen(false)}>
								Done
							</Button>
						</DialogFooter>
					</div>
				)}

				{isFailed && (
					<div className="space-y-4 py-2">
						<div className="flex items-center gap-2.5 rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-xs text-destructive">
							<Icon icon={Close} className="size-4 shrink-0" />
							<div>
								<p className="font-semibold">Import failed</p>
								<p className="text-[11px] text-muted-foreground">
									{statusData?.error || "An error occurred during intake."}
								</p>
							</div>
						</div>
						<DialogFooter>
							<Button variant="outline" size="sm" onClick={reset}>
								Try Again
							</Button>
						</DialogFooter>
					</div>
				)}
			</DialogContent>
		</Dialog>
	);
}

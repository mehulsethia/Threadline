"use client";

import CheckmarkFilled from "@carbon/icons-react/es/CheckmarkFilled";
import Microphone from "@carbon/icons-react/es/Microphone";
import MicrophoneOff from "@carbon/icons-react/es/MicrophoneOff";
import PhoneOff from "@carbon/icons-react/es/PhoneOff";
import PhoneVoice from "@carbon/icons-react/es/PhoneVoice";
import Renew from "@carbon/icons-react/es/Renew";
import { Badge } from "@crm/ui/components/badge";
import { Button } from "@crm/ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@crm/ui/components/dialog";
import { Icon } from "@crm/ui/components/icon";
import { jsonText } from "@crm/validation/json-text";
import { useMutation, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";
import { useWorkspaceUrl } from "@/lib/use-workspace-url";
import {
	createMicGate,
	createPlaybackQueue,
	encodePcm16Base64,
	type PlaybackQueue,
	VOICE_CALL,
} from "@/lib/voice-audio";
import { warmApi } from "@/lib/warm-api";

/** What the call socket sends; unknown fields are ignored. */
const serverMessage = z.object({
	type: z.string(),
	pcm: z.string().optional(),
	role: z.enum(["assistant", "user"]).optional(),
	text: z.string().optional(),
	category: z.string().optional(),
	fact: z.string().optional(),
	quote: z.string().optional(),
	proposedScore: z.number().optional(),
	proposedStage: z.string().nullable().optional(),
	reason: z.string().optional(),
	message: z.string().optional(),
});

interface VoiceQualifierModalProps {
	dealId: string;
	dealName: string;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

interface TranscriptItem {
	id: string;
	role: "assistant" | "user";
	text: string;
	timestamp: string;
}

interface RecordedFact {
	category: string;
	fact: string;
	quote: string;
	proposedScore?: number;
	proposedStage?: string | null;
}

const BANT_CATEGORIES = [
	{ key: "need", label: "Pain / Need" },
	{ key: "budget", label: "Budget" },
	{ key: "authority", label: "Decision Authority" },
	{ key: "timeline", label: "Target Timeline" },
	{ key: "competitors", label: "Competitors" },
	{ key: "decision_process", label: "Decision Process" },
] as const;

export function VoiceQualifierModal({
	dealId,
	dealName,
	open,
	onOpenChange,
}: VoiceQualifierModalProps) {
	const trpc = useTRPC();
	const cache = useCrmCache();
	const workspaceUrl = useWorkspaceUrl();

	const [status, setStatus] = useState<
		"idle" | "connecting" | "in_call" | "ended" | "error"
	>("idle");
	const [activeSpeaker, setActiveSpeaker] = useState<
		"assistant" | "user" | null
	>(null);
	const [muted, setMuted] = useState(false);
	const [seconds, setSeconds] = useState(0);
	const [transcripts, setTranscripts] = useState<TranscriptItem[]>([]);
	const [recordedFacts, setRecordedFacts] = useState<RecordedFact[]>([]);
	const [proposedScore, setProposedScore] = useState<number>(0);
	const [proposedStage, setProposedStage] = useState<string | null>(null);
	const [fallbackMode, setFallbackMode] = useState(false);
	const [callError, setCallError] = useState<string | null>(null);
	const [recordingFallback, setRecordingFallback] = useState(false);

	const wsRef = useRef<WebSocket | null>(null);
	// Socket handlers outlive renders, so they read the live status here.
	const statusRef = useRef(status);
	statusRef.current = status;
	const connectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const playbackRef = useRef<PlaybackQueue | null>(null);
	const inputCtxRef = useRef<AudioContext | null>(null);
	const mutedRef = useRef(muted);
	mutedRef.current = muted;
	const openTurnRef = useRef<"assistant" | "user" | null>(null);
	const micStreamRef = useRef<MediaStream | null>(null);
	const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
	const transcriptEndRef = useRef<HTMLDivElement | null>(null);
	const mediaRecorderRef = useRef<MediaRecorder | null>(null);
	const recordedChunksRef = useRef<Blob[]>([]);

	const contextQuery = useQuery(
		trpc.voice.dealContext.queryOptions({ dealId }, { enabled: open }),
	);

	const liveTicketMutation = useMutation(
		trpc.voice.liveTicket.mutationOptions(),
	);

	useEffect(() => {
		if (contextQuery.data) {
			setProposedScore(contextQuery.data.qualificationScore);
			setProposedStage(contextQuery.data.proposedStage);
		}
	}, [contextQuery.data]);

	useEffect(() => {
		if (open) warmApi();
	}, [open]);

	const releaseCall = useCallback(() => {
		if (connectTimerRef.current) {
			clearTimeout(connectTimerRef.current);
			connectTimerRef.current = null;
		}

		if (wsRef.current) {
			const ws = wsRef.current;
			wsRef.current = null;
			ws.onclose = null;
			ws.onerror = null;
			if (ws.readyState === WebSocket.OPEN) {
				ws.send(JSON.stringify({ type: "end_call" }));
			}
			ws.close();
		}

		if (scriptProcessorRef.current) {
			scriptProcessorRef.current.disconnect();
			scriptProcessorRef.current = null;
		}

		if (micStreamRef.current) {
			for (const track of micStreamRef.current.getTracks()) {
				track.stop();
			}
			micStreamRef.current = null;
		}

		if (inputCtxRef.current) {
			void inputCtxRef.current.close();
			inputCtxRef.current = null;
		}

		if (playbackRef.current) {
			playbackRef.current.close();
			playbackRef.current = null;
		}

		openTurnRef.current = null;
		setActiveSpeaker(null);
	}, []);

	const endCall = useCallback(() => {
		releaseCall();
		setStatus("ended");
		void cache.deal(dealId, { settle: "record" });
	}, [dealId, cache, releaseCall]);

	const failCall = useCallback(
		(message: string) => {
			releaseCall();
			setCallError(message);
			setStatus("error");
		},
		[releaseCall],
	);

	useEffect(() => {
		let timer: NodeJS.Timeout | null = null;
		if (status === "in_call") {
			timer = setInterval(() => {
				setSeconds((s) => {
					if (s >= VOICE_CALL.maxCallSeconds) {
						endCall();
						return VOICE_CALL.maxCallSeconds;
					}
					return s + 1;
				});
			}, 1000);
		}
		return () => {
			if (timer) clearInterval(timer);
		};
	}, [status, endCall]);

	useEffect(() => {
		if (transcripts.length > 0) {
			transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
		}
	}, [transcripts]);

	const appendTranscript = useCallback(
		(role: "assistant" | "user", text: string) => {
			const continues = openTurnRef.current === role;
			openTurnRef.current = role;
			setTranscripts((prev) => {
				const last = prev.at(-1);
				if (continues && last?.role === role) {
					return [...prev.slice(0, -1), { ...last, text: last.text + text }];
				}
				return [
					...prev,
					{
						id: Math.random().toString(36).slice(2),
						role,
						text: text.trimStart(),
						timestamp: new Date().toLocaleTimeString([], {
							hour: "2-digit",
							minute: "2-digit",
							second: "2-digit",
						}),
					},
				];
			});
		},
		[],
	);

	const startCall = useCallback(async () => {
		try {
			releaseCall();
			setCallError(null);
			setStatus("connecting");
			setTranscripts([]);
			setRecordedFacts([]);
			setSeconds(0);

			playbackRef.current = createPlaybackQueue((speaking) =>
				setActiveSpeaker(speaking ? "assistant" : null),
			);

			const stream = await navigator.mediaDevices.getUserMedia({
				audio: {
					channelCount: 1,
					sampleRate: VOICE_CALL.input.sampleRate,
					echoCancellation: true,
					noiseSuppression: true,
					autoGainControl: true,
				},
			});
			micStreamRef.current = stream;

			// A one-minute ticket from the signed-in session opens the socket on
			// the API host; no credential beyond it reaches the browser.
			const { ticket, wsUrl } = await liveTicketMutation.mutateAsync({
				dealId,
			});
			const socketUrl = new URL(wsUrl);
			socketUrl.searchParams.set("dealId", dealId);
			socketUrl.searchParams.set("ticket", ticket);

			const ws = new WebSocket(socketUrl);
			wsRef.current = ws;

			connectTimerRef.current = setTimeout(() => {
				if (statusRef.current === "connecting") {
					failCall("The call service took too long to answer.");
				}
			}, VOICE_CALL.connectTimeoutMs);

			// The socket opening is not enough: the call is live once the API
			// reports the Gemini Live session ready, so audio is never dropped.
			const startStreaming = () => {
				if (connectTimerRef.current) {
					clearTimeout(connectTimerRef.current);
					connectTimerRef.current = null;
				}
				setStatus("in_call");
				toast.success("Voice qualification call active.");

				const inputCtx = new AudioContext({
					sampleRate: VOICE_CALL.input.sampleRate,
				});
				inputCtxRef.current = inputCtx;
				const sourceNode = inputCtx.createMediaStreamSource(stream);
				const processor = inputCtx.createScriptProcessor(
					VOICE_CALL.input.frameSize,
					1,
					1,
				);
				scriptProcessorRef.current = processor;

				const gate = createMicGate();
				processor.onaudioprocess = (e) => {
					if (mutedRef.current || ws.readyState !== WebSocket.OPEN) return;
					const frames = gate.accept(
						e.inputBuffer.getChannelData(0),
						playbackRef.current,
					);
					for (const frame of frames) {
						ws.send(
							JSON.stringify({ type: "audio", pcm: encodePcm16Base64(frame) }),
						);
					}
				};

				sourceNode.connect(processor);
				processor.connect(inputCtx.destination);
			};

			ws.onmessage = (event) => {
				try {
					const parsed = jsonText
						.pipe(serverMessage)
						.safeParse(String(event.data));
					if (!parsed.success) return;
					const msg = parsed.data;

					if (msg.type === "ready") {
						startStreaming();
					} else if (msg.type === "audio" && msg.pcm) {
						playbackRef.current?.play(msg.pcm);
					} else if (msg.type === "interrupted") {
						playbackRef.current?.flush();
						openTurnRef.current = null;
					} else if (msg.type === "turn_complete") {
						openTurnRef.current = null;
					} else if (msg.type === "transcript" && msg.text) {
						appendTranscript(msg.role || "assistant", msg.text);
					} else if (msg.type === "fact_proposed" && msg.category && msg.fact) {
						setRecordedFacts((prev) => [
							...prev,
							{
								category: msg.category || "qualification",
								fact: msg.fact || "",
								quote: msg.quote || "",
								proposedScore: msg.proposedScore,
								proposedStage: msg.proposedStage,
							},
						]);
						if (msg.proposedScore !== undefined) {
							setProposedScore(msg.proposedScore);
						}
						if (msg.proposedStage) {
							setProposedStage(msg.proposedStage);
						}
						toast.info(
							`Fact Proposed: ${msg.category.toUpperCase()} — ${msg.fact}`,
						);
						void cache.deal(dealId, { settle: "record" });
					} else if (msg.type === "call_ended") {
						endCall();
						toast.success("Voice qualification call ended.");
					} else if (msg.type === "error") {
						if (statusRef.current === "connecting") {
							failCall(msg.message || "The call could not be started.");
						} else {
							toast.error(`Call error: ${msg.message}`);
						}
					}
				} catch (err) {
					console.error("Error reading live socket payload", err);
				}
			};

			ws.onerror = () => {
				if (statusRef.current === "connecting") {
					failCall("Could not reach the call service.");
				}
			};

			ws.onclose = () => {
				if (statusRef.current === "connecting") {
					failCall("The call service closed the connection.");
				} else if (statusRef.current === "in_call") {
					endCall();
				}
			};
		} catch (err) {
			console.error("Could not start the live call", err);
			failCall(
				err instanceof DOMException && err.name === "NotAllowedError"
					? "Microphone access was denied."
					: "Could not start the live call.",
			);
		}
	}, [
		dealId,
		appendTranscript,
		cache,
		endCall,
		failCall,
		releaseCall,
		liveTicketMutation,
	]);

	const transcribeMutation = useMutation(
		trpc.voice.transcribeQualify.mutationOptions({
			onSuccess: (data) => {
				toast.success(
					"Voice recording transcribed and qualification facts proposed!",
				);
				setProposedScore(data.proposedScore);
				setProposedStage(data.proposedStage);
				setRecordedFacts(
					data.recordedFacts.map((f) => ({
						category: f.category,
						fact: f.fact,
						quote: f.quote,
					})),
				);
				void cache.deal(dealId, { settle: "record" });
				setRecordingFallback(false);
			},
			onError: (err) => {
				toast.error(err.message);
				setRecordingFallback(false);
			},
		}),
	);

	const startFallbackRecording = async () => {
		try {
			const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
			const mediaRecorder = new MediaRecorder(stream);
			mediaRecorderRef.current = mediaRecorder;
			recordedChunksRef.current = [];

			mediaRecorder.ondataavailable = (e) => {
				if (e.data.size > 0) {
					recordedChunksRef.current.push(e.data);
				}
			};

			mediaRecorder.onstop = async () => {
				for (const track of stream.getTracks()) track.stop();
				const blob = new Blob(recordedChunksRef.current, {
					type: "audio/webm",
				});
				const reader = new FileReader();
				reader.onloadend = () => {
					const base64 = (reader.result as string).split(",")[1];
					if (base64) {
						transcribeMutation.mutate({
							dealId,
							audioBase64: base64,
							mimeType: "audio/webm",
						});
					}
				};
				reader.readAsDataURL(blob);
			};

			mediaRecorder.start();
			setRecordingFallback(true);
			toast.info("Recording fallback voice note...");
		} catch {
			toast.error("Could not start audio recorder.");
		}
	};

	const stopFallbackRecording = () => {
		if (
			mediaRecorderRef.current &&
			mediaRecorderRef.current.state === "recording"
		) {
			mediaRecorderRef.current.stop();
		}
	};

	const formatTimer = (totalSec: number) => {
		const m = Math.floor(totalSec / 60)
			.toString()
			.padStart(2, "0");
		const s = (totalSec % 60).toString().padStart(2, "0");
		return `${m}:${s}`;
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="gap-0 overflow-hidden p-0 text-sm sm:max-w-[min(64rem,calc(100vw-2rem))]">
				<div className="flex h-[min(720px,calc(100svh-2rem))] flex-col bg-background">
					<DialogHeader className="flex flex-row items-start justify-between gap-6 border-b px-8 py-6 text-left">
						<div className="flex min-w-0 items-start gap-4">
							<div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-accent text-foreground">
								<Icon icon={PhoneVoice} size={20} />
							</div>
							<div className="flex min-w-0 flex-col gap-1">
								<DialogTitle className="font-heading font-normal text-2xl tracking-[-0.02em]">
									Qualifying call
								</DialogTitle>
								<DialogDescription className="text-muted-foreground text-sm">
									Gemini Live talks with the lead about{" "}
									<span className="text-foreground">{dealName}</span>, in their
									language.
								</DialogDescription>
							</div>
						</div>
						<div className="flex shrink-0 items-center gap-2 pr-8">
							<Badge variant="outline" className="rounded-full px-3 uppercase">
								{contextQuery.data?.language || "EN"}
							</Badge>
							{status === "in_call" && (
								<Badge
									variant="success"
									className="flex items-center gap-1.5 rounded-full px-3 tabular-nums"
								>
									<span className="size-2 rounded-full bg-current motion-safe:animate-pulse" />
									Live {formatTimer(seconds)}
								</Badge>
							)}
						</div>
					</DialogHeader>

					<div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[minmax(0,1fr)_340px]">
						<section className="flex min-h-0 flex-col">
							<div className="flex-1 space-y-5 overflow-y-auto px-8 py-8">
								{transcripts.length === 0 ? (
									<div className="flex h-full flex-col items-center justify-center gap-4 text-center">
										<div className="flex size-16 items-center justify-center rounded-full bg-muted">
											<Icon icon={PhoneVoice} size={24} />
										</div>
										<div className="flex max-w-[44ch] flex-col gap-2">
											<p className="font-medium text-base">
												{status === "in_call"
													? "The agent is starting the call"
													: "Ready when you are"}
											</p>
											<p className="text-muted-foreground text-sm leading-relaxed">
												{status === "in_call"
													? "It speaks first. Answer out loud as the lead. Each turn appears here as text."
													: "The agent greets the lead, skips what Threadline already knows, and asks short questions to fill in budget, authority, need and timeline."}
											</p>
										</div>
									</div>
								) : (
									transcripts.map((t) => (
										<div
											key={t.id}
											className={`flex flex-col gap-1.5 ${
												t.role === "assistant" ? "items-start" : "items-end"
											}`}
										>
											<span className="px-1 text-muted-foreground text-xs">
												{t.role === "assistant" ? "Threadline" : "Lead"},{" "}
												{t.timestamp}
											</span>
											<div
												className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
													t.role === "assistant"
														? "bg-muted text-foreground"
														: "bg-primary text-primary-foreground"
												}`}
											>
												{t.text}
											</div>
										</div>
									))
								)}
								<div ref={transcriptEndRef} />
							</div>

							{status === "ended" && transcripts.length > 0 && (
								<div className="flex flex-wrap items-center justify-between gap-3 border-t bg-accent px-8 py-4">
									<p className="max-w-[52ch] text-sm">
										The agent is writing a call summary, a follow-up message and
										a stage proposal. They wait for your approval in For you in
										about a minute.
									</p>
									<Button asChild variant="outline" size="sm">
										<Link href={workspaceUrl("/inbox")}>Open For you</Link>
									</Button>
								</div>
							)}

							{fallbackMode && (
								<div className="flex flex-wrap items-center justify-between gap-4 border-t border-dashed bg-muted/40 px-8 py-4">
									<p className="max-w-[48ch] text-muted-foreground text-sm">
										No live connection? Record a voice note and Threadline
										transcribes and qualifies it.
									</p>
									{!recordingFallback ? (
										<Button
											variant="outline"
											onClick={startFallbackRecording}
											className="gap-2"
										>
											<Icon icon={Microphone} />
											Record voice note
										</Button>
									) : (
										<Button
											variant="destructive"
											onClick={stopFallbackRecording}
											className="gap-2"
										>
											<Icon icon={Renew} />
											Stop and qualify
										</Button>
									)}
								</div>
							)}

							<div className="flex flex-wrap items-center justify-between gap-3 border-t px-8 py-5">
								{status === "connecting" ? (
									<>
										<Button disabled aria-busy size="lg" className="gap-2 px-6">
											<Icon icon={Renew} className="motion-safe:animate-spin" />
											Connecting
										</Button>
										<Button
											variant="outline"
											size="lg"
											onClick={() => {
												releaseCall();
												setStatus("idle");
											}}
										>
											Cancel
										</Button>
									</>
								) : status === "idle" ||
									status === "ended" ||
									status === "error" ? (
									<>
										<div className="flex flex-col gap-2">
											{status === "error" && callError && (
												<p role="alert" className="text-destructive text-sm">
													{callError}
												</p>
											)}
											<Button
												onClick={startCall}
												size="lg"
												className="gap-2 px-6"
											>
												<Icon icon={status === "error" ? Renew : PhoneVoice} />
												{status === "error"
													? "Try again"
													: status === "ended"
														? "Start a new call"
														: "Start call"}
											</Button>
										</div>
										<Button
											variant="ghost"
											size="lg"
											onClick={() => setFallbackMode(!fallbackMode)}
										>
											{fallbackMode
												? "Use a live call"
												: "Record a voice note instead"}
										</Button>
									</>
								) : (
									<>
										<div className="flex items-center gap-3">
											<Button
												variant={muted ? "destructive" : "outline"}
												size="lg"
												onClick={() => setMuted(!muted)}
												className="gap-2"
											>
												<Icon icon={muted ? MicrophoneOff : Microphone} />
												{muted ? "Unmute" : "Mute"}
											</Button>
											{activeSpeaker && (
												<span className="flex items-center gap-2 text-muted-foreground text-sm">
													<span className="size-2 rounded-full bg-thread motion-safe:animate-pulse" />
													{activeSpeaker === "assistant"
														? "Threadline is speaking"
														: "Listening"}
												</span>
											)}
										</div>
										<Button
											variant="destructive"
											size="lg"
											onClick={endCall}
											className="gap-2"
										>
											<Icon icon={PhoneOff} />
											End call
										</Button>
									</>
								)}
							</div>
						</section>

						<aside className="flex min-h-0 flex-col gap-8 overflow-y-auto border-t bg-muted/40 px-6 py-6 md:border-t-0 md:border-l">
							<div className="flex flex-col gap-3">
								<div className="flex items-baseline justify-between">
									<h3 className="font-medium text-sm">Qualification</h3>
									<span className="font-heading text-3xl tabular-nums">
										{proposedScore}
										<span className="text-base text-muted-foreground">
											/100
										</span>
									</span>
								</div>
								<div className="h-2 w-full overflow-hidden rounded-full bg-muted">
									<div
										className="h-2 rounded-full bg-primary transition-[width] duration-500"
										style={{ width: `${proposedScore}%` }}
									/>
								</div>
								{proposedStage && (
									<div className="flex flex-col gap-1 rounded-lg bg-accent px-4 py-3">
										<span className="text-muted-foreground text-xs">
											Proposed stage
										</span>
										<span className="font-medium">{proposedStage}</span>
										<span className="text-muted-foreground text-xs">
											Waiting for your approval on the deal.
										</span>
									</div>
								)}
							</div>

							<div className="flex flex-col gap-2">
								<h3 className="font-medium text-sm">What we know</h3>
								<ul className="flex flex-col divide-y rounded-lg border bg-card">
									{BANT_CATEGORIES.map((cat) => {
										const covered =
											Boolean(
												contextQuery.data?.knownFacts[
													`qualification.${cat.key}`
												],
											) || recordedFacts.some((f) => f.category === cat.key);
										return (
											<li
												key={cat.key}
												className="flex items-center justify-between gap-3 px-4 py-2.5"
											>
												<span>{cat.label}</span>
												{covered ? (
													<span className="flex items-center gap-1.5 rounded-full bg-accent px-2.5 py-0.5 text-xs">
														<Icon icon={CheckmarkFilled} size={12} />
														Covered
													</span>
												) : (
													<span className="rounded-full border border-dashed px-2.5 py-0.5 text-muted-foreground text-xs">
														Missing
													</span>
												)}
											</li>
										);
									})}
								</ul>
							</div>

							<div className="flex flex-col gap-2">
								<h3 className="font-medium text-sm">Answers from this call</h3>
								{recordedFacts.length === 0 ? (
									<p className="text-muted-foreground text-sm leading-relaxed">
										Each answer the lead gives appears here with their exact
										words, as a suggestion on the deal.
									</p>
								) : (
									<ul className="flex flex-col gap-2">
										{recordedFacts.map((f) => (
											<li
												key={`${f.category}-${f.fact}-${f.quote.slice(0, 15)}`}
												className="flex flex-col gap-1.5 rounded-lg border bg-card px-4 py-3"
											>
												<span className="text-muted-foreground text-xs capitalize">
													{f.category}
												</span>
												<span className="font-medium">{f.fact}</span>
												<span className="border-thread border-l-2 pl-2 text-muted-foreground text-xs">
													{f.quote}
												</span>
											</li>
										))}
									</ul>
								)}
							</div>
						</aside>
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
}

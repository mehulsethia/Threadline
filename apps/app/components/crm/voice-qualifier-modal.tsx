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
import { useMutation, useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";
import { warmApi } from "@/lib/warm-api";

// Covers a cold API start plus Gemini Live session setup.
const CONNECT_TIMEOUT_MS = 45_000;

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
	const audioCtxRef = useRef<AudioContext | null>(null);
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

		if (audioCtxRef.current) {
			void audioCtxRef.current.close();
			audioCtxRef.current = null;
		}

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
					if (s >= 180) {
						endCall();
						return 180;
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

	const playAudioChunk = useCallback((base64Pcm: string) => {
		try {
			if (!audioCtxRef.current) {
				const AudioContextClass =
					window.AudioContext ||
					(window as unknown as { webkitAudioContext: typeof AudioContext })
						.webkitAudioContext;
				audioCtxRef.current = new AudioContextClass({ sampleRate: 24000 });
			}
			const ctx = audioCtxRef.current;
			if (ctx.state === "suspended") {
				void ctx.resume();
			}

			const binary = atob(base64Pcm);
			const len = binary.length;
			const bytes = new Uint8Array(len);
			for (let i = 0; i < len; i++) {
				bytes[i] = binary.charCodeAt(i);
			}

			const pcm16 = new Int16Array(bytes.buffer);
			const float32 = new Float32Array(pcm16.length);
			for (let i = 0; i < pcm16.length; i++) {
				float32[i] = (pcm16[i] ?? 0) / 32768;
			}

			const audioBuffer = ctx.createBuffer(1, float32.length, 24000);
			audioBuffer.copyToChannel(float32, 0);

			const source = ctx.createBufferSource();
			source.buffer = audioBuffer;
			source.connect(ctx.destination);
			source.start();

			setActiveSpeaker("assistant");
			source.onended = () => {
				setActiveSpeaker(null);
			};
		} catch (err) {
			console.error("Failed to play audio chunk", err);
		}
	}, []);

	const startCall = useCallback(async () => {
		try {
			releaseCall();
			setCallError(null);
			setStatus("connecting");
			setTranscripts([]);
			setRecordedFacts([]);
			setSeconds(0);

			const stream = await navigator.mediaDevices.getUserMedia({
				audio: {
					channelCount: 1,
					sampleRate: 16000,
					echoCancellation: true,
					noiseSuppression: true,
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
			}, CONNECT_TIMEOUT_MS);

			// The socket opening is not enough: the call is live once the API
			// reports the Gemini Live session ready, so audio is never dropped.
			const startStreaming = () => {
				if (connectTimerRef.current) {
					clearTimeout(connectTimerRef.current);
					connectTimerRef.current = null;
				}
				setStatus("in_call");
				toast.success("Voice qualification call active.");

				const AudioContextClass =
					window.AudioContext ||
					(window as unknown as { webkitAudioContext: typeof AudioContext })
						.webkitAudioContext;
				const inputCtx = new AudioContextClass({ sampleRate: 16000 });
				const sourceNode = inputCtx.createMediaStreamSource(stream);
				const processor = inputCtx.createScriptProcessor(4096, 1, 1);
				scriptProcessorRef.current = processor;

				processor.onaudioprocess = (e) => {
					if (muted || ws.readyState !== WebSocket.OPEN) return;
					const inputData = e.inputBuffer.getChannelData(0);
					const pcm16 = new Int16Array(inputData.length);
					for (let i = 0; i < inputData.length; i++) {
						const s = Math.max(-1, Math.min(1, inputData[i] ?? 0));
						pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
					}

					let binary = "";
					const bytes = new Uint8Array(pcm16.buffer);
					for (let i = 0; i < bytes.length; i++) {
						binary += String.fromCharCode(bytes[i] ?? 0);
					}
					const pcmBase64 = btoa(binary);

					ws.send(JSON.stringify({ type: "audio", pcm: pcmBase64 }));
				};

				sourceNode.connect(processor);
				processor.connect(inputCtx.destination);
			};

			ws.onmessage = (event) => {
				try {
					const msg = JSON.parse(event.data) as {
						type: string;
						pcm?: string;
						role?: "assistant" | "user";
						text?: string;
						category?: string;
						fact?: string;
						quote?: string;
						proposedScore?: number;
						proposedStage?: string | null;
						reason?: string;
						message?: string;
					};

					if (msg.type === "ready") {
						startStreaming();
					} else if (msg.type === "audio" && msg.pcm) {
						playAudioChunk(msg.pcm);
					} else if (msg.type === "transcript" && msg.text) {
						setTranscripts((prev) => [
							...prev,
							{
								id: Math.random().toString(36).slice(2),
								role: msg.role || "assistant",
								text: msg.text || "",
								timestamp: new Date().toLocaleTimeString([], {
									hour: "2-digit",
									minute: "2-digit",
									second: "2-digit",
								}),
							},
						]);
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
						if (typeof msg.proposedScore === "number") {
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
		muted,
		playAudioChunk,
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
			<DialogContent className="max-w-3xl overflow-hidden p-0 border border-border shadow-2xl">
				<div className="flex flex-col h-[750px] bg-background">
					<DialogHeader className="p-6 border-b border-border bg-muted/20">
						<div className="flex items-center justify-between">
							<div className="flex items-center gap-3">
								<div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
									<Icon icon={PhoneVoice} size="lg" />
								</div>
								<div>
									<DialogTitle className="text-lg font-semibold tracking-tight">
										Voice Lead Qualifier — Gemini Live
									</DialogTitle>
									<DialogDescription className="text-xs text-muted-foreground">
										Real-time bilingual voice agent for{" "}
										<span className="font-medium text-foreground">
											{dealName}
										</span>
									</DialogDescription>
								</div>
							</div>
							<div className="flex items-center gap-2">
								<Badge
									variant="outline"
									className="text-xs font-mono uppercase"
								>
									{contextQuery.data?.language || "EN"}
								</Badge>
								{status === "in_call" && (
									<Badge
										variant="default"
										className="animate-pulse bg-emerald-600 text-white font-mono text-xs flex items-center gap-1.5"
									>
										<span className="h-2 w-2 rounded-full bg-white" />
										LIVE {formatTimer(seconds)}
									</Badge>
								)}
							</div>
						</div>
					</DialogHeader>

					<div className="grid grid-cols-1 md:grid-cols-3 flex-1 overflow-hidden divide-y md:divide-y-0 md:divide-x divide-border">
						<div className="md:col-span-2 flex flex-col h-full bg-background/50">
							<div className="flex-1 overflow-y-auto p-4 space-y-3">
								{transcripts.length === 0 ? (
									<div className="flex flex-col items-center justify-center h-full text-center p-6 text-muted-foreground">
										<Icon
											icon={PhoneVoice}
											size="lg"
											className="mb-2 opacity-40 text-primary"
										/>
										<p className="text-sm font-medium">
											Ready for real-time conversation.
										</p>
										<p className="text-xs max-w-sm mt-1 text-muted-foreground/80">
											The voice qualifier will greet the prospect, respect known
											facts, and ask concise questions in their language to
											uncover missing BANT details.
										</p>
									</div>
								) : (
									transcripts.map((t) => (
										<div
											key={t.id}
											className={`flex flex-col ${
												t.role === "assistant" ? "items-start" : "items-end"
											}`}
										>
											<div className="flex items-center gap-1.5 text-[10px] text-muted-foreground mb-1 px-1">
												<span className="font-semibold">
													{t.role === "assistant"
														? "Threadline Voice Agent"
														: "Lead / Prospect"}
												</span>
												<span>•</span>
												<span>{t.timestamp}</span>
											</div>
											<div
												className={`rounded-2xl px-4 py-2.5 max-w-[85%] text-xs leading-relaxed shadow-sm ${
													t.role === "assistant"
														? "bg-muted/80 text-foreground border border-border"
														: "bg-primary text-primary-foreground font-medium"
												}`}
											>
												{t.text}
											</div>
										</div>
									))
								)}
								<div ref={transcriptEndRef} />
							</div>

							<div className="p-4 border-t border-border bg-card/40 flex items-center justify-between gap-3">
								{status === "connecting" ? (
									<div className="flex items-center gap-2 w-full">
										<Button
											disabled
											aria-busy
											className="w-full gap-2 font-medium"
											variant="default"
										>
											<Icon icon={Renew} className="animate-spin" />
											Connecting…
										</Button>
										<Button
											variant="outline"
											onClick={() => {
												releaseCall();
												setStatus("idle");
											}}
											className="text-xs whitespace-nowrap"
										>
											Cancel
										</Button>
									</div>
								) : status === "idle" ||
									status === "ended" ||
									status === "error" ? (
									<div className="flex flex-col gap-2 w-full">
										{status === "error" && callError && (
											<p role="alert" className="text-xs text-destructive">
												{callError}
											</p>
										)}
										<div className="flex items-center gap-2 w-full">
											<Button
												onClick={startCall}
												className="w-full gap-2 font-medium"
												variant="default"
											>
												<Icon icon={status === "error" ? Renew : PhoneVoice} />
												{status === "error"
													? "Retry call"
													: status === "ended"
														? "Start New Call"
														: "Start Live Qualification Call"}
											</Button>
											<Button
												variant="outline"
												onClick={() => setFallbackMode(!fallbackMode)}
												className="text-xs whitespace-nowrap"
											>
												{fallbackMode ? "Live Mode" : "Fallback Audio"}
											</Button>
										</div>
									</div>
								) : (
									<div className="flex items-center justify-between w-full">
										<div className="flex items-center gap-2">
											<Button
												variant={muted ? "destructive" : "outline"}
												size="sm"
												onClick={() => setMuted(!muted)}
												className="gap-1.5 text-xs"
											>
												<Icon icon={muted ? MicrophoneOff : Microphone} />
												{muted ? "Unmute" : "Mute"}
											</Button>
											{activeSpeaker && (
												<span className="text-xs text-muted-foreground font-medium animate-pulse flex items-center gap-1.5">
													<span className="h-2 w-2 rounded-full bg-primary" />
													{activeSpeaker === "assistant"
														? "Agent speaking..."
														: "Listening..."}
												</span>
											)}
										</div>
										<Button
											variant="destructive"
											size="sm"
											onClick={endCall}
											className="gap-1.5 text-xs font-semibold"
										>
											<Icon icon={PhoneOff} />
											End Call
										</Button>
									</div>
								)}
							</div>

							{fallbackMode && (
								<div className="p-4 border-t border-dashed border-border bg-muted/30">
									<p className="text-xs text-muted-foreground mb-2">
										Fallback: If microphone WebSocket is unavailable, record an
										audio snippet to transcribe and qualify.
									</p>
									<div className="flex items-center gap-2">
										{!recordingFallback ? (
											<Button
												size="sm"
												variant="outline"
												onClick={startFallbackRecording}
												className="text-xs gap-1.5"
											>
												<Icon icon={Microphone} />
												Record Audio Note
											</Button>
										) : (
											<Button
												size="sm"
												variant="destructive"
												onClick={stopFallbackRecording}
												className="text-xs gap-1.5 animate-pulse"
											>
												<Icon icon={Renew} />
												Stop & Qualify
											</Button>
										)}
									</div>
								</div>
							)}
						</div>

						<div className="p-4 flex flex-col h-full bg-muted/10 overflow-y-auto">
							<div className="mb-4">
								<h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
									Qualification Progress
								</h4>
								<div className="flex items-baseline justify-between mb-1">
									<span className="text-xs font-medium">BANT Score</span>
									<span className="text-sm font-bold font-mono text-primary">
										{proposedScore}%
									</span>
								</div>
								<div className="w-full bg-muted rounded-full h-2 overflow-hidden">
									<div
										className="bg-primary h-2 transition-all duration-500 rounded-full"
										style={{ width: `${proposedScore}%` }}
									/>
								</div>
							</div>

							{proposedStage && (
								<div className="mb-4 p-2.5 rounded-lg border border-primary/20 bg-primary/5">
									<div className="text-[10px] font-semibold uppercase tracking-wider text-primary">
										Proposed Stage
									</div>
									<div className="text-xs font-bold text-foreground mt-0.5">
										{proposedStage}
									</div>
									<div className="text-[10px] text-muted-foreground mt-0.5">
										(PROPOSED in ledger, review on Deal sheet)
									</div>
								</div>
							)}

							<div className="mb-4">
								<h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
									BANT Criteria
								</h4>
								<div className="space-y-1.5">
									{BANT_CATEGORIES.map((cat) => {
										const covered =
											Boolean(
												contextQuery.data?.knownFacts[
													`qualification.${cat.key}`
												],
											) || recordedFacts.some((f) => f.category === cat.key);
										return (
											<div
												key={cat.key}
												className="flex items-center justify-between text-xs py-1 px-2 rounded-md bg-background/60 border border-border/50"
											>
												<span className="text-foreground/90">{cat.label}</span>
												{covered ? (
													<Icon
														icon={CheckmarkFilled}
														className="text-emerald-500"
														size="sm"
													/>
												) : (
													<span className="text-[10px] font-mono text-muted-foreground">
														Missing
													</span>
												)}
											</div>
										);
									})}
								</div>
							</div>

							<div className="flex-1">
								<h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
									Live Captured Evidence
								</h4>
								{recordedFacts.length === 0 ? (
									<p className="text-[11px] text-muted-foreground/70 italic">
										No answers recorded yet. As the lead speaks, verified claims
										will appear here.
									</p>
								) : (
									<div className="space-y-2">
										{recordedFacts.map((f) => (
											<div
												key={`${f.category}-${f.fact}-${f.quote.slice(0, 15)}`}
												className="p-2 rounded border border-border bg-background text-xs space-y-1"
											>
												<div className="flex items-center justify-between">
													<span className="font-semibold text-primary uppercase text-[10px]">
														{f.category}
													</span>
													<Badge
														variant="outline"
														className="text-[9px] px-1 py-0"
													>
														PROPOSED
													</Badge>
												</div>
												<div className="font-medium text-foreground">
													{f.fact}
												</div>
												<div className="text-[10px] text-muted-foreground italic border-l-2 border-primary/40 pl-1.5">
													"{f.quote}"
												</div>
											</div>
										))}
									</div>
								)}
							</div>
						</div>
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
}

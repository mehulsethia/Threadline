import { runInWorkspace } from "@crm/db";
import { jsonText } from "@crm/validation/json-text";
import {
	VOICE_CATEGORIES,
	type VoiceDealContext,
	voiceClientMessage,
	voiceRecordedFact,
} from "@crm/validation/voice";
import {
	GoogleGenAI,
	type LiveServerMessage,
	Modality,
	type Session,
	type Tool,
	Type,
} from "@google/genai";
import { recordAnswer } from "./answers";
import { dealContext } from "./context";
import { liveLocation, liveModel, VOICE } from "./voice-config";

export type CallPeer = {
	send: (message: object) => void;
	close: () => void;
};

export type LiveCall = {
	receive: (raw: string) => void;
	end: () => void;
};

const RECORD_ANSWER: Tool = {
	functionDeclarations: [
		{
			name: "record_answer",
			description:
				"Record a verified qualification answer (budget, authority, need, timeline, competitors, or decision process) with verbatim quote spoken by the lead.",
			parameters: {
				type: Type.OBJECT,
				properties: {
					category: {
						type: Type.STRING,
						description: `One of: ${VOICE_CATEGORIES.join(", ")}`,
						enum: [...VOICE_CATEGORIES],
					},
					fact: {
						type: Type.STRING,
						description: "Factual summary of the confirmed answer",
					},
					quote: {
						type: Type.STRING,
						description:
							"Verbatim quote spoken by the prospect during the call",
					},
				},
				required: ["category", "fact", "quote"],
			},
		},
	],
};

export function systemInstruction(
	context: VoiceDealContext,
	workspaceName = "Threadline Systems",
): string {
	const known = Object.entries(context.knownFacts);
	const knownSummary =
		known.length > 0
			? known.map(([k, v]) => `• ${k}: ${v}`).join("\n")
			: "None yet recorded.";
	const missingList =
		context.missingCategories.length > 0
			? context.missingCategories.join(", ")
			: "All standard categories answered; confirm timeline and next steps.";

	return [
		`You are a professional voice qualification specialist for ${workspaceName}.`,
		`You are speaking live with ${context.leadName}${context.companyName ? ` from ${context.companyName}` : ""}.`,
		`The deal in discussion is "${context.dealName}".`,
		`The customer's language is "${context.language}". Respond in "${context.language}".`,
		"Keep every turn concise (1 to 2 sentences). Sound natural, polite, and consultative.",
		"Ask one question at a time, then stop talking and wait for the answer. Never repeat a sentence you already said.",
		"Already known information (DO NOT ask about these again):",
		knownSummary,
		`Your goal is to politely uncover only what is missing: ${missingList}.`,
		"Focus on BANTC:",
		"- budget: allocation, pricing comfort or constraints",
		"- authority: who makes the ultimate purchasing decision",
		"- need: primary pain point, problem, or must-have capability",
		"- timeline: targeted launch, implementation date, or urgency",
		"- competitors: other tools or alternatives they are evaluating",
		"- decision_process: steps required before signing a contract",
		"When the prospect answers any of these items, immediately call the tool 'record_answer' with category, a clean factual summary, and their verbatim quote.",
		"Wrap up gracefully within 3 minutes once the critical missing points are addressed.",
	].join("\n");
}

export async function startLiveCall(
	workspaceId: string,
	dealId: string,
	peer: CallPeer,
): Promise<LiveCall> {
	const context = await runInWorkspace(workspaceId, () => dealContext(dealId));
	peer.send({
		type: "connected",
		dealId: context.dealId,
		dealName: context.dealName,
		leadName: context.leadName,
		language: context.language,
		missingCategories: context.missingCategories,
		qualificationScore: context.qualificationScore,
		currentStage: context.currentStage,
		proposedStage: context.proposedStage,
	});

	const ai = new GoogleGenAI({
		vertexai: true,
		project: process.env.GOOGLE_CLOUD_PROJECT,
		location: liveLocation(),
	});

	let ended = false;
	const finish = (reason?: string) => {
		if (ended) return;
		ended = true;
		peer.send({ type: "call_ended", reason });
		peer.close();
	};

	const onToolCall = async (session: Session, msg: LiveServerMessage) => {
		for (const call of msg.toolCall?.functionCalls ?? []) {
			if (call.name !== "record_answer") continue;
			const parsed = voiceRecordedFact.safeParse(call.args);
			if (!parsed.success) continue;
			const recorded = await runInWorkspace(workspaceId, () =>
				recordAnswer(dealId, parsed.data),
			);
			try {
				session.sendToolResponse({
					functionResponses: [
						{
							id: call.id,
							name: call.name,
							response: { success: true, recorded: true },
						},
					],
				});
			} catch (error) {
				console.error("[voice] tool response failed", error);
			}
			peer.send({
				type: "fact_proposed",
				...parsed.data,
				proposedScore: recorded.proposedScore,
				proposedStage: recorded.proposedStage,
			});
		}
	};

	const session: Session = await ai.live.connect({
		model: liveModel(),
		config: {
			responseModalities: [Modality.AUDIO],
			systemInstruction: { parts: [{ text: systemInstruction(context) }] },
			inputAudioTranscription: {},
			outputAudioTranscription: {},
			tools: [RECORD_ANSWER],
		},
		callbacks: {
			onmessage: (msg: LiveServerMessage) => {
				const content = msg.serverContent;
				if (content?.interrupted) peer.send({ type: "interrupted" });
				for (const part of content?.modelTurn?.parts ?? []) {
					if (part.inlineData?.data && !part.thought) {
						peer.send({ type: "audio", pcm: part.inlineData.data });
					}
				}
				if (content?.inputTranscription?.text) {
					peer.send({
						type: "transcript",
						role: "user",
						text: content.inputTranscription.text,
					});
				}
				if (content?.outputTranscription?.text) {
					peer.send({
						type: "transcript",
						role: "assistant",
						text: content.outputTranscription.text,
					});
				}
				if (content?.turnComplete) peer.send({ type: "turn_complete" });
				if (msg.toolCall) {
					onToolCall(session, msg).catch((error) =>
						console.error("[voice] record_answer failed", error),
					);
				}
			},
			onerror: (event: ErrorEvent) => {
				console.error("[voice] live session error", event.message);
				finish(event.message);
			},
			onclose: (event: CloseEvent) => finish(event.reason || undefined),
		},
	});

	peer.send({ type: "ready" });
	session.sendClientContent({
		turns: [
			{
				role: "user",
				parts: [
					{
						text: `The call has connected. Greet ${context.leadName} by name, say in one sentence why you are calling, and ask your first question.`,
					},
				],
			},
		],
		turnComplete: true,
	});

	return {
		receive: (raw) => {
			const parsed = jsonText.pipe(voiceClientMessage).safeParse(raw);
			if (!parsed.success || ended) return;
			const msg = parsed.data;
			if (msg.type === "audio") {
				session.sendRealtimeInput({
					audio: { mimeType: VOICE.live.inputMimeType, data: msg.pcm },
				});
			} else if (msg.type === "text") {
				session.sendClientContent({
					turns: [{ role: "user", parts: [{ text: msg.text }] }],
				});
			} else {
				try {
					session.close();
				} catch {}
				finish("user_ended");
			}
		},
		end: () => {
			ended = true;
			try {
				session.close();
			} catch {}
		},
	};
}

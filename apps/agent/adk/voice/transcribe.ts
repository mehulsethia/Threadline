import { jsonText } from "@crm/validation/json-text";
import {
	type VoiceRecordedFact,
	type VoiceTranscribeRequest,
	type VoiceTranscribeResult,
	voiceRecordedFact,
} from "@crm/validation/voice";
import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { recordAnswer } from "./answers";
import { dealContext } from "./context";
import { transcribeLocation, transcribeModel } from "./voice-config";

const recordingAnalysis = z.object({
	transcript: z.string().optional().catch(undefined),
	facts: z
		.array(voiceRecordedFact.nullable().catch(null))
		.catch([])
		.transform((facts) =>
			facts.filter((fact): fact is VoiceRecordedFact => fact !== null),
		),
});

const PROMPT = [
	"You are transcribing and analyzing an outbound qualification voice recording.",
	"1. Transcribe the audio verbatim.",
	"2. Extract any lead qualification facts corresponding to: budget, authority, need, timeline, competitors, decision_process.",
	"3. Return a JSON object formatted as:",
	"{",
	'  "transcript": "...",',
	'  "facts": [',
	'    { "category": "budget", "fact": "...", "quote": "..." }',
	"  ]",
	"}",
].join("\n");

export async function transcribeAndQualify(
	input: VoiceTranscribeRequest,
): Promise<VoiceTranscribeResult> {
	const context = await dealContext(input.dealId);

	const ai = new GoogleGenAI({
		vertexai: true,
		project: process.env.GOOGLE_CLOUD_PROJECT,
		location: transcribeLocation(),
	});

	const response = await ai.models.generateContent({
		model: transcribeModel(),
		contents: [
			{
				role: "user",
				parts: [
					{
						inlineData: { mimeType: input.mimeType, data: input.audioBase64 },
					},
					{ text: PROMPT },
				],
			},
		],
		config: { responseMimeType: "application/json" },
	});

	const text = response.text || "{}";
	const result = jsonText.pipe(recordingAnalysis).safeParse(text);
	const parsed = result.success ? result.data : { transcript: text, facts: [] };

	const recordedFacts: VoiceRecordedFact[] = [];
	let proposedScore = context.qualificationScore;
	let proposedStage = context.proposedStage;
	for (const fact of parsed.facts) {
		if (!fact.fact || !fact.quote) continue;
		const recorded = await recordAnswer(input.dealId, fact);
		proposedScore = recorded.proposedScore;
		proposedStage = recorded.proposedStage;
		recordedFacts.push(fact);
	}

	return {
		dealId: input.dealId,
		transcript: parsed.transcript || "Audio recorded.",
		recordedFacts,
		proposedScore,
		proposedStage,
	};
}

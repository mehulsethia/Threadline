import { readFileSync } from "node:fs";
import type { WhatsAppMessageItem } from "@crm/validation/whatsapp-parser";
import { GoogleGenAI } from "@google/genai";

export type AudioSegment = {
	start: string;
	end: string;
	speaker?: string | null;
	text: string;
};

export type AudioTranscriptionResult = {
	language: string;
	segments: AudioSegment[];
	fullTranscript: string;
};

export type EvidenceSourceKind =
	| "whatsapp.message"
	| "voice.transcript"
	| "voice.live-call"
	| "agent.inference";

export type EvidenceRef = {
	sourceKind: EvidenceSourceKind;
	quote: string;
	lineNos?: number[];
	audioRange?: { start: string; end: string };
};

export type ExtractedField<T> = {
	value: T;
	evidence: EvidenceRef | null;
};

export type LeadObjection = {
	objection: string;
	evidence: EvidenceRef;
};

export type ExtractedLeadFacts = {
	contact: {
		name: ExtractedField<string | null>;
		phone: ExtractedField<string | null>;
		role: ExtractedField<string | null>;
	};
	company: {
		name: ExtractedField<string | null>;
		city: ExtractedField<string | null>;
	};
	deal: {
		need: ExtractedField<string | null>;
		quantity: ExtractedField<string | number | null>;
		budget: ExtractedField<number | null>;
		currency: ExtractedField<string | null>;
		timeline: ExtractedField<string | null>;
		stageSuggestion: ExtractedField<string | null>;
	};
	languagePreference: ExtractedField<string | null>;
	objections: LeadObjection[];
	nextStep: ExtractedField<string | null>;
	sentiment: ExtractedField<"positive" | "neutral" | "negative" | null>;
};

export type ExtractLeadFactsInput = {
	messages?: WhatsAppMessageItem[];
	transcript?:
		| {
				language?: string;
				fullTranscript?: string;
				segments?: AudioSegment[];
		  }
		| string;
};

function inferAudioMimeType(filename: string): string {
	const ext = filename.toLowerCase().split(".").pop();
	switch (ext) {
		case "opus":
			return "audio/ogg";
		case "m4a":
			return "audio/mp4";
		case "mp3":
			return "audio/mp3";
		case "wav":
			return "audio/wav";
		case "ogg":
			return "audio/ogg";
		case "aac":
			return "audio/aac";
		case "flac":
			return "audio/flac";
		default:
			return "audio/ogg";
	}
}

function getSmartClient(): { ai: GoogleGenAI; model: string } {
	const project =
		process.env.GOOGLE_CLOUD_PROJECT || "project-e705af63-271f-48bf-92f";
	const model = process.env.GEMINI_SMART_MODEL || "gemini-4-argon";
	const location = process.env.GEMINI_SMART_LOCATION || "global";

	const ai = new GoogleGenAI({
		vertexai: true,
		project,
		location,
	});

	return { ai, model };
}

export async function transcribeAudio(
	file:
		| string
		| { buffer: Buffer | Uint8Array; filename?: string; mimeType?: string },
): Promise<AudioTranscriptionResult> {
	let bytes: Buffer;
	let mimeType: string;

	if (typeof file === "string") {
		bytes = readFileSync(file);
		mimeType = inferAudioMimeType(file);
	} else {
		bytes = Buffer.isBuffer(file.buffer)
			? file.buffer
			: Buffer.from(file.buffer);
		mimeType =
			file.mimeType || inferAudioMimeType(file.filename ?? "audio.opus");
	}

	const { ai, model } = getSmartClient();

	const prompt = [
		"You are an expert multilingual audio transcriber specializing in Indian languages including Hindi, English, Hinglish, Bengali, Marathi, and Gujarati.",
		"Transcribe this audio recording into chronological segments with accurate start and end timestamps (formatted as MM:SS).",
		"Identify the primary spoken language (e.g. 'hi', 'en', 'Hinglish', 'bn', etc.).",
		"For Hinglish or Hindi speech, transcribe in natural romanized script if Hinglish.",
		"Return a JSON object conforming exactly to this schema:",
		JSON.stringify({
			language: "Hinglish",
			segments: [
				{
					start: "00:00",
					end: "00:05",
					speaker: "Speaker 1",
					text: "transcribed segment text",
				},
			],
			fullTranscript: "full transcribed text",
		}),
	].join("\n");

	const response = await ai.models.generateContent({
		model,
		contents: [
			{
				role: "user",
				parts: [
					{
						inlineData: {
							mimeType,
							data: bytes.toString("base64"),
						},
					},
					{
						text: prompt,
					},
				],
			},
		],
		config: {
			responseMimeType: "application/json",
		},
	});

	const rawJson = response.text?.trim() ?? "{}";
	const parsed = JSON.parse(rawJson);

	return {
		language: parsed.language ?? "unknown",
		segments: Array.isArray(parsed.segments) ? parsed.segments : [],
		fullTranscript: parsed.fullTranscript ?? "",
	};
}

export async function extractLeadFacts(
	input: ExtractLeadFactsInput,
): Promise<ExtractedLeadFacts> {
	const contentSections: string[] = [];

	if (input.messages && input.messages.length > 0) {
		const messageLines = input.messages.map((m) => {
			const timeStr = m.timestamp.toISOString().replace("T", " ").slice(0, 19);
			return `[Line ${m.lineNo}] (${timeStr}) ${m.sender}: ${m.text}`;
		});
		contentSections.push("=== WHATSAPP MESSAGES ===");
		contentSections.push(messageLines.join("\n"));
	}

	if (input.transcript) {
		contentSections.push("=== AUDIO TRANSCRIPT ===");
		if (typeof input.transcript === "string") {
			contentSections.push(input.transcript);
		} else {
			contentSections.push(
				`Detected Audio Language: ${input.transcript.language ?? "unknown"}`,
			);
			if (input.transcript.segments && input.transcript.segments.length > 0) {
				const segmentLines = input.transcript.segments.map(
					(seg) =>
						`[Audio ${seg.start} - ${seg.end}] ${seg.speaker ?? "Speaker"}: ${seg.text}`,
				);
				contentSections.push(segmentLines.join("\n"));
			} else if (input.transcript.fullTranscript) {
				contentSections.push(input.transcript.fullTranscript);
			}
		}
	}

	if (contentSections.length === 0) {
		throw new Error("No messages or transcript provided to extractLeadFacts.");
	}

	const conversationText = contentSections.join("\n\n");

	const instructions = [
		"You are Threadline's Lead Extraction Engine.",
		"Analyze this customer conversation (WhatsApp messages and/or audio transcripts) to extract key lead, company, and deal facts.",
		"",
		"CRITICAL RULES:",
		"1. Strict evidence linkage: For EVERY extracted field with a non-null value, you MUST link it to exact evidence:",
		"   - 'sourceKind': 'whatsapp.message' if from chat, 'voice.transcript' if from audio transcript.",
		"   - 'quote': the EXACT quote as stated by the lead or rep.",
		"   - 'lineNos': array of line numbers from the messages (e.g. [2, 3]). Include ONLY when sourceKind is 'whatsapp.message'.",
		"   - 'audioRange': { 'start': '00:00', 'end': '00:08' } timestamp range. Include ONLY when sourceKind is 'voice.transcript'.",
		"2. ABSOLUTELY NO HALLUCINATIONS OR GUESSWORK:",
		"   If a field is not explicitly mentioned or supported by direct evidence in the conversation, its value MUST be null, and its evidence MUST be null.",
		"   Never invent, extrapolate, or assume unmentioned roles, cities, budgets, timelines, or names.",
		"3. Objections: An array of objections or concerns raised by the lead. Each objection must include its own exact quote and evidence. If none, return [].",
		"4. Language preference: Detected language preference of the lead (e.g. 'Hinglish', 'Hindi', 'English', 'Bengali').",
		"5. Deal stage suggestion: Suggest a standard stage: 'Lead', 'Discovery', 'Qualified', 'Proposal', 'Negotiation', 'Won', 'Lost'.",
		"6. Budget & Currency: If budget is stated, 'budget' must be a numeric value and 'currency' must be 3-letter code (e.g. 'INR', 'USD'). If not stated, both must be null.",
		"7. Sentiment: 'positive', 'neutral', or 'negative'.",
		"8. Next Step: The agreed or proposed concrete next action.",
		"",
		"Return a JSON object conforming exactly to this structure:",
		JSON.stringify(
			{
				contact: {
					name: {
						value: "Lead Name",
						evidence: {
							sourceKind: "whatsapp.message",
							quote: "Exact quote",
							lineNos: [2],
						},
					},
					phone: { value: null, evidence: null },
					role: { value: null, evidence: null },
				},
				company: {
					name: {
						value: "Company Name",
						evidence: {
							sourceKind: "whatsapp.message",
							quote: "Exact quote",
							lineNos: [2],
						},
					},
					city: {
						value: "City",
						evidence: {
							sourceKind: "whatsapp.message",
							quote: "Exact quote",
							lineNos: [2],
						},
					},
				},
				deal: {
					need: {
						value: "Need description",
						evidence: {
							sourceKind: "whatsapp.message",
							quote: "Exact quote",
							lineNos: [3],
						},
					},
					quantity: {
						value: "150 pieces",
						evidence: {
							sourceKind: "whatsapp.message",
							quote: "Exact quote",
							lineNos: [3],
						},
					},
					budget: {
						value: 450000,
						evidence: {
							sourceKind: "whatsapp.message",
							quote: "Exact quote",
							lineNos: [5],
						},
					},
					currency: {
						value: "INR",
						evidence: {
							sourceKind: "whatsapp.message",
							quote: "Exact quote",
							lineNos: [5],
						},
					},
					timeline: {
						value: "2 weeks",
						evidence: {
							sourceKind: "whatsapp.message",
							quote: "Exact quote",
							lineNos: [6],
						},
					},
					stageSuggestion: {
						value: "Proposal",
						evidence: {
							sourceKind: "agent.inference",
							quote: "Exact quote",
							lineNos: [10],
						},
					},
				},
				languagePreference: {
					value: "Hinglish",
					evidence: {
						sourceKind: "whatsapp.message",
						quote: "Exact quote",
						lineNos: [2],
					},
				},
				objections: [
					{
						objection: "Objection description",
						evidence: {
							sourceKind: "whatsapp.message",
							quote: "Exact quote",
							lineNos: [7],
						},
					},
				],
				nextStep: {
					value: "Next step description",
					evidence: {
						sourceKind: "whatsapp.message",
						quote: "Exact quote",
						lineNos: [11],
					},
				},
				sentiment: {
					value: "positive",
					evidence: {
						sourceKind: "whatsapp.message",
						quote: "Exact quote",
						lineNos: [10],
					},
				},
			},
			null,
			2,
		),
	].join("\n");

	const { ai, model } = getSmartClient();

	const response = await ai.models.generateContent({
		model,
		contents: [
			{
				role: "user",
				parts: [
					{
						text: `${instructions}\n\n${conversationText}`,
					},
				],
			},
		],
		config: {
			responseMimeType: "application/json",
		},
	});

	const rawJson = response.text?.trim() ?? "{}";
	const parsed = JSON.parse(rawJson);

	return normalizeExtractedFacts(parsed);
}

function normalizeExtractedFacts(
	data: Record<string, unknown>,
): ExtractedLeadFacts {
	const normalizeField = <T>(field: unknown): ExtractedField<T> => {
		if (!field || typeof field !== "object") {
			return { value: null as T, evidence: null };
		}
		const obj = field as { value?: unknown; evidence?: unknown };
		if (obj.value === null || obj.value === undefined) {
			return { value: null as T, evidence: null };
		}
		const evidence =
			obj.evidence && typeof obj.evidence === "object"
				? (obj.evidence as EvidenceRef)
				: null;
		return {
			value: obj.value as T,
			evidence,
		};
	};

	const contactRaw = (data.contact as Record<string, unknown>) ?? {};
	const companyRaw = (data.company as Record<string, unknown>) ?? {};
	const dealRaw = (data.deal as Record<string, unknown>) ?? {};

	const objectionsRaw = Array.isArray(data.objections) ? data.objections : [];
	const objections: LeadObjection[] = objectionsRaw
		.filter((item) => item && typeof item === "object" && item.objection)
		.map((item) => ({
			objection: String(item.objection),
			evidence: item.evidence as EvidenceRef,
		}));

	return {
		contact: {
			name: normalizeField<string | null>(contactRaw.name),
			phone: normalizeField<string | null>(contactRaw.phone),
			role: normalizeField<string | null>(contactRaw.role),
		},
		company: {
			name: normalizeField<string | null>(companyRaw.name),
			city: normalizeField<string | null>(companyRaw.city),
		},
		deal: {
			need: normalizeField<string | null>(dealRaw.need),
			quantity: normalizeField<string | number | null>(dealRaw.quantity),
			budget: normalizeField<number | null>(dealRaw.budget),
			currency: normalizeField<string | null>(dealRaw.currency),
			timeline: normalizeField<string | null>(dealRaw.timeline),
			stageSuggestion: normalizeField<string | null>(dealRaw.stageSuggestion),
		},
		languagePreference: normalizeField<string | null>(data.languagePreference),
		objections,
		nextStep: normalizeField<string | null>(data.nextStep),
		sentiment: normalizeField<"positive" | "neutral" | "negative" | null>(
			data.sentiment,
		),
	};
}

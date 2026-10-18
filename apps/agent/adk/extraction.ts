import { readFileSync } from "node:fs";
import { DealStage } from "@crm/db";
import type { WhatsAppMessageItem } from "@crm/validation/whatsapp-parser";
import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import {
	detectParticipants,
	type ValidationSummary,
	validateAndEnrichFacts,
} from "./validator";

const GEMINI_RETRY = { attempts: 5, baseDelayMs: 5_000 } as const;

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
	| "email.message"
	| "slack.message"
	| "meeting.transcript"
	| "form.submission"
	| "voice.transcript"
	| "voice.live-call"
	| "agent.inference";

export type EvidenceSpeaker = "lead" | "us";

export type EvidenceRef = {
	sourceKind: EvidenceSourceKind;
	speaker: EvidenceSpeaker;
	quote: string;
	lineNos?: number[];
	audioRange?: { start: string; end: string };
	downgraded?: boolean;
	flag?: string;
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
		leadBudget: ExtractedField<number | null>;
		quotedValue: ExtractedField<number | null>;
		currency: ExtractedField<string | null>;
		timeline: ExtractedField<string | null>;
		timelineResolved: string | null;
		stageSuggestion: ExtractedField<DealStage | null>;
	};
	languagePreference: ExtractedField<string | null>;
	objections: LeadObjection[];
	nextStep: {
		value: string | null;
		owner: "us" | "lead" | null;
		dueAt: string | null;
		evidence: EvidenceRef | null;
	};
	sentiment: ExtractedField<"positive" | "neutral" | "negative" | null>;
	participants: {
		me: string;
		lead: string;
		confidence: number;
		autoDetected: boolean;
	};
};

export type ExtractLeadFactsInput = {
	messages?: WhatsAppMessageItem[];
	transcript?: {
		language?: string;
		fullTranscript?: string;
		segments?: AudioSegment[];
	};
	me?: string;
	workspaceName?: string;
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

/** A Vertex Gemini client and the model id configured for its tier. */
export type GeminiClient = { ai: GoogleGenAI; model: string };

export function getFastClient(): GeminiClient {
	const project =
		process.env.GOOGLE_CLOUD_PROJECT || "project-e705af63-271f-48bf-92f";
	const model = process.env.GEMINI_FAST_MODEL || "gemini-2.5-flash";
	const location = process.env.GEMINI_FAST_LOCATION || "us-central1";

	const ai = new GoogleGenAI({
		vertexai: true,
		project,
		location,
	});

	return { ai, model };
}

export function getSmartClient(): GeminiClient {
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

export async function pdfText(bytes: Buffer): Promise<string> {
	const { ai, model } = getFastClient();
	const response = await ai.models.generateContent({
		model,
		contents: [
			{
				role: "user",
				parts: [
					{
						inlineData: {
							mimeType: "application/pdf",
							data: bytes.toString("base64"),
						},
					},
					{
						text: "Return the full text of this meeting transcript exactly as written, one speaker turn per line in the form 'Speaker Name: words'. Do not summarise, translate or add anything.",
					},
				],
			},
		],
	});
	return response.text?.trim() ?? "";
}

export async function transcribeAudio(
	file:
		| { path: string }
		| { buffer: Buffer | Uint8Array; filename?: string; mimeType?: string },
): Promise<AudioTranscriptionResult> {
	let bytes: Buffer;
	let mimeType: string;

	if ("path" in file) {
		bytes = readFileSync(file.path);
		mimeType = inferAudioMimeType(file.path);
	} else {
		bytes = Buffer.isBuffer(file.buffer)
			? file.buffer
			: Buffer.from(file.buffer);
		mimeType =
			file.mimeType || inferAudioMimeType(file.filename ?? "audio.opus");
	}

	const { ai, model } = getSmartClient();

	const prompt = [
		"You are an expert multilingual audio transcriber.",
		"Transcribe this audio recording into chronological segments with accurate start and end timestamps (formatted as MM:SS).",
		"Identify the primary spoken language (e.g. 'en', 'es', 'de', 'hi', 'fr', 'pt', etc.).",
		"Transcribe in the spoken language accurately.",
		"Return a JSON object conforming exactly to this schema:",
		JSON.stringify({
			language: "en",
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

	let response: any;
	for (let attempt = 0; attempt < GEMINI_RETRY.attempts; attempt++) {
		try {
			response = await ai.models.generateContent({
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
			break;
		} catch (err: unknown) {
			const errorObj = err as { status?: number; message?: string } | null;
			if (
				attempt < GEMINI_RETRY.attempts - 1 &&
				(errorObj?.status === 429 ||
					String(errorObj?.message || "").includes("429") ||
					String(errorObj?.message || "").includes("RESOURCE_EXHAUSTED"))
			) {
				await new Promise((resolve) =>
					setTimeout(resolve, GEMINI_RETRY.baseDelayMs * 2 ** attempt),
				);
				continue;
			}
			throw err;
		}
	}

	const rawJson = response.text?.trim() ?? "{}";
	const parsed = JSON.parse(rawJson);

	return {
		language: parsed.language ?? "unknown",
		segments: Array.isArray(parsed.segments) ? parsed.segments : [],
		fullTranscript: parsed.fullTranscript ?? "",
	};
}

export async function extractLeadFacts(input: ExtractLeadFactsInput): Promise<{
	facts: ExtractedLeadFacts;
	validationSummary: ValidationSummary;
}> {
	const messages = input.messages ?? [];
	const rawParticipants = Array.from(new Set(messages.map((m) => m.sender)));
	const participantInfo = detectParticipants(
		rawParticipants,
		messages,
		input.me,
	);

	const contentSections: string[] = [];

	if (messages.length > 0) {
		const messageLines = messages.map((m) => {
			const timeStr = m.timestamp.toISOString().replace("T", " ").slice(0, 19);
			return `[Line ${m.lineNo}] (${timeStr}) ${m.sender}: ${m.text}`;
		});
		contentSections.push("=== WHATSAPP MESSAGES ===");
		contentSections.push(messageLines.join("\n"));
	}

	if (input.transcript) {
		contentSections.push("=== AUDIO TRANSCRIPT ===");
		if (input.transcript.language) {
			contentSections.push(
				`Detected Audio Language: ${input.transcript.language}`,
			);
		}
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

	if (contentSections.length === 0) {
		throw new Error("No messages or transcript provided to extractLeadFacts.");
	}

	const conversationText = contentSections.join("\n\n");

	const instructions = [
		"You are Threadline's Lead Extraction Engine.",
		"Analyze this customer conversation to extract CRM lead facts.",
		"",
		"PARTICIPANTS:",
		`- Business user ("us", CRM seller): "${participantInfo.me}"`,
		`- Lead / Customer ("lead"): "${participantInfo.lead}"`,
		"",
		"CRITICAL EXTRACTION RULES:",
		`1. CONTACT NAME: Must ALWAYS be the customer/lead (${participantInfo.lead}). Never create the business user (${participantInfo.me}) as a contact.`,
		"2. COMPANY NAME:",
		`   - Must ONLY be the organisation/company that the customer/lead (${participantInfo.lead}) represents or works for.`,
		`   - NEVER set the business user's ("us" / ${participantInfo.me}'s) organisation as the company. For example, if the business user welcomes the customer to their own organisation ("Apex IIT Academy me aapka swagat hai"), Apex IIT Academy is OUR organisation, NOT the customer's company.`,
		"   - If the lead is an individual consumer, parent, student, or their employer/company is not mentioned, company.name MUST be null.",
		"3. MONEY FIELDS:",
		"   - 'deal.leadBudget': What the customer/lead explicitly states they can spend or have budgeted (number or null).",
		"   - 'deal.quotedValue': What the business user quoted, agreed, or proposal / contract price (number or null).",
		"   - 'deal.currency': ISO 4217 code (USD, EUR, GBP, INR, CAD, AUD, etc.) if stated or indicated by currency symbols ($, €, £, ₹), else null.",
		"4. SPEAKER FIELD ON ALL EVIDENCE:",
		"   - Every evidence object MUST include 'speaker': 'lead' (if spoken by customer) or 'us' (if spoken by business user).",
		"5. INFERENCE VS LITERAL QUOTE:",
		"   - 'sentiment', 'stageSuggestion', 'languagePreference' MUST use sourceKind 'agent.inference'.",
		"   - Facts literally stated in messages/audio use 'whatsapp.message' or 'voice.transcript' with the exact quote.",
		"6. FIELDS WITHOUT EVIDENCE MUST BE NULL: Never guess, extrapolate, or assume unmentioned values.",
		"7. DEAL STAGES: Pick the HIGHEST stage whose explicit criteria are met by cited evidence in the chat:",
		"   - UNQUALIFIED_TO_BUY (Lead): Inquiry only, no confirmed budget or timeline, no demo booked.",
		"   - QUALIFIED_TO_BUY (Qualified): Need confirmed PLUS budget (leadBudget or quotedValue) or timeline confirmed.",
		"   - DEMO_BOOKED (Meeting/Demo): Meeting, demo, centre visit, or diagnostic session booked or held.",
		"   - CONTRACT_SENT (Proposal): Quote, proposal document, or contract was actually sent to the buyer (NOT merely requested or promised for later).",
		"   - DECISION_MAKER_BOUGHT_IN (Negotiation): Buyer is negotiating price, terms, or redlines on an already-sent proposal.",
		"   - CLOSED_WON (Won): Explicit confirmation that deal is signed, paid, or closed.",
		"   - CLOSED_LOST (Lost): Explicit confirmation that deal was lost, cancelled, or passed.",
		"   GUARD: A deal whose next task is 'schedule a demo' or 'send quotation' CANNOT be in DECISION_MAKER_BOUGHT_IN or CONTRACT_SENT. For stageSuggestion.evidence, cite the exact quote that justifies this stage.",
		"8. NEXT STEP:",
		"   - 'value': next step description",
		"   - 'owner': 'us' or 'lead'",
		"   - 'dueAt': stated timeframe, e.g. '1 hour', 'Saturday 11 AM' (or null)",
		"9. LANGUAGE: Detect the customer's language for 'languagePreference' (e.g. 'English', 'Spanish', 'German', 'Hindi', etc.).",
		"",
		"Return a JSON object conforming exactly to this schema:",
		JSON.stringify(
			{
				contact: {
					name: {
						value: participantInfo.lead,
						evidence: {
							sourceKind: "whatsapp.message",
							speaker: "lead",
							quote: "Exact quote",
							lineNos: [2],
						},
					},
					phone: { value: null, evidence: null },
					role: { value: null, evidence: null },
				},
				company: {
					name: {
						value: null,
						evidence: null,
					},
					city: {
						value: null,
						evidence: null,
					},
				},
				deal: {
					need: {
						value: "Need description",
						evidence: {
							sourceKind: "whatsapp.message",
							speaker: "lead",
							quote: "Exact quote",
							lineNos: [3],
						},
					},
					quantity: {
						value: "150 pieces",
						evidence: {
							sourceKind: "whatsapp.message",
							speaker: "lead",
							quote: "Exact quote",
							lineNos: [4],
						},
					},
					leadBudget: {
						value: null,
						evidence: null,
					},
					quotedValue: {
						value: null,
						evidence: null,
					},
					currency: {
						value: "USD",
						evidence: {
							sourceKind: "whatsapp.message",
							speaker: "lead",
							quote: "Exact quote",
							lineNos: [9],
						},
					},
					timeline: {
						value: "2 weeks",
						evidence: {
							sourceKind: "whatsapp.message",
							speaker: "lead",
							quote: "Exact quote",
							lineNos: [10],
						},
					},
					stageSuggestion: {
						value: "CONTRACT_SENT",
						evidence: {
							sourceKind: "agent.inference",
							speaker: "us",
							quote: "Exact quote",
							lineNos: [17],
						},
					},
				},
				languagePreference: {
					value: "English",
					evidence: {
						sourceKind: "agent.inference",
						speaker: "lead",
						quote: "Exact quote",
						lineNos: [2],
					},
				},
				objections: [
					{
						objection: "Objection description",
						evidence: {
							sourceKind: "whatsapp.message",
							speaker: "lead",
							quote: "Exact quote",
							lineNos: [12],
						},
					},
				],
				nextStep: {
					value: "Next step description",
					owner: "us",
					dueAt: "1 hour",
					evidence: {
						sourceKind: "whatsapp.message",
						speaker: "us",
						quote: "Exact quote",
						lineNos: [17],
					},
				},
				sentiment: {
					value: "positive",
					evidence: {
						sourceKind: "agent.inference",
						speaker: "lead",
						quote: "Exact quote",
						lineNos: [16],
					},
				},
			},
			null,
			2,
		),
	].join("\n");

	const { ai, model } = getSmartClient();

	let response: any;
	for (let attempt = 0; attempt < GEMINI_RETRY.attempts; attempt++) {
		try {
			response = await ai.models.generateContent({
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
					temperature: 0,
					abortSignal: AbortSignal.timeout(90000),
				},
			});
			break;
		} catch (err: unknown) {
			const errorObj = err as {
				status?: number;
				message?: string;
				name?: string;
			} | null;
			const isAbort =
				errorObj?.name === "AbortError" || String(err).includes("aborted");
			const isRateLimit =
				errorObj?.status === 429 ||
				String(errorObj?.message || "").includes("429") ||
				String(errorObj?.message || "").includes("RESOURCE_EXHAUSTED");
			if (attempt < GEMINI_RETRY.attempts - 1 && (isRateLimit || isAbort)) {
				await new Promise((resolve) =>
					setTimeout(resolve, GEMINI_RETRY.baseDelayMs * 2 ** attempt),
				);
				continue;
			}
			throw err;
		}
	}

	const parsed = extractionJson.parse(response.text?.trim() || "{}");

	const facts = normalizeExtractedFacts(parsed, participantInfo);

	const lastMessageDate =
		messages.length > 0
			? (messages[messages.length - 1]?.timestamp ?? new Date())
			: new Date();

	const validationSummary = validateAndEnrichFacts(
		facts,
		messages,
		participantInfo.me,
		participantInfo.lead,
		lastMessageDate,
		"Z",
		input.workspaceName,
	);

	return { facts, validationSummary };
}

const SOURCE_KINDS = [
	"whatsapp.message",
	"email.message",
	"slack.message",
	"meeting.transcript",
	"form.submission",
	"voice.transcript",
	"voice.live-call",
	"agent.inference",
] as const satisfies readonly EvidenceSourceKind[];

const text = z.union([z.string(), z.number()]).transform(String);

// Amounts sometimes come back as "4,50,000"; anything else non-numeric is null.
const amount = z.union([
	z.number(),
	z
		.string()
		.regex(/^[\d.,\s]+$/)
		.transform((value) => Number(value.replace(/[,\s]/g, ""))),
]);

const evidenceShape = z.object({
	sourceKind: z.enum(SOURCE_KINDS).catch("whatsapp.message"),
	speaker: z.enum(["lead", "us"]).optional().catch(undefined),
	quote: text.catch(""),
	lineNos: z.array(z.number()).optional().catch(undefined),
	audioRange: z
		.object({ start: z.string(), end: z.string() })
		.optional()
		.catch(undefined),
});

type ParsedEvidence = z.infer<typeof evidenceShape>;

const evidenceField = evidenceShape.nullable().optional().catch(null);

function withSpeaker(
	evidence: ParsedEvidence | null | undefined,
	defaultSpeaker: EvidenceSpeaker,
): EvidenceRef | null {
	if (!evidence) return null;
	return { ...evidence, speaker: evidence.speaker ?? defaultSpeaker };
}

/** `{ value, evidence }` from the model; a missing or null value means no fact. */
function factField<T extends z.ZodType>(value: T) {
	return z
		.object({
			value: value.nullable().optional().catch(null),
			evidence: evidenceField,
		})
		.nullable()
		.optional()
		.catch(null);
}

const stringFact = factField(text);
const amountFact = factField(amount);

const extractionResponse = z
	.object({
		contact: z
			.object({ name: stringFact, phone: stringFact, role: stringFact })
			.partial()
			.catch({}),
		company: z
			.object({ name: stringFact, city: stringFact })
			.partial()
			.catch({}),
		deal: z
			.object({
				need: stringFact,
				quantity: factField(z.union([z.string(), z.number()])),
				leadBudget: amountFact,
				quotedValue: amountFact,
				currency: stringFact,
				timeline: stringFact,
				stageSuggestion: factField(z.enum(DealStage)),
			})
			.partial()
			.catch({}),
		languagePreference: stringFact,
		objections: z
			.array(
				z
					.object({ objection: text, evidence: evidenceField })
					.nullable()
					.catch(null),
			)
			.catch([]),
		nextStep: z
			.object({
				value: text.nullable().optional().catch(null),
				owner: z.enum(["us", "lead"]).nullable().optional().catch(null),
				evidence: evidenceField,
			})
			.partial()
			.catch({}),
		sentiment: factField(z.enum(["positive", "neutral", "negative"])),
	})
	.partial()
	.catch({});

/** Gemini's JSON text, parsed and shaped in one step. */
const extractionJson = z
	.string()
	.transform((raw, ctx) => {
		try {
			return JSON.parse(raw);
		} catch {
			ctx.addIssue({ code: "custom", message: "Extraction was not JSON." });
			return z.NEVER;
		}
	})
	.pipe(extractionResponse);

type ExtractionResponse = z.infer<typeof extractionResponse>;

function toField<T>(
	field:
		| { value?: T | null; evidence?: ParsedEvidence | null }
		| null
		| undefined,
	defaultSpeaker: EvidenceSpeaker,
): ExtractedField<T | null> {
	if (field?.value === null || field?.value === undefined) {
		return { value: null, evidence: null };
	}
	return {
		value: field.value,
		evidence: withSpeaker(field.evidence, defaultSpeaker),
	};
}

function normalizeExtractedFacts(
	data: ExtractionResponse,
	participantInfo: {
		me: string;
		lead: string;
		confidence: number;
		autoDetected: boolean;
	},
): ExtractedLeadFacts {
	const contact = data.contact ?? {};
	const company = data.company ?? {};
	const deal = data.deal ?? {};
	const nextStep = data.nextStep ?? {};

	const objections: LeadObjection[] = (data.objections ?? []).flatMap((item) =>
		item?.objection
			? [
					{
						objection: item.objection,
						evidence: withSpeaker(item.evidence, "lead") ?? {
							sourceKind: "whatsapp.message",
							speaker: "lead",
							quote: "",
						},
					},
				]
			: [],
	);

	return {
		contact: {
			name: toField(contact.name, "lead"),
			phone: toField(contact.phone, "lead"),
			role: toField(contact.role, "lead"),
		},
		company: {
			name: toField(company.name, "lead"),
			city: toField(company.city, "lead"),
		},
		deal: {
			need: toField(deal.need, "lead"),
			quantity: toField(deal.quantity, "lead"),
			leadBudget: toField(deal.leadBudget, "lead"),
			quotedValue: toField(deal.quotedValue, "us"),
			currency: toField(deal.currency, "lead"),
			timeline: toField(deal.timeline, "lead"),
			timelineResolved: null,
			stageSuggestion: toField(deal.stageSuggestion, "us"),
		},
		languagePreference: toField(data.languagePreference, "lead"),
		objections,
		nextStep: {
			value: nextStep.value ?? null,
			owner: nextStep.owner ?? null,
			dueAt: null,
			evidence: withSpeaker(nextStep.evidence, "us"),
		},
		sentiment: toField(data.sentiment, "lead"),
		participants: participantInfo,
	};
}

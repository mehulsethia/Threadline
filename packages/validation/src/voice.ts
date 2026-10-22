import { z } from "zod";

export const VOICE_CATEGORIES = [
	"budget",
	"authority",
	"need",
	"timeline",
	"competitors",
	"decision_process",
] as const;

export const voiceCategory = z.enum(VOICE_CATEGORIES);

export type VoiceCategory = z.infer<typeof voiceCategory>;

export const voiceDealContext = z.object({
	dealId: z.string(),
	dealName: z.string(),
	leadName: z.string(),
	leadPhone: z.string().nullable(),
	leadEmail: z.string().nullable(),
	companyName: z.string().nullable(),
	language: z.string(),
	knownFacts: z.record(z.string(), z.string()),
	missingCategories: z.array(voiceCategory),
	currentStage: z.string(),
	proposedStage: z.string().nullable(),
	qualificationScore: z.number(),
});

export type VoiceDealContext = z.infer<typeof voiceDealContext>;

export const voiceRecordedFact = z.object({
	category: voiceCategory,
	fact: z.string(),
	quote: z.string(),
});

export type VoiceRecordedFact = z.infer<typeof voiceRecordedFact>;

export const voiceTranscribeResult = z.object({
	dealId: z.string(),
	transcript: z.string(),
	recordedFacts: z.array(voiceRecordedFact),
	proposedScore: z.number(),
	proposedStage: z.string().nullable(),
});

export type VoiceTranscribeResult = z.infer<typeof voiceTranscribeResult>;

export const voiceDealRequest = z.object({ dealId: z.string().min(1) });

export const voiceTranscribeRequest = z.object({
	dealId: z.string().min(1),
	audioBase64: z.string().min(1),
	mimeType: z.string().default("audio/webm"),
});

export type VoiceTranscribeRequest = z.infer<typeof voiceTranscribeRequest>;

export const voiceClientMessage = z.discriminatedUnion("type", [
	z.object({ type: z.literal("audio"), pcm: z.string().min(1) }),
	z.object({ type: z.literal("text"), text: z.string().min(1) }),
	z.object({ type: z.literal("end_call") }),
]);

export type VoiceClientMessage = z.infer<typeof voiceClientMessage>;

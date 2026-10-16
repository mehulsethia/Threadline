import { z } from "zod";

export const voiceCategoryEnum = z.enum([
	"budget",
	"authority",
	"need",
	"timeline",
	"competitors",
	"decision_process",
]);

export type VoiceCategory = z.infer<typeof voiceCategoryEnum>;

export const voiceDealContextInput = z.object({
	dealId: z.string().min(1),
});

export type VoiceDealContextInput = z.infer<typeof voiceDealContextInput>;

export const voiceDealContextOutput = z.object({
	dealId: z.string(),
	dealName: z.string(),
	leadName: z.string(),
	leadPhone: z.string().nullable(),
	leadEmail: z.string().nullable(),
	companyName: z.string().nullable(),
	language: z.string(),
	knownFacts: z.record(z.string(), z.string()),
	missingCategories: z.array(voiceCategoryEnum),
	currentStage: z.string(),
	proposedStage: z.string().nullable(),
	qualificationScore: z.number(),
});

export type VoiceDealContextOutput = z.infer<typeof voiceDealContextOutput>;

export const voiceTranscribeQualifyInput = z.object({
	dealId: z.string().min(1),
	audioBase64: z.string().min(1),
	mimeType: z.string().default("audio/webm"),
});

export type VoiceTranscribeQualifyInput = z.infer<
	typeof voiceTranscribeQualifyInput
>;

export const voiceTranscribeQualifyOutput = z.object({
	dealId: z.string(),
	transcript: z.string(),
	recordedFacts: z.array(
		z.object({
			category: voiceCategoryEnum,
			fact: z.string(),
			quote: z.string(),
		}),
	),
	proposedScore: z.number(),
	proposedStage: z.string().nullable(),
});

export type VoiceTranscribeQualifyOutput = z.infer<
	typeof voiceTranscribeQualifyOutput
>;

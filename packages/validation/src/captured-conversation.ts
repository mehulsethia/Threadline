import { z } from "zod";

export const CAPTURE_SOURCES = ["email", "slack", "meeting"] as const;

export type CaptureSource = (typeof CAPTURE_SOURCES)[number];

export const capturedMessage = z.object({
	lineNo: z.number().int().positive(),
	timestamp: z.coerce.date(),
	sender: z.string().min(1),
	text: z.string(),
});

export type CapturedMessage = z.infer<typeof capturedMessage>;

export const capturedTranscript = z.array(capturedMessage);

export function parseCapturedTranscript(value: unknown): CapturedMessage[] {
	return capturedTranscript.parse(value);
}

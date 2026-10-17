import { z } from "zod";

export const RECORDER_PROVIDERS = ["fireflies", "fathom"] as const;

export const recorderProvider = z.enum(RECORDER_PROVIDERS);

export const recorderStatusOutput = z.object({
	providers: z.array(
		z.object({
			provider: recorderProvider,
			connected: z.boolean(),
			hint: z.string().nullable(),
		}),
	),
	lastSyncedAt: z.string().nullable(),
});

export const recorderSetKeyInput = z.object({
	provider: recorderProvider,
	apiKey: z.string().trim().min(8).max(500),
});

export const recorderRemoveKeyInput = z.object({
	provider: recorderProvider,
});

export const recorderSyncOutput = z.object({ queued: z.boolean() });

export type RecorderStatus = z.infer<typeof recorderStatusOutput>;
export type RecorderProvider = z.infer<typeof recorderProvider>;

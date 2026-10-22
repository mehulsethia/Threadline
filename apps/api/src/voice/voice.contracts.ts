import {
	voiceDealContext,
	voiceDealRequest,
	voiceTranscribeRequest,
	voiceTranscribeResult,
} from "@crm/validation/voice";
import { z } from "zod";

export const voiceDealContextInput = voiceDealRequest;

export const voiceDealContextOutput = voiceDealContext;

export const voiceTranscribeQualifyInput = voiceTranscribeRequest;

export const voiceTranscribeQualifyOutput = voiceTranscribeResult;

export const voiceLiveTicketOutput = z.object({
	ticket: z.string(),
	wsUrl: z.string(),
});

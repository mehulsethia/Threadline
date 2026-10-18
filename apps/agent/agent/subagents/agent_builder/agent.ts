import { createVertex } from "@ai-sdk/google-vertex";
import { defineAgent } from "eve";
import { z } from "zod";

const vertex = createVertex({
	project: process.env.GOOGLE_CLOUD_PROJECT,
	location: process.env.GEMINI_FAST_LOCATION || "global",
});

export default defineAgent({
	description:
		"Turn one private CRM builder-chat request into a validated, reviewable team-agent version without deploying it.",
	model: vertex(process.env.GEMINI_FAST_MODEL || "gemini-4-argon"),
	modelContextWindowTokens: 1_000_000,
	outputSchema: z.object({
		status: z.literal("draft_ready"),
		summary: z.string().min(1).max(1000),
		agentId: z.string().min(1),
		versionId: z.string().min(1),
	}),
	limits: {
		maxInputTokensPerSession: 100_000,
		maxOutputTokensPerSession: 10_000,
		sessionTimeoutMs: 24 * 60 * 60 * 1000,
	},
});

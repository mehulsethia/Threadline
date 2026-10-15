import "@crm/env/load";

import { createVertex } from "@ai-sdk/google-vertex";
import { onTelemetryProblem, syncVersion } from "@crm/telemetry";
import { defineAgent } from "eve";
import { logCapabilities } from "./lib/capabilities";

void logCapabilities();

onTelemetryProblem((message) => console.debug(`[telemetry] ${message}`));

void syncVersion();

const vertex = createVertex({
	project: process.env.GOOGLE_CLOUD_PROJECT,
	location: process.env.GOOGLE_CLOUD_LOCATION || "us-central1",
});

export default defineAgent({
	model: vertex(process.env.GEMINI_FAST_MODEL || "gemini-2.5-flash"),
	modelContextWindowTokens: 1_000_000,
	limits: {
		maxInputTokensPerSession: 500_000,
		maxOutputTokensPerSession: 50_000,
		sessionTimeoutMs: 30 * 24 * 60 * 60 * 1000,
	},
});

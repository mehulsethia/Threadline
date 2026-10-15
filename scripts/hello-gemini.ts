import "../packages/env/src/load.ts";

import { GoogleGenAI } from "@google/genai";

async function main(): Promise<void> {
	const model = process.env.GEMINI_FAST_MODEL || "gemini-2.5-flash";
	const project = process.env.GOOGLE_CLOUD_PROJECT;
	const location = process.env.GOOGLE_CLOUD_LOCATION || "us-central1";

	const ai = new GoogleGenAI({
		vertexai: true,
		project,
		location,
	});

	const response = await ai.models.generateContent({
		model,
		contents: "Hello! Respond with a single concise sentence acknowledging you are running on Google Cloud Vertex AI.",
	});

	console.log(`[Vertex AI Model]: ${model}`);
	console.log(`[Project]: ${project}`);
	console.log(`[Location]: ${location}`);
	console.log(`[Response]: ${response.text?.trim()}`);
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});

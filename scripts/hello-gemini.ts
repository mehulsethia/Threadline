import "../packages/env/src/load.ts";

import { GoogleGenAI } from "@google/genai";

async function verifyModel(
	role: string,
	model: string,
	location: string,
	project: string,
	isLive = false,
): Promise<void> {
	const ai = new GoogleGenAI({
		vertexai: true,
		project,
		location,
	});

	console.log(`\n=== Verifying ${role} Model ===`);
	console.log(`[Role]: ${role}`);
	console.log(`[Model]: ${model}`);
	console.log(`[Location]: ${location}`);
	console.log(`[Project]: ${project}`);

	if (isLive) {
		const meta = await ai.models.get({ model });
		console.log(`[Status]: Verified via Vertex AI models.get`);
		console.log(`[Resource Name]: ${meta.name}`);
		return;
	}

	const response = await ai.models.generateContent({
		model,
		contents:
			"Respond with exactly one short sentence confirming your model name and that you are running on Google Cloud Vertex AI.",
	});

	console.log(`[Status]: Verified via Vertex AI generateContent`);
	console.log(`[Response]: ${response.text?.trim()}`);
}

async function main(): Promise<void> {
	const project = process.env.GOOGLE_CLOUD_PROJECT || "project-e705af63-271f-48bf-92f";
	const defaultLocation = process.env.GOOGLE_CLOUD_LOCATION || "us-central1";

	const fastModel = process.env.GEMINI_FAST_MODEL || "gemini-2.5-flash";
	const fastLocation = process.env.GEMINI_FAST_LOCATION || defaultLocation;

	const smartModel = process.env.GEMINI_SMART_MODEL || "gemini-4-argon";
	const smartLocation = process.env.GEMINI_SMART_LOCATION || "global";

	const liveModel =
		process.env.GEMINI_LIVE_MODEL || "gemini-live-2.5-flash-native-audio";
	const liveLocation = process.env.GEMINI_LIVE_LOCATION || defaultLocation;

	await verifyModel("FAST", fastModel, fastLocation, project);
	await verifyModel("SMART", smartModel, smartLocation, project);
	await verifyModel("LIVE", liveModel, liveLocation, project, true);
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});

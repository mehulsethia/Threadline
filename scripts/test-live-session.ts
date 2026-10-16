import "../packages/env/src/load.ts";
import { GoogleGenAI } from "@google/genai";

async function testLive(location: string, model: string): Promise<boolean> {
	const project =
		process.env.GOOGLE_CLOUD_PROJECT || "project-e705af63-271f-48bf-92f";
	console.log(`\nTesting Live session in location "${location}" with model "${model}"...`);

	try {
		const ai = new GoogleGenAI({
			vertexai: true,
			project,
			location,
		});

		let session: any;
		await new Promise<void>((resolve, reject) => {
			const timeout = setTimeout(() => {
				if (session) {
					try {
						session.close();
					} catch {}
				}
				reject(new Error(`Timed out after 15s connecting to ${location} with ${model}`));
			}, 15000);

			ai.live
				.connect({
					model,
					config: {
						responseModalities: ["AUDIO"],
					},
					callbacks: {
						onopen: () => {
							console.log(`[SUCCESS] Live WebSocket open in location "${location}"!`);
						},
						onmessage: (msg: any) => {
							console.log(`[RECEIVED MESSAGE]:`, Object.keys(msg));
							if (msg.setupComplete || msg.serverContent) {
								console.log(`[VERIFIED] Setup complete / server content received.`);
								clearTimeout(timeout);
								resolve();
							}
						},
						onerror: (err: any) => {
							console.log(`[ERROR in ${location}]:`, err?.message || err);
							clearTimeout(timeout);
							reject(err);
						},
						onclose: (e: any) => {
							console.log(`[CLOSED in ${location}]: code=${e?.code}, reason=${e?.reason}`);
						},
					},
				})
				.then((s) => {
					session = s;
				})
				.catch((err) => {
					clearTimeout(timeout);
					reject(err);
				});
		});

		if (session) {
			try {
				session.close();
			} catch {}
		}
		return true;
	} catch (err: any) {
		console.log(`Failed in ${location} with model ${model}:`, err?.message || err);
		return false;
	}
}

async function main() {
	const candidates = [
		{ location: "us-central1", model: process.env.GEMINI_LIVE_MODEL || "gemini-live-2.5-flash-native-audio" },
		{ location: "us-central1", model: "gemini-2.0-flash-exp" },
		{ location: "us-central1", model: "gemini-2.0-flash-live-preview-04-09" },
		{ location: "us-east4", model: process.env.GEMINI_LIVE_MODEL || "gemini-live-2.5-flash-native-audio" },
		{ location: "global", model: process.env.GEMINI_LIVE_MODEL || "gemini-live-2.5-flash-native-audio" },
	];

	for (const { location, model } of candidates) {
		const ok = await testLive(location, model);
		if (ok) {
			console.log(`\n>>> WINNING CONFIG: location="${location}", model="${model}" <<<`);
			process.exit(0);
		}
	}

	console.error("All candidates failed.");
	process.exit(1);
}

main();

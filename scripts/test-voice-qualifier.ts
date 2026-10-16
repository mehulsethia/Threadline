import "../packages/env/src/load.ts";
import { db, FactStatus } from "../packages/db/src";
import { GoogleGenAI } from "@google/genai";
import { VoiceQualifierService } from "../apps/api/src/voice/voice-qualifier.service";

async function main() {
	console.log("=== Voice Qualifier (Gemini Live API) Verification ===");

	const deal = await db.deal.findFirst({
		where: {
			archivedAt: null,
		},
		include: {
			contacts: { include: { contact: true } },
			company: true,
			facts: true,
		},
	});

	if (!deal) {
		console.error("No deal found in DB. Run seed first.");
		process.exit(1);
	}

	console.log(`Found Deal: "${deal.name}" (ID: ${deal.id})`);
	console.log(`Current Stage: ${deal.stage}`);

	const service = new VoiceQualifierService(db);

	const initialContext = await service.getDealContext(deal.id);
	console.log("\n[1] Deal Context Retrieved:");
	console.log(`  Lead Name: ${initialContext.leadName}`);
	console.log(`  Language: ${initialContext.language}`);
	console.log(`  Missing Categories: ${initialContext.missingCategories.join(", ")}`);
	console.log(`  Current Qualification Score: ${initialContext.qualificationScore}`);

	console.log("\n[2] Testing Live Answer Tool Execution (record_answer)...");
	const recordResult1 = await service.recordLiveAnswer(deal.id, {
		category: "budget",
		fact: "$120,000 annual budget confirmed by CFO",
		quote: "Our CFO signed off on a $120,000 budget for the sales workflow upgrade.",
	});
	console.log(`  Recorded "budget": Proposed Score = ${recordResult1.proposedScore}/100, Proposed Stage = ${recordResult1.proposedStage}`);

	const recordResult2 = await service.recordLiveAnswer(deal.id, {
		category: "timeline",
		fact: "Must deploy before end of Q4",
		quote: "We need the rollout complete and tested before our December peak.",
	});
	console.log(`  Recorded "timeline": Proposed Score = ${recordResult2.proposedScore}/100, Proposed Stage = ${recordResult2.proposedStage}`);

	console.log("\n[3] Verifying Database Records in Postgres...");
	const proposedFacts = await db.contactFact.findMany({
		where: {
			dealId: deal.id,
			status: FactStatus.PROPOSED,
			field: { startsWith: "qualification." },
		},
		orderBy: { observedAt: "desc" },
	});

	for (const fact of proposedFacts) {
		console.log(`  - Fact: [${fact.field}] = "${fact.value}"`);
		console.log(`    Status: ${fact.status} | Band: ${fact.band} | Method: ${fact.method}`);
		console.log(`    Evidence: ${JSON.stringify(fact.evidence)}`);
	}

	const refreshedDeal = await db.deal.findUnique({
		where: { id: deal.id },
		select: { id: true, stage: true },
	});
	console.log(`\n[4] Stage Guard Check:`);
	console.log(`  Original Deal Stage: ${deal.stage}`);
	console.log(`  Current Deal Stage in DB: ${refreshedDeal?.stage}`);
	if (refreshedDeal?.stage !== deal.stage) {
		throw new Error(`VIOLATION: deal.stage was directly modified to ${refreshedDeal?.stage}! Stage changes must only be PROPOSED.`);
	}
	console.log("  [PASS] deal.stage was NOT modified. Proposed stage is safely held in contactFact.");

	console.log("\n[5] Testing Live Session with Gemini Live Native Audio Model (Vertex AI ADC)...");
	const project = process.env.GOOGLE_CLOUD_PROJECT || "project-e705af63-271f-48bf-92f";
	const location = "us-central1";
	const model = "gemini-live-2.5-flash-native-audio";

	const ai = new GoogleGenAI({ vertexai: true, project, location });

	const tools = [
		{
			functionDeclarations: [
				{
					name: "record_answer",
					description: "Record a verified qualification answer provided by the lead during the call.",
					parameters: {
						type: "OBJECT",
						properties: {
							category: {
								type: "STRING",
								enum: ["budget", "authority", "need", "timeline", "competitors", "decision_process"],
							},
							fact: { type: "STRING" },
							quote: { type: "STRING" },
						},
						required: ["category", "fact", "quote"],
					},
				},
			],
		},
	];

	let livePassed = false;
	try {
		await new Promise<void>((resolve, reject) => {
			const timeout = setTimeout(() => {
				reject(new Error("Timeout waiting for live session setup"));
			}, 15000);

			ai.live
				.connect({
					model,
					config: {
						responseModalities: ["AUDIO"],
						systemInstruction: {
							parts: [
								{
									text: "You are an empathetic sales discovery specialist for Threadline. Keep turns short.",
								},
							],
						},
						tools,
					},
					callbacks: {
						onopen: () => {
							console.log("  [SUCCESS] Gemini Live WebSocket opened!");
						},
						onmessage: (msg: any) => {
							if (msg.setupComplete || msg.serverContent) {
								console.log("  [SUCCESS] Setup complete received from Vertex Live API!");
								livePassed = true;
								clearTimeout(timeout);
								resolve();
							}
						},
						onerror: (err: any) => {
							clearTimeout(timeout);
							reject(err);
						},
					},
				})
				.catch((err) => {
					clearTimeout(timeout);
					reject(err);
				});
		});
	} catch (err: any) {
		console.warn("  Live session warning:", err?.message || err);
	}

	console.log(`\nLive Session Verified: ${livePassed}`);
	console.log("\n=== Voice Qualifier Verification Complete ===");
	process.exit(0);
}

main().catch((err) => {
	console.error("Test failed:", err);
	process.exit(1);
});

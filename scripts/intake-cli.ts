import "../packages/env/src/load.ts";

import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";
import {
	type AudioTranscriptionResult,
	extractLeadFacts,
	transcribeAudio,
} from "../apps/agent/adk/extraction";
import { parseWhatsAppExport } from "../packages/validation/src/whatsapp-parser";

const AUDIO_EXTENSIONS = new Set([
	"opus",
	"m4a",
	"mp3",
	"wav",
	"ogg",
	"aac",
	"flac",
]);

function isAudioFile(path: string): boolean {
	const ext = path.toLowerCase().split(".").pop();
	return ext ? AUDIO_EXTENSIONS.has(ext) : false;
}

function parseCliArgs(): { targetPath: string; me?: string } {
	const args = process.argv.slice(2);
	let targetPath = "";
	let me: string | undefined;

	for (let i = 0; i < args.length; i++) {
		const arg = args[i] ?? "";
		if (arg === "--me" && i + 1 < args.length) {
			me = args[i + 1];
			i++;
		} else if (!targetPath && !arg.startsWith("--")) {
			targetPath = arg;
		}
	}

	return { targetPath, me };
}

async function main(): Promise<void> {
	const { targetPath, me } = parseCliArgs();

	if (!targetPath) {
		console.error(
			"Usage: bun run scripts/intake-cli.ts <path-to-zip-or-txt-or-audio> [--me '<name or phone>']",
		);
		process.exit(1);
	}

	const absolutePath = resolve(process.cwd(), targetPath);

	if (!existsSync(absolutePath)) {
		console.error(`File not found: ${absolutePath}`);
		process.exit(1);
	}

	const stats = statSync(absolutePath);
	if (!stats.isFile()) {
		console.error(`Target path is not a file: ${absolutePath}`);
		process.exit(1);
	}

	if (isAudioFile(absolutePath)) {
		const transcript = await transcribeAudio(absolutePath);
		const { facts, validationSummary } = await extractLeadFacts({
			transcript,
			me,
		});

		console.log(JSON.stringify(facts, null, 2));
		console.log("\n=== Validation Summary ===");
		console.log(`Verified: ${validationSummary.verified}`);
		console.log(`LineNos Fixed: ${validationSummary.fixed}`);
		console.log(`Downgraded to inference: ${validationSummary.downgraded}`);
		return;
	}

	const parsed = parseWhatsAppExport(absolutePath);

	let combinedTranscript: AudioTranscriptionResult | undefined;

	if (parsed.attachments) {
		const audioFiles = Object.keys(parsed.attachments).filter((k) =>
			isAudioFile(k),
		);

		for (const audioFilename of audioFiles) {
			const audioBytes = parsed.attachments[audioFilename];
			if (!audioBytes) continue;

			const result = await transcribeAudio({
				buffer: audioBytes,
				filename: audioFilename,
			});

			if (!combinedTranscript) {
				combinedTranscript = result;
			} else {
				combinedTranscript.fullTranscript += `\n${result.fullTranscript}`;
				combinedTranscript.segments.push(...result.segments);
			}
		}
	}

	const { facts, validationSummary } = await extractLeadFacts({
		messages: parsed.messages,
		transcript: combinedTranscript,
		me,
	});

	console.log(JSON.stringify(facts, null, 2));

	console.log("\n=== Participants ===");
	console.log(`Us (CRM user): "${facts.participants.me}"`);
	console.log(`Lead (Customer): "${facts.participants.lead}"`);
	console.log(
		`Auto-detected: ${facts.participants.autoDetected} (confidence: ${facts.participants.confidence})`,
	);

	console.log("\n=== Validation Summary ===");
	console.log(`Verified: ${validationSummary.verified}`);
	console.log(`LineNos Fixed: ${validationSummary.fixed}`);
	console.log(`Downgraded to inference: ${validationSummary.downgraded}`);

	const adjustments = validationSummary.details.filter(
		(d) => d.status !== "verified",
	);
	if (adjustments.length > 0) {
		console.log("\nAdjustments:");
		for (const adj of adjustments) {
			console.log(
				`  - [${adj.status.toUpperCase()}] ${adj.field}: ${adj.reason ?? ""}`,
			);
		}
	}
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});

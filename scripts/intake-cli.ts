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

async function main(): Promise<void> {
	const targetPath = process.argv[2];

	if (!targetPath) {
		console.error(
			"Usage: bun run scripts/intake-cli.ts <path-to-zip-or-txt-or-audio>",
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
		const facts = await extractLeadFacts({ transcript });
		console.log(JSON.stringify(facts, null, 2));
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

	const facts = await extractLeadFacts({
		messages: parsed.messages,
		transcript: combinedTranscript,
	});

	console.log(JSON.stringify(facts, null, 2));
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});

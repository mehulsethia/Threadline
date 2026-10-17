import { strFromU8, unzipSync } from "fflate";

export type TranscriptTurn = {
	lineNo: number;
	timestamp: Date;
	sender: string;
	text: string;
};

export type ParsedTranscript = {
	turns: TranscriptTurn[];
	speakers: string[];
	plainText: string;
};

const TURN =
	/^\s*(?:\[?\(?(\d{1,2}:\d{2}(?::\d{2})?)\)?\]?\s*[-–]?\s*)?([A-Za-zÀ-ÿ0-9][\wÀ-ÿ .'’()&@-]{0,48}?)\s*(?:\((\d{1,2}:\d{2}(?::\d{2})?)\))?\s*:\s+(.+)$/;

const NOT_SPEAKERS = new Set([
	"http",
	"https",
	"note",
	"notes",
	"date",
	"time",
]);

function seconds(clock: string | undefined): number {
	if (!clock) return 0;
	return clock.split(":").reduce((total, part) => total * 60 + Number(part), 0);
}

export function docxText(bytes: Uint8Array): string {
	const files = unzipSync(bytes, {
		filter: (file) => file.name === "word/document.xml",
	});
	const xml = files["word/document.xml"];
	if (!xml) return "";
	return strFromU8(xml)
		.replace(/<w:tab\/>/g, "\t")
		.replace(/<\/w:p>/g, "\n")
		.replace(/<[^>]+>/g, "")
		.replace(/&amp;/g, "&")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&quot;/g, '"')
		.replace(/&apos;/g, "'");
}

export function parseTranscriptText(
	text: string,
	startedAt = new Date(),
): ParsedTranscript {
	const turns: TranscriptTurn[] = [];
	for (const raw of text.replace(/\r\n?/g, "\n").split("\n")) {
		const line = raw.trim();
		if (!line) continue;
		const match = TURN.exec(line);
		const speaker = match?.[2]?.trim();
		if (match && speaker && !NOT_SPEAKERS.has(speaker.toLowerCase())) {
			turns.push({
				lineNo: turns.length + 1,
				timestamp: new Date(
					startedAt.getTime() + seconds(match[1] ?? match[3]) * 1000,
				),
				sender: speaker,
				text: match[4]?.trim() ?? "",
			});
		} else if (turns.length > 0) {
			const last = turns[turns.length - 1];
			if (last) last.text = `${last.text} ${line}`;
		}
	}
	const speakers = [...new Set(turns.map((turn) => turn.sender))];
	return { turns, speakers, plainText: text.trim() };
}

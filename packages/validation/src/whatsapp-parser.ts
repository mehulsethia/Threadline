import { existsSync, readFileSync } from "node:fs";
import { basename } from "node:path";
import { unzipSync } from "fflate";

export type WhatsAppMessageItem = {
	lineNo: number;
	timestamp: Date;
	sender: string;
	text: string;
	attachmentPath?: string;
};

export type ParsedWhatsAppExport = {
	participants: string[];
	messages: WhatsAppMessageItem[];
	attachments?: Record<string, Uint8Array>;
};

const SYSTEM_PREFIXES = [
	"messages and calls are end-to-end encrypted",
	"this chat is with a business account",
	"you created group",
	"created group",
	"security code changed",
	"you're now an admin",
	"waiting for this message",
];

const ANDROID_HEADER =
	/^\u200E?(\d{1,4}[/.-]\d{1,2}[/.-]\d{1,4}),?\s+(\d{1,2}:\d{2}(?::\d{2})?(?:[\s\u202F\u00A0]*[aApP][mM])?)\s+-\s+(.*?)$/;

const IOS_HEADER =
	/^\u200E?\[(\d{1,4}[/.-]\d{1,2}[/.-]\d{1,4}),?\s+(\d{1,2}:\d{2}(?::\d{2})?(?:[\s\u202F\u00A0]*[aApP][mM])?)\]\s+(.*?)$/;

const ATTACHED_TAG_REGEX = /<attached:\s*([^>]+)>/i;
const FILE_ATTACHED_REGEX = /^(.*?)\s*\(file attached\)/i;
const ATTACHED_SUFFIX_REGEX = /^(.*?)\s*<attached>/i;

function cleanControlChars(input: string): string {
	return input.replace(/[\u200E\u200F\uFEFF]/g, "");
}

function detectDateFormat(lines: string[]): "DD/MM" | "MM/DD" {
	for (const rawLine of lines) {
		const line = cleanControlChars(rawLine).trim();
		const match = line.match(ANDROID_HEADER) ?? line.match(IOS_HEADER);
		if (!match?.[1]) continue;

		const parts = match[1].split(/[/.-]/);
		const p0 = parts[0];
		const p1 = parts[1];
		if (p0 !== undefined && p1 !== undefined) {
			const first = parseInt(p0, 10);
			const second = parseInt(p1, 10);
			if (first > 12 && second <= 12) return "DD/MM";
			if (second > 12 && first <= 12) return "MM/DD";
		}
	}
	return "DD/MM";
}

function parseTimestamp(
	dateStr: string,
	timeStr: string,
	dateFormat: "DD/MM" | "MM/DD",
): Date {
	const dateParts = dateStr.split(/[/.-]/);
	let year = 0;
	let month = 0;
	let day = 0;

	const p0 = dateParts[0] ?? "0";
	const p1 = dateParts[1] ?? "0";
	const p2 = dateParts[2] ?? "0";

	if (p0.length === 4) {
		year = parseInt(p0, 10);
		month = parseInt(p1, 10);
		day = parseInt(p2, 10);
	} else {
		let rawYear = parseInt(p2, 10);
		if (rawYear < 100) rawYear += 2000;
		year = rawYear;

		if (dateFormat === "DD/MM") {
			day = parseInt(p0, 10);
			month = parseInt(p1, 10);
		} else {
			month = parseInt(p0, 10);
			day = parseInt(p1, 10);
		}
	}

	const normalizedTime = timeStr.replace(/[\u202F\u00A0]/g, " ").trim();
	const isPM = /pm$/i.test(normalizedTime);
	const isAM = /am$/i.test(normalizedTime);
	const timeWithoutAmPm = normalizedTime.replace(/[aApP][mM]$/i, "").trim();
	const timeParts = timeWithoutAmPm.split(":");

	let hours = parseInt(timeParts[0] ?? "0", 10);
	const minutes = parseInt(timeParts[1] ?? "0", 10);
	const seconds = timeParts[2] ? parseInt(timeParts[2], 10) : 0;

	if (isPM && hours < 12) hours += 12;
	if (isAM && hours === 12) hours = 0;

	return new Date(year, month - 1, day, hours, minutes, seconds);
}

function extractAttachmentPath(text: string): string | undefined {
	const attachedTagMatch = text.match(ATTACHED_TAG_REGEX);
	if (attachedTagMatch?.[1]) {
		return attachedTagMatch[1].trim();
	}

	const fileAttachedMatch = text.match(FILE_ATTACHED_REGEX);
	if (fileAttachedMatch?.[1]) {
		return fileAttachedMatch[1].trim();
	}

	const attachedSuffixMatch = text.match(ATTACHED_SUFFIX_REGEX);
	if (attachedSuffixMatch?.[1]) {
		return attachedSuffixMatch[1].trim();
	}

	return undefined;
}

function isSystemMessage(sender: string, text: string): boolean {
	const lowerSender = sender.toLowerCase();
	const lowerText = text.toLowerCase();

	if (SYSTEM_PREFIXES.some((prefix) => lowerSender.includes(prefix)))
		return true;
	if (SYSTEM_PREFIXES.some((prefix) => lowerText.includes(prefix))) return true;

	return false;
}

function parseTextLines(
	rawText: string,
	attachments?: Record<string, Uint8Array>,
): ParsedWhatsAppExport {
	const lines = rawText.split(/\r?\n/);
	const dateFormat = detectDateFormat(lines);

	const messages: WhatsAppMessageItem[] = [];
	let currentMessage: WhatsAppMessageItem | null = null;

	for (let i = 0; i < lines.length; i++) {
		const originalLine = lines[i] ?? "";
		const cleanLine = cleanControlChars(originalLine).trim();
		const lineNo = i + 1;

		if (!cleanLine && !currentMessage) continue;

		const headerMatch =
			cleanLine.match(ANDROID_HEADER) ?? cleanLine.match(IOS_HEADER);

		if (headerMatch) {
			const dateStr = headerMatch[1];
			const timeStr = headerMatch[2];
			const contentStr = headerMatch[3];

			if (!dateStr || !timeStr || !contentStr) continue;

			const colonIndex = contentStr.indexOf(": ");
			if (colonIndex === -1) continue;

			const sender = contentStr.slice(0, colonIndex).trim();
			const text = contentStr.slice(colonIndex + 2);

			if (isSystemMessage(sender, text)) continue;

			if (currentMessage) {
				messages.push(currentMessage);
				currentMessage = null;
			}

			const timestamp = parseTimestamp(dateStr, timeStr, dateFormat);
			let attachmentPath = extractAttachmentPath(text);

			if (attachmentPath && attachments) {
				const directKey = Object.keys(attachments).find(
					(k) =>
						k === attachmentPath ||
						basename(k) === basename(attachmentPath as string),
				);
				if (directKey) attachmentPath = directKey;
			}

			currentMessage = {
				lineNo,
				timestamp,
				sender,
				text,
				attachmentPath: attachmentPath ?? undefined,
			};
		} else if (currentMessage) {
			currentMessage.text += `\n${cleanControlChars(originalLine)}`;
			if (!currentMessage.attachmentPath) {
				currentMessage.attachmentPath = extractAttachmentPath(
					currentMessage.text,
				);
			}
		}
	}

	if (currentMessage) {
		messages.push(currentMessage);
	}

	const participantSet = new Set<string>();
	for (const msg of messages) {
		participantSet.add(msg.sender);
	}

	return {
		participants: Array.from(participantSet),
		messages,
		...(attachments ? { attachments } : {}),
	};
}

function isZipBuffer(bytes: Uint8Array): boolean {
	return (
		bytes.length >= 4 &&
		bytes[0] === 0x50 &&
		bytes[1] === 0x4b &&
		(bytes[2] === 0x03 || bytes[2] === 0x05 || bytes[2] === 0x07)
	);
}

export function parseWhatsAppExport(
	input: string | Uint8Array | Buffer,
): ParsedWhatsAppExport {
	if (typeof input === "string") {
		const isPathCandidate =
			input.length < 1024 &&
			(input.endsWith(".zip") ||
				input.endsWith(".txt") ||
				input.includes("/") ||
				input.includes("\\"));

		if (isPathCandidate && existsSync(input)) {
			const fileBytes = readFileSync(input);
			if (input.endsWith(".zip") || isZipBuffer(fileBytes)) {
				return parseZipExport(fileBytes);
			}
			return parseTextLines(fileBytes.toString("utf-8"));
		}

		return parseTextLines(input);
	}

	const uint8 =
		input instanceof Uint8Array ? input : new Uint8Array(input as Buffer);

	if (isZipBuffer(uint8)) {
		return parseZipExport(uint8);
	}

	return parseTextLines(new TextDecoder("utf-8").decode(uint8));
}

function parseZipExport(zipBytes: Uint8Array): ParsedWhatsAppExport {
	const unzipped = unzipSync(zipBytes);
	const entries = Object.keys(unzipped);

	const txtFileKey =
		entries.find((k) => k === "_chat.txt") ??
		entries.find(
			(k) => k.toLowerCase().endsWith(".txt") && !k.startsWith("__MACOSX"),
		) ??
		entries.find((k) => k.endsWith(".txt"));

	if (!txtFileKey) {
		throw new Error("No .txt chat export found inside WhatsApp zip file.");
	}

	const chatBytes = unzipped[txtFileKey];
	if (!chatBytes) {
		throw new Error("Unable to read chat text file from zip.");
	}

	const chatText = new TextDecoder("utf-8").decode(chatBytes);
	const attachments: Record<string, Uint8Array> = {};

	for (const key of entries) {
		if (key === txtFileKey || key.startsWith("__MACOSX") || key.endsWith("/"))
			continue;
		const entryData = unzipped[key];
		if (entryData) {
			attachments[key] = entryData;
		}
	}

	return parseTextLines(chatText, attachments);
}

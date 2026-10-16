import { describe, expect, it } from "bun:test";
import { zipSync } from "fflate";
import { parseWhatsAppExport } from "../src/whatsapp-parser";

describe("parseWhatsAppExport - Android format", () => {
	it("parses 24h format with dd/mm/yy and multiline message", () => {
		const raw = [
			"15/10/26, 14:30 - Messages and calls are end-to-end encrypted. No one outside of this chat, not even WhatsApp, can read or listen to them.",
			"15/10/26, 14:32 - Rahul Sharma: Namaste Sir, hume industrial valves chahiye.",
			"Size 2 inch and 3 inch.",
			"Quantity approx 50 pieces.",
			"15/10/26, 14:35 - Amit Patel: Namaste Rahul ji, bilkul mil jayega. Budget kya plan kiya hai?",
		].join("\n");

		const result = parseWhatsAppExport(raw);

		expect(result.participants).toEqual(["Rahul Sharma", "Amit Patel"]);
		expect(result.messages).toHaveLength(2);

		expect(result.messages[0].lineNo).toBe(2);
		expect(result.messages[0].sender).toBe("Rahul Sharma");
		expect(result.messages[0].text).toBe(
			"Namaste Sir, hume industrial valves chahiye.\nSize 2 inch and 3 inch.\nQuantity approx 50 pieces.",
		);
		expect(result.messages[0].timestamp.getHours()).toBe(14);
		expect(result.messages[0].timestamp.getMinutes()).toBe(32);
		expect(result.messages[0].timestamp.getDate()).toBe(15);
		expect(result.messages[0].timestamp.getMonth()).toBe(9);

		expect(result.messages[1].lineNo).toBe(5);
		expect(result.messages[1].sender).toBe("Amit Patel");
		expect(result.messages[1].text).toBe(
			"Namaste Rahul ji, bilkul mil jayega. Budget kya plan kiya hai?",
		);
		expect(result.messages[1].timestamp.getHours()).toBe(14);
		expect(result.messages[1].timestamp.getMinutes()).toBe(35);
	});

	it("parses 12h format with am/pm, media omitted, and attached audio", () => {
		const raw = [
			"15/10/26, 2:30 pm - Rahul Sharma: PTT-20261015-WA0001.opus (file attached)",
			"15/10/26, 2:31 pm - Rahul Sharma: Yeh voice note suniye specifications ke liye.",
			"15/10/26, 2:35 pm - Amit Patel: <Media omitted>",
		].join("\n");

		const result = parseWhatsAppExport(raw);

		expect(result.participants).toEqual(["Rahul Sharma", "Amit Patel"]);
		expect(result.messages).toHaveLength(3);

		expect(result.messages[0].sender).toBe("Rahul Sharma");
		expect(result.messages[0].attachmentPath).toBe("PTT-20261015-WA0001.opus");
		expect(result.messages[0].timestamp.getHours()).toBe(14);
		expect(result.messages[0].timestamp.getMinutes()).toBe(30);

		expect(result.messages[1].attachmentPath).toBeUndefined();

		expect(result.messages[2].sender).toBe("Amit Patel");
		expect(result.messages[2].text).toBe("<Media omitted>");
		expect(result.messages[2].attachmentPath).toBeUndefined();
	});
});

describe("parseWhatsAppExport - iOS format", () => {
	it("parses brackets format with LTR marks, 12h time, and <attached: ...>", () => {
		const raw = [
			"\u200E[15/10/26, 2:30:15 PM] Messages and calls are end-to-end encrypted. No one outside of this chat, not even WhatsApp, can read or listen to them.",
			"\u200E[15/10/26, 2:31:00 PM] Neha Verma: Hello! Need coaching details for JEE batch.",
			"Timing evening rahega?",
			"\u200E[15/10/26, 2:32:10 PM] Career Point: <attached: 00000001-AUDIO-2026-10-15-14-32-10.m4a>",
			"\u200E[15/10/26, 2:33:00 PM] Career Point: Humne brochure and audio brief share kiya hai.",
		].join("\n");

		const result = parseWhatsAppExport(raw);

		expect(result.participants).toEqual(["Neha Verma", "Career Point"]);
		expect(result.messages).toHaveLength(3);

		expect(result.messages[0].lineNo).toBe(2);
		expect(result.messages[0].sender).toBe("Neha Verma");
		expect(result.messages[0].text).toBe(
			"Hello! Need coaching details for JEE batch.\nTiming evening rahega?",
		);
		expect(result.messages[0].timestamp.getHours()).toBe(14);
		expect(result.messages[0].timestamp.getMinutes()).toBe(31);

		expect(result.messages[1].lineNo).toBe(4);
		expect(result.messages[1].sender).toBe("Career Point");
		expect(result.messages[1].attachmentPath).toBe(
			"00000001-AUDIO-2026-10-15-14-32-10.m4a",
		);

		expect(result.messages[2].sender).toBe("Career Point");
		expect(result.messages[2].attachmentPath).toBeUndefined();
	});

	it("detects mm/dd/yy when second component exceeds 12", () => {
		const raw = [
			"[10/25/26, 09:15:00] Buyer: Need urgent delivery.",
			"[10/25/26, 09:20:00] Seller: Delivery scheduled for tomorrow.",
		].join("\n");

		const result = parseWhatsAppExport(raw);

		expect(result.messages).toHaveLength(2);
		expect(result.messages[0].timestamp.getMonth()).toBe(9);
		expect(result.messages[0].timestamp.getDate()).toBe(25);
	});
});

describe("parseWhatsAppExport - Zip handling", () => {
	it("extracts _chat.txt and associates voice note attachments inside zip", () => {
		const chatContent = [
			"[15/10/26, 11:00:00 AM] Vikram Singh: <attached: voice_sample.opus>",
			"[15/10/26, 11:01:00 AM] Vikram Singh: Sun lijiye sir requirement.",
			"[15/10/26, 11:05:00 AM] Sales Rep: OK check karta hu.",
		].join("\n");

		const fakeOpusBytes = new Uint8Array([0x4f, 0x67, 0x67, 0x53, 0x00]);
		const fakeM4aBytes = new Uint8Array([0x00, 0x00, 0x00, 0x20, 0x66]);

		const zipData = zipSync({
			"_chat.txt": new TextEncoder().encode(chatContent),
			"voice_sample.opus": fakeOpusBytes,
			"brochure.m4a": fakeM4aBytes,
		});

		const result = parseWhatsAppExport(zipData);

		expect(result.participants).toEqual(["Vikram Singh", "Sales Rep"]);
		expect(result.messages).toHaveLength(3);
		expect(result.messages[0].attachmentPath).toBe("voice_sample.opus");
		expect(result.attachments).toBeDefined();
		expect(result.attachments?.["voice_sample.opus"]).toEqual(fakeOpusBytes);
		expect(result.attachments?.["brochure.m4a"]).toEqual(fakeM4aBytes);
	});
});

import { describe, expect, it } from "bun:test";
import { parseTranscriptText } from "../src/transcript-parser";

describe("parseTranscriptText", () => {
	it("reads speaker turns with and without timestamps", () => {
		const parsed = parseTranscriptText(
			[
				"[00:01] Priya Shah: We need 200 sensors by March.",
				"Budget is around 40k.",
				"Mehul Sethia (00:15): Great, I will send a quote.",
				"https://example.com is our site",
			].join("\n"),
			new Date("2026-10-01T10:00:00Z"),
		);
		expect(parsed.speakers).toEqual(["Priya Shah", "Mehul Sethia"]);
		expect(parsed.turns[0]?.text).toBe(
			"We need 200 sensors by March. Budget is around 40k.",
		);
		expect(parsed.turns[1]?.timestamp.toISOString()).toBe(
			"2026-10-01T10:00:15.000Z",
		);
	});

	it("returns no turns for prose", () => {
		const parsed = parseTranscriptText("Just a summary of the call.");
		expect(parsed.turns).toHaveLength(0);
	});
});

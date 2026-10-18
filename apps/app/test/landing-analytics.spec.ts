import { describe, expect, it } from "bun:test";
import { analyticsAllowed } from "../lib/analytics";

describe("analyticsAllowed", () => {
	it("keeps analytics off until a new marketing host is configured", () => {
		for (const host of [
			"threadline.example",
			"www.threadline.example",
			"crm.acme.com",
			"localhost",
			"threadline-git-preview.vercel.app",
			"evil-threadline.example",
			"threadline.example.attacker.com",
		]) {
			expect(analyticsAllowed(host)).toBe(false);
		}
	});
});

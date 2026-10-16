import { describe, expect, it } from "bun:test";
import { researchCompany } from "../adk/research/company";

describe("Company Research Entity Verification with Search Grounding", () => {
	it("confidently matches a real company with domain and attaches a structured profile", async () => {
		const result = await researchCompany({
			companyName: "Stripe",
			domain: "stripe.com",
			industryContext:
				"Payment processing software and financial infrastructure APIs",
		});

		expect(result).not.toBeNull();
		if (!result) return;

		expect(result.matchConfidence).toBeGreaterThanOrEqual(0.7);
		expect(result.entityMatched).toBe("Stripe");
		expect(result.overview).toBeDefined();
		expect(typeof result.overview).toBe("string");
		expect(result.overview?.length).toBeGreaterThan(20);
		expect(result.sourceUrls.length).toBeGreaterThan(0);
		expect(result.sizeSignals).toBeDefined();
		expect(result.location).toBeDefined();
	}, 30000);

	it("confidently matches Siemens with domain in conversation", async () => {
		const result = await researchCompany({
			companyName: "Siemens",
			domain: "siemens.com",
			city: "Munich",
			industryContext:
				"Industrial automation, smart infrastructure, and digital industries",
		});

		expect(result).not.toBeNull();
		if (!result) return;

		expect(result.matchConfidence).toBeGreaterThanOrEqual(0.7);
		expect(result.overview).toBeDefined();
		expect(result.sourceUrls.length).toBeGreaterThan(0);
	}, 30000);

	it("rejects match below 0.70 for non-existent or ambiguous company and does not attach profile", async () => {
		const result = await researchCompany({
			companyName: "Datacore Cloud",
			industryContext:
				"Enterprise security monitoring software for Kubernetes clusters",
		});

		expect(result).not.toBeNull();
		if (!result) return;

		expect(result.matchConfidence).toBeLessThan(0.7);
		expect(result.overview).toBeUndefined();
		expect(result.sizeSignals).toBeUndefined();
		expect(result.location).toBeUndefined();
	}, 30000);
});

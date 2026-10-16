import { describe, expect, it } from "bun:test";
import {
	type EvidenceSourceContext,
	stripUnsupportedClaims,
	verifyFactualClaims,
} from "../adk/revival/claim-guard";

describe("Revival Claim Guard", () => {
	it("flags unsupported German claims 'schnelle Bereitstellung' and 'geplanten Demo / vereinbarte Termin'", () => {
		const context: EvidenceSourceContext = {
			facts: [{ field: "language", value: "de" }],
			messages: [
				{
					sender: "Klaus Weber",
					body: "Guten Tag, können Sie uns die genauen Lieferzeiten und Staffelpreise für 500 Einheiten der Hochdruckventile mitteilen?",
				},
			],
			tasks: [],
		};

		const draftText =
			"Guten Tag Herr Weber, vielen Dank für Ihre Nachricht bezüglich der Lieferzeiten und Staffelpreise für die 500 Einheiten der Hochdruckventile. Da diese Details von Ihren spezifischen Anforderungen abhängen, würde ich Ihnen die genauen Konditionen und unsere schnelle Bereitstellung gerne direkt in unserer geplanten Demo vorstellen. Passt der vereinbarte Termin noch für Sie? Mit freundlichen Grüßen, Alex Morgan";

		const result = verifyFactualClaims(draftText, context);

		expect(result.valid).toBe(false);
		expect(result.unsupportedClaims).toContain("schnelle Bereitstellung");
		expect(result.unsupportedClaims).toContain(
			"geplante Demo / vereinbarte Termin",
		);

		const cleaned = stripUnsupportedClaims(draftText, result.unsupportedClaims);
		expect(cleaned.includes("schnelle Bereitstellung")).toBe(false);
		expect(cleaned.includes("geplanten Demo")).toBe(false);
		expect(cleaned.includes("Passt der vereinbarte Termin")).toBe(false);
	});

	it("flags unsupported claims 'high-volume reliability' and 'fast deployment' when not in deal evidence", () => {
		const context: EvidenceSourceContext = {
			facts: [],
			messages: [
				{
					sender: "Oliver Sterling",
					body: "Hi team, we are eager to move forward once the SLA schedule is confirmed.",
				},
			],
			tasks: [{ subject: "Check: Oliver Sterling agreement redlines" }],
		};

		const draftText =
			"Hi Oliver, thank you for your patience. We are reviewing the agreement redlines and finalizing the SLA schedule to ensure it fully supports your high-volume reliability requirements. Would you have a few minutes for a quick call to confirm these final details so we can get you ready for fast deployment? Best regards, Alex Morgan";

		const result = verifyFactualClaims(draftText, context);

		expect(result.valid).toBe(false);
		expect(result.unsupportedClaims).toContain("high-volume reliability");
		expect(result.unsupportedClaims).toContain("fast deployment");

		const cleaned = stripUnsupportedClaims(draftText, result.unsupportedClaims);
		expect(cleaned.includes("high-volume reliability")).toBe(false);
		expect(cleaned.includes("fast deployment")).toBe(false);
	});

	it("validates 'ISO 27001' when present in facts ledger and rejects it when absent", () => {
		const supportedContext: EvidenceSourceContext = {
			facts: [
				{
					field: "securityRequirement",
					value:
						"SOC2 Type II and ISO 27001 certification required before signing",
				},
			],
			messages: [
				{
					sender: "Sarah Jenkins",
					body: "Thanks for sending over the Enterprise Proposal Alex. Our compliance committee is reviewing the SOC2 details.",
				},
			],
			tasks: [],
		};

		const draftText =
			"Hi Sarah, I wanted to check in. Since ISO 27001 and SOC2 Type II certifications are required before signing, please let me know if your team needs additional documentation. Best regards, Alex Morgan";

		const supportedResult = verifyFactualClaims(draftText, supportedContext);
		expect(supportedResult.valid).toBe(true);
		expect(supportedResult.supportedClaims).toContain("ISO 27001");
		expect(supportedResult.supportedClaims).toContain("SOC2 Type II");
		expect(supportedResult.unsupportedClaims).toHaveLength(0);

		const unsupportedContext: EvidenceSourceContext = {
			facts: [
				{ field: "securityRequirement", value: "Basic firewall required" },
			],
			messages: [{ sender: "Sarah Jenkins", body: "Please send proposal." }],
			tasks: [],
		};

		const unsupportedResult = verifyFactualClaims(
			draftText,
			unsupportedContext,
		);
		expect(unsupportedResult.valid).toBe(false);
		expect(unsupportedResult.unsupportedClaims).toContain("ISO 27001");
	});
});

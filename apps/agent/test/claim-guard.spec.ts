import { describe, expect, it } from "bun:test";
import {
	assertGreetingMatchesContact,
	detectContactInboundLanguage,
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

	it("aborts draft when greeting name addresses a different contact (assertion 1)", () => {
		const contact = {
			firstName: "Lena",
			lastName: "Bergström",
			name: "Lena Bergström",
		};

		const mismatchedDraft =
			"Betreff: Nächste Schritte zu Ihrer Anfrage\n\nHallo Frau Rostova,\n\nich wollte kurz nachfragen, ob Sie diese Woche Zeit für die Abstimmung haben.\n\nMit freundlichen Grüßen,\nAlex Miller";

		const mismatchedResult = assertGreetingMatchesContact(
			mismatchedDraft,
			contact,
		);
		expect(mismatchedResult.matches).toBe(false);
		expect(mismatchedResult.greetingLine).toBe("Hallo Frau Rostova,");
		expect(mismatchedResult.reason).toContain("does not match contact name");

		const validFirstNameDraft =
			"Hi Lena,\n\nI wanted to follow up on your deployment inquiry.";
		expect(
			assertGreetingMatchesContact(validFirstNameDraft, contact).matches,
		).toBe(true);

		const validLastNameDraft =
			"Guten Tag Frau Bergström,\n\nvielen Dank für Ihre Anfrage.";
		expect(
			assertGreetingMatchesContact(validLastNameDraft, contact).matches,
		).toBe(true);
	});

	it("resolves language strictly from contact's own inbound messages or defaults to English (requirement 2)", () => {
		const contactId = "contact-lena-123";
		const otherContactId = "contact-rostova-456";

		const mixedMessages = [
			{
				contactId: otherContactId,
				direction: "INBOUND",
				body: "Guten Tag, wir benötigen die Unterlagen auf Deutsch.",
			},
		];

		const fallbackLanguage = detectContactInboundLanguage(
			mixedMessages,
			contactId,
			null,
		);
		expect(fallbackLanguage).toBe("en");

		const ownMessages = [
			{
				contactId,
				direction: "INBOUND",
				body: "Bonjour, nous aimerions avoir une démonstration du produit la semaine prochaine.",
			},
		];

		const detectedFrench = detectContactInboundLanguage(
			ownMessages,
			contactId,
			null,
		);
		expect(detectedFrench).toBe("fr");
	});
});

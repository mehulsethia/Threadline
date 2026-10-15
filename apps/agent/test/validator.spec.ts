import { describe, expect, it } from "bun:test";
import { DealStage } from "@crm/db";
import type { WhatsAppMessageItem } from "@crm/validation/whatsapp-parser";
import type { ExtractedLeadFacts } from "../adk/extraction";
import {
	detectParticipants,
	mapToCrmDealStage,
	resolveDueAt,
	resolveRelativeTimeline,
	validateAndEnrichFacts,
} from "../adk/validator";

function createDummyFacts(): ExtractedLeadFacts {
	return {
		contact: {
			name: {
				value: "Vikram Malhotra",
				evidence: {
					sourceKind: "whatsapp.message",
					speaker: "lead",
					quote:
						"Namaste Rohit ji! Vikram here from Apex Flow Controls, Ahmedabad.",
					lineNos: [999],
				},
			},
			phone: { value: null, evidence: null },
			role: { value: null, evidence: null },
		},
		company: {
			name: {
				value: "Apex Flow Controls",
				evidence: {
					sourceKind: "whatsapp.message",
					speaker: "lead",
					quote: "Apex Flow Controls",
					lineNos: [2],
				},
			},
			city: {
				value: "Ahmedabad",
				evidence: {
					sourceKind: "whatsapp.message",
					speaker: "lead",
					quote: "Ahmedabad",
					lineNos: [2],
				},
			},
		},
		deal: {
			need: {
				value: "industrial valves",
				evidence: {
					sourceKind: "whatsapp.message",
					speaker: "lead",
					quote: "industrial ball valves",
					lineNos: [3],
				},
			},
			quantity: {
				value: "150 pieces",
				evidence: {
					sourceKind: "whatsapp.message",
					speaker: "lead",
					quote: "Total 150 valves chahiye",
					lineNos: [4],
				},
			},
			leadBudget: {
				value: 450000,
				evidence: {
					sourceKind: "whatsapp.message",
					speaker: "lead",
					quote: "Hamara total budget approx 4,50,000 INR hai",
					lineNos: [9],
				},
			},
			quotedValue: {
				value: 450000,
				evidence: {
					sourceKind: "whatsapp.message",
					speaker: "us",
					quote: "20% advance aur balance 80% on 30 days credit",
					lineNos: [15],
				},
			},
			currency: {
				value: "INR",
				evidence: {
					sourceKind: "whatsapp.message",
					speaker: "lead",
					quote: "4,50,000 INR",
					lineNos: [9],
				},
			},
			timeline: {
				value: "2 weeks",
				evidence: {
					sourceKind: "whatsapp.message",
					speaker: "lead",
					quote: "Delivery timeline maximum 2 weeks me",
					lineNos: [10],
				},
			},
			timelineResolved: null,
			stageSuggestion: {
				value: DealStage.CONTRACT_SENT,
				evidence: {
					sourceKind: "whatsapp.message",
					speaker: "us",
					quote: "Aap formal quotation PDF bana ke",
					lineNos: [17],
				},
			},
		},
		languagePreference: {
			value: "Hinglish",
			evidence: {
				sourceKind: "whatsapp.message",
				speaker: "lead",
				quote: "Namaste Rohit ji",
				lineNos: [2],
			},
		},
		objections: [
			{
				objection: "MTC 3.1 needed",
				evidence: {
					sourceKind: "whatsapp.message",
					speaker: "lead",
					quote: "Material Test Certificate (MTC 3.1) and hydro test report",
					lineNos: [12],
				},
			},
			{
				objection: "Made up quote that does not exist in chat",
				evidence: {
					sourceKind: "whatsapp.message",
					speaker: "lead",
					quote: "Completely fabricated quote nowhere in the transcript",
					lineNos: [1],
				},
			},
		],
		nextStep: {
			value:
				"Aap formal quotation PDF bana ke email ya WhatsApp par bhej dijiye",
			owner: null,
			dueAt: null,
			evidence: {
				sourceKind: "whatsapp.message",
				speaker: "lead",
				quote: "Aap formal quotation PDF bana ke",
				lineNos: [17],
			},
		},
		sentiment: {
			value: "positive",
			evidence: {
				sourceKind: "whatsapp.message",
				speaker: "lead",
				quote: "Theek hai, ye payment terms acceptable hain",
				lineNos: [16],
			},
		},
		participants: {
			me: "Rohit Sharma",
			lead: "Vikram Malhotra",
			confidence: 0.95,
			autoDetected: true,
		},
	};
}

const sampleMessages: WhatsAppMessageItem[] = [
	{
		lineNo: 2,
		timestamp: new Date("2026-10-15T10:18:00Z"),
		sender: "Vikram Malhotra",
		text: "Namaste Rohit ji! Vikram here from Apex Flow Controls, Ahmedabad.",
	},
	{
		lineNo: 3,
		timestamp: new Date("2026-10-15T10:19:00Z"),
		sender: "Vikram Malhotra",
		text: "Hume hamare chemical plant project ke liye industrial ball valves ki urgent requirement hai.",
	},
	{
		lineNo: 4,
		timestamp: new Date("2026-10-15T10:20:00Z"),
		sender: "Vikram Malhotra",
		text: "Details:\n- 2 inch SS316 Ball Valve (Class 150): 100 pieces\nTotal 150 valves chahiye.",
	},
	{
		lineNo: 9,
		timestamp: new Date("2026-10-15T10:27:00Z"),
		sender: "Vikram Malhotra",
		text: "Great. Hamara total budget approx 4,50,000 INR hai for this lot.",
	},
	{
		lineNo: 10,
		timestamp: new Date("2026-10-15T10:28:00Z"),
		sender: "Vikram Malhotra",
		text: "Delivery timeline maximum 2 weeks me Ahmedabad site par honi chahiye. Can you manage?",
	},
	{
		lineNo: 11,
		timestamp: new Date("2026-10-15T10:35:00Z"),
		sender: "Rohit Sharma",
		text: "Vikram ji, material ready stock me hai. 2 weeks me dispatch ho jayega.",
	},
	{
		lineNo: 12,
		timestamp: new Date("2026-10-15T10:38:00Z"),
		sender: "Vikram Malhotra",
		text: "Ek issue hai Rohit bhai: Material Test Certificate (MTC 3.1) and hydro test report har valve ke sath mandatory chahiye, warna inspection pass nahi hoga.",
	},
	{
		lineNo: 15,
		timestamp: new Date("2026-10-15T10:46:00Z"),
		sender: "Rohit Sharma",
		text: "Payment ke liye hum 20% advance aur balance 80% on 30 days credit kar sakte hain.",
	},
	{
		lineNo: 16,
		timestamp: new Date("2026-10-15T10:50:00Z"),
		sender: "Vikram Malhotra",
		text: "Theek hai, ye payment terms acceptable hain.",
	},
	{
		lineNo: 17,
		timestamp: new Date("2026-10-15T10:52:00Z"),
		sender: "Vikram Malhotra",
		text: "Aap formal quotation PDF bana ke email ya WhatsApp par bhej dijiye. Phir hum immediate PO issue kar denge.",
	},
];

describe("detectParticipants", () => {
	it("auto-detects the seller participant who quotes prices and answers queries", () => {
		const result = detectParticipants(
			["Vikram Malhotra", "Rohit Sharma"],
			sampleMessages,
		);
		expect(result.me).toBe("Rohit Sharma");
		expect(result.lead).toBe("Vikram Malhotra");
		expect(result.confidence).toBeGreaterThanOrEqual(0.85);
		expect(result.autoDetected).toBe(true);
	});

	it("honors explicit meFlag override with confidence 1.0", () => {
		const result = detectParticipants(
			["Vikram Malhotra", "Rohit Sharma"],
			sampleMessages,
			"Vikram Malhotra",
		);
		expect(result.me).toBe("Vikram Malhotra");
		expect(result.lead).toBe("Rohit Sharma");
		expect(result.confidence).toBe(1.0);
		expect(result.autoDetected).toBe(false);
	});
});

describe("resolveRelativeTimeline", () => {
	const refDate = new Date("2026-10-15T10:00:00Z");

	it("resolves 2 weeks to 14 days in future", () => {
		const resolved = resolveRelativeTimeline("Maximum 2 weeks", refDate);
		expect(resolved).toBe("2026-10-29");
	});

	it("resolves specific month and day", () => {
		const resolved = resolveRelativeTimeline("15th November", refDate);
		expect(resolved).toBe("2026-11-15");
	});

	it("resolves upcoming weekday", () => {
		const resolved = resolveRelativeTimeline("Saturday", refDate);
		expect(resolved).toBe("2026-10-17");
	});
});

describe("resolveDueAt", () => {
	const refDate = new Date("2026-10-15T10:00:00Z");

	it("resolves hourly duration", () => {
		const due = resolveDueAt("within 1 hour", refDate);
		expect(due).toBe("2026-10-15T11:00:00.000Z");
	});

	it("resolves Saturday morning 11:00 AM", () => {
		const due = resolveDueAt("Saturday morning 11:00 AM", refDate);
		expect(due).toContain("2026-10-17");
	});
});

describe("mapToCrmDealStage", () => {
	it("maps demo/visit to DEMO_BOOKED", () => {
		expect(mapToCrmDealStage("Schedule demo class")).toBe(
			DealStage.DEMO_BOOKED,
		);
	});

	it("maps proposal/quotation to CONTRACT_SENT", () => {
		expect(mapToCrmDealStage("Proposal sent")).toBe(DealStage.CONTRACT_SENT);
	});

	it("maps decision maker to DECISION_MAKER_BOUGHT_IN", () => {
		expect(mapToCrmDealStage("Decision maker bought in")).toBe(
			DealStage.DECISION_MAKER_BOUGHT_IN,
		);
	});
});

describe("validateAndEnrichFacts", () => {
	it("fixes incorrect lineNos when quote is found in another message", () => {
		const facts = createDummyFacts();
		const refDate = new Date("2026-10-15T10:00:00Z");

		const summary = validateAndEnrichFacts(
			facts,
			sampleMessages,
			"Rohit Sharma",
			"Vikram Malhotra",
			refDate,
		);

		expect(facts.contact.name.evidence?.lineNos).toEqual([2]);
		expect(summary.fixed).toBeGreaterThanOrEqual(1);
	});

	it("downgrades fabricated quotes to agent.inference with flag", () => {
		const facts = createDummyFacts();
		const refDate = new Date("2026-10-15T10:00:00Z");

		const summary = validateAndEnrichFacts(
			facts,
			sampleMessages,
			"Rohit Sharma",
			"Vikram Malhotra",
			refDate,
		);

		const fabricatedObjection = facts.objections[1];
		expect(fabricatedObjection?.evidence.sourceKind).toBe("agent.inference");
		expect(fabricatedObjection?.evidence.downgraded).toBe(true);
		expect(fabricatedObjection?.evidence.flag).toBe("quote_not_found");
		expect(summary.downgraded).toBeGreaterThanOrEqual(1);
	});

	it("enforces agent.inference on sentiment, stageSuggestion, and languagePreference", () => {
		const facts = createDummyFacts();
		const refDate = new Date("2026-10-15T10:00:00Z");

		validateAndEnrichFacts(
			facts,
			sampleMessages,
			"Rohit Sharma",
			"Vikram Malhotra",
			refDate,
		);

		expect(facts.sentiment.evidence?.sourceKind).toBe("agent.inference");
		expect(facts.deal.stageSuggestion.evidence?.sourceKind).toBe(
			"agent.inference",
		);
		expect(facts.languagePreference.evidence?.sourceKind).toBe(
			"agent.inference",
		);
	});

	it("extracts phone when lead sender is numeric", () => {
		const facts = createDummyFacts();
		const phoneMessages: WhatsAppMessageItem[] = [
			{
				lineNo: 1,
				timestamp: new Date("2026-10-15T10:00:00Z"),
				sender: "+91 98765 43210",
				text: "Namaste",
			},
		];

		validateAndEnrichFacts(
			facts,
			phoneMessages,
			"Rohit Sharma",
			"+91 98765 43210",
			new Date(),
		);

		expect(facts.contact.phone.value).toBe("+919876543210");
		expect(facts.contact.phone.evidence?.sourceKind).toBe("whatsapp.message");
		expect(facts.contact.phone.evidence?.speaker).toBe("lead");
	});
});

import { describe, expect, it } from "bun:test";
import { DealStage } from "@crm/db";
import type { WhatsAppMessageItem } from "@crm/validation/whatsapp-parser";
import type { ExtractedLeadFacts } from "../adk/extraction";
import {
	detectParticipants,
	inferDealStageWithEvidence,
	isBusinessSideOrganization,
	mapToCrmDealStage,
	parseDeterministicAmount,
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

	it("detects US B2B SaaS seller and buyer", () => {
		const saasMessages: WhatsAppMessageItem[] = [
			{
				lineNo: 1,
				timestamp: new Date("2026-10-14T09:20:00Z"),
				sender: "Sarah Jenkins",
				text: "Hi Alex, Sarah Jenkins here from Datacore Cloud in Austin. We are evaluating enterprise security monitoring software for our Kubernetes clusters.",
			},
			{
				lineNo: 2,
				timestamp: new Date("2026-10-14T09:25:00Z"),
				sender: "Alex Mercer",
				text: "Hi Sarah! Great to connect. We protect over 5,000 production clusters globally. What scale are you looking at?",
			},
			{
				lineNo: 3,
				timestamp: new Date("2026-10-14T09:30:00Z"),
				sender: "Sarah Jenkins",
				text: "Our approved budget for this fiscal year is $48,000 USD.",
			},
			{
				lineNo: 4,
				timestamp: new Date("2026-10-14T09:35:00Z"),
				sender: "Alex Mercer",
				text: "That fits comfortably within our Enterprise tier, which lists at $48,000 annual for up to 50 clusters and 150 seats.",
			},
		];
		const result = detectParticipants(
			["Sarah Jenkins", "Alex Mercer"],
			saasMessages,
		);
		expect(result.me).toBe("Alex Mercer");
		expect(result.lead).toBe("Sarah Jenkins");
		expect(result.autoDetected).toBe(true);
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

	it("resolves multilingual hourly durations", () => {
		expect(resolveDueAt("1 ghante me", refDate)).toBe(
			"2026-10-15T11:00:00.000Z",
		);
		expect(resolveDueAt("in 2 stunden", refDate)).toBe(
			"2026-10-15T12:00:00.000Z",
		);
		expect(resolveDueAt("en 3 horas", refDate)).toBe(
			"2026-10-15T13:00:00.000Z",
		);
	});

	it("resolves tomorrow / next week in default UTC timezone", () => {
		const dueTomorrow = resolveDueAt("tomorrow", refDate);
		expect(dueTomorrow).toBe("2026-10-16T09:00:00.000Z");

		const dueSat = resolveDueAt("Saturday 11 AM", refDate);
		expect(dueSat).toBe("2026-10-17T11:00:00.000Z");

		const dueNextWeek = resolveDueAt("next week", refDate);
		expect(dueNextWeek).toBe("2026-10-22T09:00:00.000Z");
	});

	it("resolves custom timezone offset when provided", () => {
		const due = resolveDueAt("kal", refDate, "+05:30");
		expect(due).toBe("2026-10-16T03:30:00.000Z");

		const dueSat = resolveDueAt("Saturday 11 AM", refDate, "+05:30");
		expect(dueSat).toBe("2026-10-17T05:30:00.000Z");
	});
});

describe("mapToCrmDealStage", () => {
	it("maps lead to UNQUALIFIED_TO_BUY (Lead)", () => {
		expect(mapToCrmDealStage("New inbound lead")).toBe(
			DealStage.UNQUALIFIED_TO_BUY,
		);
	});

	it("maps demo/visit to DEMO_BOOKED (Meeting/Demo)", () => {
		expect(mapToCrmDealStage("Schedule demo class")).toBe(
			DealStage.DEMO_BOOKED,
		);
		expect(mapToCrmDealStage("Meeting scheduled")).toBe(DealStage.DEMO_BOOKED);
	});

	it("maps proposal/quotation to CONTRACT_SENT (Proposal)", () => {
		expect(mapToCrmDealStage("Proposal sent")).toBe(DealStage.CONTRACT_SENT);
		expect(mapToCrmDealStage("Quotation requested")).toBe(
			DealStage.CONTRACT_SENT,
		);
	});

	it("maps decision maker / negotiation to DECISION_MAKER_BOUGHT_IN (Negotiation)", () => {
		expect(mapToCrmDealStage("Decision maker bought in")).toBe(
			DealStage.DECISION_MAKER_BOUGHT_IN,
		);
		expect(mapToCrmDealStage("Contract negotiation in progress")).toBe(
			DealStage.DECISION_MAKER_BOUGHT_IN,
		);
	});

	it("maps won and lost stages", () => {
		expect(mapToCrmDealStage("Closed won")).toBe(DealStage.CLOSED_WON);
		expect(mapToCrmDealStage("Closed lost")).toBe(DealStage.CLOSED_LOST);
	});
});

describe("inferDealStageWithEvidence", () => {
	it("infers UNQUALIFIED_TO_BUY (Lead) for inquiry-only conversations", () => {
		const facts = createDummyFacts();
		facts.deal.leadBudget = { value: null, evidence: null };
		facts.deal.quotedValue = { value: null, evidence: null };
		facts.deal.timeline = { value: null, evidence: null };
		facts.deal.need = { value: null, evidence: null };
		facts.nextStep = { value: null, dueAt: null, owner: null, evidence: null };

		const msgs: WhatsAppMessageItem[] = [
			{
				lineNo: 1,
				text: "Hi, just inquiring about your products.",
				sender: "Vikram Malhotra",
			},
		];
		const res = inferDealStageWithEvidence(
			facts,
			msgs,
			"Rohit Sharma",
			"Vikram Malhotra",
		);
		expect(res.stage).toBe(DealStage.UNQUALIFIED_TO_BUY);
		expect(res.evidence.quote).toBe("Hi, just inquiring about your products.");
	});

	it("infers QUALIFIED_TO_BUY (Qualified) when need plus budget are confirmed", () => {
		const facts = createDummyFacts();
		facts.nextStep = {
			value: "Send quotation",
			dueAt: null,
			owner: "us",
			evidence: null,
		};
		const msgs: WhatsAppMessageItem[] = [
			{
				lineNo: 1,
				text: "We need 150 ball valves urgently.",
				sender: "Vikram Malhotra",
			},
			{
				lineNo: 2,
				text: "Our approved budget is 4,50,000 INR.",
				sender: "Vikram Malhotra",
			},
		];
		const res = inferDealStageWithEvidence(
			facts,
			msgs,
			"Rohit Sharma",
			"Vikram Malhotra",
		);
		expect(res.stage).toBe(DealStage.QUALIFIED_TO_BUY);
		expect(res.evidence.quote).toContain("4,50,000 INR");
	});

	it("infers DEMO_BOOKED (Meeting/Demo) when meeting/demo is booked", () => {
		const facts = createDummyFacts();
		facts.nextStep = {
			value: "Conduct product demo with security architect",
			dueAt: "tomorrow at 2 PM",
			owner: "us",
			evidence: {
				sourceKind: "whatsapp.message",
				speaker: "lead",
				quote:
					"Let's schedule a product demo with our security architect tomorrow at 2 PM.",
				lineNos: [10],
			},
		};
		const msgs: WhatsAppMessageItem[] = [
			{
				lineNo: 10,
				text: "Let's schedule a product demo with our security architect tomorrow at 2 PM.",
				sender: "Sarah Jenkins",
			},
			{
				lineNo: 11,
				text: "Confirmed, I will send the calendar invite for tomorrow at 2 PM.",
				sender: "Alex Mercer",
			},
		];
		const res = inferDealStageWithEvidence(
			facts,
			msgs,
			"Alex Mercer",
			"Sarah Jenkins",
		);
		expect(res.stage).toBe(DealStage.DEMO_BOOKED);
		expect(res.evidence.quote).toContain("demo with our security architect");
	});

	it("prevents Negotiation when next task is 'schedule a demo'", () => {
		const facts = createDummyFacts();
		facts.nextStep = {
			value: "Schedule product demo with security architect",
			dueAt: null,
			owner: "us",
			evidence: null,
		};
		const msgs: WhatsAppMessageItem[] = [
			{ lineNo: 1, text: "Proposal sent earlier.", sender: "Alex Mercer" },
			{
				lineNo: 2,
				text: "We are negotiating terms and redlines.",
				sender: "Sarah Jenkins",
			},
			{
				lineNo: 3,
				text: "Let's schedule a demo first.",
				sender: "Sarah Jenkins",
			},
		];
		const res = inferDealStageWithEvidence(
			facts,
			msgs,
			"Alex Mercer",
			"Sarah Jenkins",
		);
		expect(res.stage).toBe(DealStage.DEMO_BOOKED);
	});

	it("infers CONTRACT_SENT (Proposal) when quote/proposal was sent", () => {
		const facts = createDummyFacts();
		facts.nextStep = {
			value: "Follow up on review",
			dueAt: null,
			owner: "us",
			evidence: null,
		};
		const msgs: WhatsAppMessageItem[] = [
			{
				lineNo: 1,
				text: "I have emailed the formal proposal document and contract pack.",
				sender: "Alex Mercer",
			},
			{
				lineNo: 2,
				text: "Thank you, I will review it.",
				sender: "Sarah Jenkins",
			},
		];
		const res = inferDealStageWithEvidence(
			facts,
			msgs,
			"Alex Mercer",
			"Sarah Jenkins",
		);
		expect(res.stage).toBe(DealStage.CONTRACT_SENT);
	});

	it("infers DECISION_MAKER_BOUGHT_IN (Negotiation) when buyer negotiates redlines on sent proposal", () => {
		const facts = createDummyFacts();
		facts.nextStep = {
			value: "Review agreement redlines",
			dueAt: null,
			owner: "us",
			evidence: null,
		};
		const msgs: WhatsAppMessageItem[] = [
			{
				lineNo: 1,
				text: "Thanks for sending over the Enterprise Proposal Alex.",
				sender: "Sarah Jenkins",
			},
			{
				lineNo: 2,
				text: "We are eager to move forward once the SLA schedule is confirmed. Agreement redlines attached.",
				sender: "Sarah Jenkins",
			},
		];
		const res = inferDealStageWithEvidence(
			facts,
			msgs,
			"Alex Mercer",
			"Sarah Jenkins",
		);
		expect(res.stage).toBe(DealStage.DECISION_MAKER_BOUGHT_IN);
		expect(res.evidence.quote).toContain("Agreement redlines attached");
	});

	it("infers CLOSED_WON on explicit confirmation", () => {
		const facts = createDummyFacts();
		const msgs: WhatsAppMessageItem[] = [
			{
				lineNo: 1,
				text: "Contract signed and PO issued for the full amount.",
				sender: "Vikram Malhotra",
			},
		];
		const res = inferDealStageWithEvidence(
			facts,
			msgs,
			"Rohit Sharma",
			"Vikram Malhotra",
		);
		expect(res.stage).toBe(DealStage.CLOSED_WON);
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

	it("determines speaker deterministically from message sender of lineNos", () => {
		const facts = createDummyFacts();
		facts.deal.stageSuggestion.evidence = {
			sourceKind: "agent.inference",
			speaker: "us",
			quote:
				"Aap formal quotation PDF bana ke email ya WhatsApp par bhej dijiye",
			lineNos: [17],
		};

		validateAndEnrichFacts(
			facts,
			sampleMessages,
			"Rohit Sharma",
			"Vikram Malhotra",
			new Date("2026-10-15T10:00:00Z"),
		);

		expect(facts.deal.stageSuggestion.evidence.speaker).toBe("lead");
	});

	it("resolves nextStep dueAt from combined value and quote", () => {
		const facts = createDummyFacts();
		facts.nextStep = {
			value: "Send formal quotation PDF",
			owner: null,
			dueAt: null,
			evidence: {
				sourceKind: "whatsapp.message",
				speaker: "us",
				quote: "1 ghante me quotation bhejta hu",
				lineNos: [18],
			},
		};

		const refDate = new Date("2026-10-15T11:25:00Z");
		validateAndEnrichFacts(
			facts,
			sampleMessages,
			"Rohit Sharma",
			"Vikram Malhotra",
			refDate,
		);

		expect(facts.nextStep.dueAt).toBe("2026-10-15T12:25:00.000Z");
		expect(facts.nextStep.owner).toBe("us");
	});

	it("never assigns the business-side participant's organisation as the lead company", () => {
		const coachingMessages: WhatsAppMessageItem[] = [
			{
				lineNo: 1,
				timestamp: new Date("2026-10-15T15:32:05Z"),
				sender: "Sunita Rao",
				text: "Hello Amit sir, main Sunita Rao baat kar rahi hu Jaipur se.",
			},
			{
				lineNo: 2,
				timestamp: new Date("2026-10-15T15:33:10Z"),
				sender: "Sunita Rao",
				text: "Mere bete Aarav ke liye JEE Advanced 2027 2-year classroom coaching program ki enquiry karni hai.",
			},
			{
				lineNo: 3,
				timestamp: new Date("2026-10-15T15:35:22Z"),
				sender: "Amit Verma",
				text: "Namaste Sunita ma'am! Apex IIT Academy Jaipur branch me aapka swagat hai. Aarav abhi 10th class me hai?",
			},
		];

		const facts = createDummyFacts();
		facts.contact.name = {
			value: "Sunita Rao",
			evidence: {
				sourceKind: "whatsapp.message",
				speaker: "lead",
				quote: "main Sunita Rao baat kar rahi hu Jaipur se",
				lineNos: [1],
			},
		};
		facts.company.name = {
			value: "Apex IIT Academy",
			evidence: {
				sourceKind: "whatsapp.message",
				speaker: "us",
				quote: "Apex IIT Academy Jaipur branch me aapka swagat hai",
				lineNos: [3],
			},
		};

		expect(
			isBusinessSideOrganization(
				"Apex IIT Academy",
				coachingMessages,
				"Amit Verma",
			),
		).toBe(true);
		expect(
			isBusinessSideOrganization(
				"Northwind Systems Inc",
				[],
				"Amit Verma",
				"Northwind Systems",
			),
		).toBe(true);
		expect(
			isBusinessSideOrganization(
				"Siemens AG",
				coachingMessages,
				"Amit Verma",
				"Northwind Systems",
			),
		).toBe(false);

		validateAndEnrichFacts(
			facts,
			coachingMessages,
			"Amit Verma",
			"Sunita Rao",
			new Date("2026-10-15T16:00:00Z"),
		);

		expect(facts.company.name.value).toBeNull();
		expect(facts.company.name.evidence).toBeNull();
	});

	it("extracts monetary amounts deterministically from evidence quotes", () => {
		expect(
			parseDeterministicAmount(
				"Total course fee 1,80,000 INR hai including study material",
			),
		).toBe(180000);
		expect(
			parseDeterministicAmount(
				"Hamara total budget approx 4,50,000 INR hai for this lot",
			),
		).toBe(450000);
		expect(
			parseDeterministicAmount(
				"Our approved budget for this fiscal year is $48,000 USD",
			),
		).toBe(48000);
		expect(parseDeterministicAmount("unser Angebot bei 72.000 EUR")).toBe(
			72000,
		);
		expect(parseDeterministicAmount("budget of £35,000 GBP")).toBe(35000);
		expect(parseDeterministicAmount("comes to £32,500 per year")).toBe(32500);
		expect(parseDeterministicAmount("total fee 1.8 lakh")).toBe(180000);

		const coachingMessages: WhatsAppMessageItem[] = [
			{
				lineNo: 1,
				timestamp: new Date("2026-10-15T15:32:05Z"),
				sender: "Sunita Rao",
				text: "Hello Amit sir, main Sunita Rao baat kar rahi hu Jaipur se.",
			},
			{
				lineNo: 2,
				timestamp: new Date("2026-10-15T15:37:40Z"),
				sender: "Amit Verma",
				text: "Bahut badhiya. Hamara 2-Year Target JEE Advanced batch 15th November se shuru ho raha hai. Total course fee 1,80,000 INR hai including study material and test series.",
			},
		];

		const facts = createDummyFacts();
		facts.deal.quotedValue = {
			value: 45000,
			evidence: {
				sourceKind: "whatsapp.message",
				speaker: "us",
				quote:
					"Total course fee 1,80,000 INR hai including study material and test series.",
				lineNos: [2],
			},
		};

		validateAndEnrichFacts(
			facts,
			coachingMessages,
			"Amit Verma",
			"Sunita Rao",
			new Date("2026-10-15T16:00:00Z"),
		);

		expect(facts.deal.quotedValue.value).toBe(180000);
	});
});

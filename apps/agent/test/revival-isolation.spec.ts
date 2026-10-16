import { describe, expect, it } from "bun:test";
import { parseStructuredCitations } from "../adk/revival/agent";
import {
	assertGreetingMatchesContact,
	verifyFactualClaims,
} from "../adk/revival/claim-guard";
import {
	messagesForContact,
	pickRevivalContact,
} from "../adk/revival/detector";

const lena = {
	contactId: "c-lena",
	role: null,
	contact: { firstName: "Lena", lastName: "Bergström" },
};
const elena = {
	contactId: "c-elena",
	role: "Primary Contact",
	contact: { firstName: "Elena", lastName: "Rostova" },
};

describe("revival contact isolation", () => {
	it("addresses whoever on the deal wrote last, not the first row", () => {
		const picked = pickRevivalContact(
			[elena, lena],
			[{ contactId: "c-lena" }, { contactId: "c-elena" }],
		);
		expect(picked?.contactId).toBe("c-lena");
	});

	it("falls back to the primary contact, then a stable order", () => {
		expect(pickRevivalContact([lena, elena], [])?.contactId).toBe("c-elena");
		const noPrimary = { ...elena, role: null };
		expect(pickRevivalContact([lena, noPrimary], [])?.contactId).toBe(
			"c-elena",
		);
		expect(pickRevivalContact([noPrimary, lena], [])?.contactId).toBe(
			"c-elena",
		);
	});

	it("keeps unattributed messages only on single-contact deals", () => {
		const messages = [
			{ id: "1", contactId: "c-lena" },
			{ id: "2", contactId: "c-elena" },
			{ id: "3", contactId: null },
		];
		expect(messagesForContact(messages, "c-lena", 2).map((m) => m.id)).toEqual([
			"1",
		]);
		expect(messagesForContact(messages, "c-lena", 1).map((m) => m.id)).toEqual([
			"1",
			"3",
		]);
	});
});

describe("revival citations", () => {
	const facts = [{ id: "f1", field: "budget", value: "48000 USD approved" }];
	const messages = [
		{
			id: "m1",
			body: "Our compliance team requires your SOC2 Type II report.",
		},
	];
	const tasks = [{ id: "t1", subject: "Send the calendar invite" }];

	it("resolves ids to the record's own text", () => {
		const cited = parseStructuredCitations(
			[
				{ evidenceId: "f1", kind: "fact", quote: "made-up words" },
				{ evidenceId: "t1", kind: "task", quote: "x" },
			],
			facts,
			messages,
			tasks,
		);
		expect(cited).toEqual([
			{ evidenceId: "f1", kind: "fact", quote: "budget: 48000 USD approved" },
			{ evidenceId: "t1", kind: "task", quote: "Send the calendar invite" },
		]);
	});

	it("maps a verbatim quote to its message and drops fabricated ones", () => {
		const cited = parseStructuredCitations(
			[
				{
					evidenceId: "2026-10-08T11:19:07Z",
					quote: "requires your SOC2 Type II",
				},
				{ evidenceId: "nope", quote: "We guarantee zero downtime forever" },
			],
			facts,
			messages,
			tasks,
		);
		expect(cited).toEqual([
			{
				evidenceId: "m1",
				kind: "message",
				quote: "Our compliance team requires your SOC2 Type II report.",
			},
		]);
	});
});

describe("revival guards", () => {
	it("does not treat any 'ce' substring as CE certification evidence", () => {
		const result = verifyFactualClaims("Alle Ventile mit CE-Zertifizierung.", {
			facts: [],
			messages: [{ sender: "x", body: "Bitte senden Sie das Angebot." }],
			tasks: [],
		});
		expect(result.unsupportedClaims).toContain("CE-Zertifizierung");
	});

	it("catches a salutation to another person without a greeting word", () => {
		const result = assertGreetingMatchesContact(
			"Frau Rostova,\n\nich wollte nachfragen.",
			{ firstName: "Lena", lastName: "Bergström" },
		);
		expect(result.matches).toBe(false);
	});

	it("does not abort a salutation written in another script", () => {
		const result = assertGreetingMatchesContact(
			"नमस्ते सुनीता मैम,\n\nआशा है आप कुशल होंगे।",
			{ firstName: "Sunita", lastName: "Rao" },
		);
		expect(result.matches).toBe(true);
	});
});

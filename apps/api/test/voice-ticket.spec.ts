import { beforeAll, describe, expect, it } from "bun:test";
import {
	issueVoiceTicket,
	VOICE_TICKET_TTL_MS,
	verifyVoiceTicket,
} from "../src/voice/voice-ticket";

beforeAll(() => {
	process.env.BETTER_AUTH_SECRET ??= "test-secret";
});

describe("voice ticket", () => {
	const now = 1_800_000_000_000;

	it("admits the user it was issued to, for that deal", () => {
		const ticket = issueVoiceTicket("user-1", "deal-1", now);
		expect(verifyVoiceTicket(ticket, "deal-1", now + 1000)).toEqual({
			userId: "user-1",
		});
	});

	it("refuses another deal, an expired ticket and a tampered one", () => {
		const ticket = issueVoiceTicket("user-1", "deal-1", now);
		expect(verifyVoiceTicket(ticket, "deal-2", now)).toBeNull();
		expect(
			verifyVoiceTicket(ticket, "deal-1", now + VOICE_TICKET_TTL_MS + 1),
		).toBeNull();

		const [data] = ticket.split(".");
		const forged = Buffer.from(
			JSON.stringify({
				userId: "attacker",
				dealId: "deal-1",
				expiresAt: now + 60_000,
			}),
		).toString("base64url");
		expect(
			verifyVoiceTicket(`${forged}.${ticket.split(".")[1]}`, "deal-1", now),
		).toBeNull();
		expect(verifyVoiceTicket(`${data}.bad`, "deal-1", now)).toBeNull();
		expect(verifyVoiceTicket("garbage", "deal-1", now)).toBeNull();
	});
});

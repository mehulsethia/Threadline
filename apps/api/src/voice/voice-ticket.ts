import { createHmac, timingSafeEqual } from "node:crypto";
import { jsonText } from "@crm/validation/json-text";
import { z } from "zod";

/**
 * A short-lived, single-purpose pass for the voice WebSocket. The browser
 * talks to the API host directly for the socket (the app's HTTP proxy cannot
 * carry a WebSocket upgrade), and the session cookie lives on the app host, so
 * the app asks for a ticket over its authenticated tRPC path and the socket
 * presents it. It names one user and one deal and expires in a minute.
 */
export const VOICE_TICKET_TTL_MS = 60_000;

const voiceTicket = z.object({
	userId: z.string(),
	dealId: z.string(),
	expiresAt: z.number(),
});

type VoiceTicket = z.infer<typeof voiceTicket>;

function ticketSecret(): string {
	const secret = process.env.BETTER_AUTH_SECRET;
	if (!secret) throw new Error("BETTER_AUTH_SECRET must be set.");
	return secret;
}

function sign(data: string): string {
	return createHmac("sha256", ticketSecret())
		.update(`voice-ticket:${data}`)
		.digest("base64url");
}

export function issueVoiceTicket(
	userId: string,
	dealId: string,
	now = Date.now(),
): string {
	const payload: VoiceTicket = {
		userId,
		dealId,
		expiresAt: now + VOICE_TICKET_TTL_MS,
	};
	const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
	return `${data}.${sign(data)}`;
}

export function verifyVoiceTicket(
	ticket: string,
	dealId: string,
	now = Date.now(),
): { userId: string } | null {
	const [data, signature] = ticket.split(".");
	if (!data || !signature) return null;

	const expected = Buffer.from(sign(data));
	const given = Buffer.from(signature);
	if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
		return null;
	}

	const payload = jsonText
		.pipe(voiceTicket)
		.safeParse(Buffer.from(data, "base64url").toString("utf8"));
	if (
		!payload.success ||
		payload.data.dealId !== dealId ||
		payload.data.expiresAt < now
	) {
		return null;
	}
	return { userId: payload.data.userId };
}

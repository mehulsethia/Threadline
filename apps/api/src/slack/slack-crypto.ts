import {
	createCipheriv,
	createDecipheriv,
	createHash,
	createHmac,
	randomBytes,
	timingSafeEqual,
} from "node:crypto";

/** The key for Slack token encryption and OAuth state; there is no default. */
export function slackSecret(): string {
	const secret =
		process.env.SLACK_STATE_SECRET || process.env.BETTER_AUTH_SECRET;
	if (!secret) {
		throw new Error("SLACK_STATE_SECRET or BETTER_AUTH_SECRET must be set.");
	}
	return secret;
}

export type SlackOAuthState = {
	orgId: string;
	userId: string;
	slug?: string;
	timestamp: number;
};

function getEncryptionKey(): Buffer {
	return createHash("sha256").update(slackSecret()).digest();
}

export function encryptToken(plainText: string): string {
	const key = getEncryptionKey();
	const iv = randomBytes(12);
	const cipher = createCipheriv("aes-256-gcm", key, iv);
	let encrypted = cipher.update(plainText, "utf8", "hex");
	encrypted += cipher.final("hex");
	const tag = cipher.getAuthTag().toString("hex");
	return `${iv.toString("hex")}:${tag}:${encrypted}`;
}

export function decryptToken(encryptedPayload: string): string {
	const parts = encryptedPayload.split(":");
	if (parts.length !== 3) {
		return encryptedPayload;
	}
	const [ivHex, tagHex, contentHex] = parts;
	const key = getEncryptionKey();
	const iv = Buffer.from(ivHex as string, "hex");
	const tag = Buffer.from(tagHex as string, "hex");
	const decipher = createDecipheriv("aes-256-gcm", key, iv);
	decipher.setAuthTag(tag);
	let decrypted = decipher.update(contentHex as string, "hex", "utf8");
	decrypted += decipher.final("utf8");
	return decrypted;
}

export function signSlackState(payload: SlackOAuthState): string {
	const secret = slackSecret();
	const jsonStr = JSON.stringify(payload);
	const dataB64 = Buffer.from(jsonStr, "utf8").toString("base64url");
	const signature = createHmac("sha256", secret)
		.update(dataB64)
		.digest("base64url");
	return `${dataB64}.${signature}`;
}

export function verifySlackState(stateString: string): SlackOAuthState | null {
	const parts = stateString.split(".");
	if (parts.length !== 2) return null;
	const [dataB64, signature] = parts;
	if (!dataB64 || !signature) return null;

	const secret = slackSecret();
	const expected = createHmac("sha256", secret)
		.update(dataB64)
		.digest("base64url");

	const sigBuf = Buffer.from(signature);
	const expBuf = Buffer.from(expected);
	if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
		return null;
	}

	try {
		const json = Buffer.from(dataB64, "base64url").toString("utf8");
		const parsed = JSON.parse(json) as SlackOAuthState;
		if (Date.now() - parsed.timestamp > 15 * 60 * 1000) {
			return null;
		}
		return parsed;
	} catch {
		return null;
	}
}

export function verifySlackSignature(params: {
	signingSecret: string;
	timestamp: string;
	body: string;
	signature: string;
}): boolean {
	const { signingSecret, timestamp, body, signature } = params;
	const ts = Number.parseInt(timestamp, 10);
	if (Number.isNaN(ts) || Math.abs(Date.now() / 1000 - ts) > 300) {
		return false;
	}
	const base = `v0:${timestamp}:${body}`;
	const hash = `v0=${createHmac("sha256", signingSecret).update(base).digest("hex")}`;
	const sigBuf = Buffer.from(signature);
	const expBuf = Buffer.from(hash);
	if (sigBuf.length !== expBuf.length) return false;
	return timingSafeEqual(sigBuf, expBuf);
}

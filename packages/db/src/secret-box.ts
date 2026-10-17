import {
	createCipheriv,
	createDecipheriv,
	createHash,
	randomBytes,
} from "node:crypto";

function key(): Buffer {
	const secret =
		process.env.SLACK_STATE_SECRET || process.env.BETTER_AUTH_SECRET;
	if (!secret) {
		throw new Error("SLACK_STATE_SECRET or BETTER_AUTH_SECRET must be set.");
	}
	return createHash("sha256").update(secret).digest();
}

export function sealSecret(plain: string): string {
	const iv = randomBytes(12);
	const cipher = createCipheriv("aes-256-gcm", key(), iv);
	const content = cipher.update(plain, "utf8", "hex") + cipher.final("hex");
	return `${iv.toString("hex")}:${cipher.getAuthTag().toString("hex")}:${content}`;
}

export function openSecret(stored: string): string | null {
	const [iv, tag, content] = stored.split(":");
	if (!iv || !tag || content === undefined) return null;
	try {
		const decipher = createDecipheriv(
			"aes-256-gcm",
			key(),
			Buffer.from(iv, "hex"),
		);
		decipher.setAuthTag(Buffer.from(tag, "hex"));
		return decipher.update(content, "hex", "utf8") + decipher.final("utf8");
	} catch {
		return null;
	}
}

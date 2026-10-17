import { describe, expect, it } from "bun:test";
import { decodeEnvFile, parseEnv } from "../src/index";

const LINE = 'DATABASE_URL="postgresql://localhost/crm"\r\n';

describe("decodeEnvFile", () => {
	it("reads plain and BOM-prefixed UTF-8", () => {
		const plain = new TextEncoder().encode(LINE);
		const bom = new Uint8Array([0xef, 0xbb, 0xbf, ...plain]);
		for (const bytes of [plain, bom]) {
			expect(parseEnv(decodeEnvFile(bytes)).DATABASE_URL).toBe(
				"postgresql://localhost/crm",
			);
		}
	});

	it("reads a UTF-16 file saved by PowerShell", () => {
		const utf16 = Buffer.concat([
			Buffer.from([0xff, 0xfe]),
			Buffer.from(LINE, "utf16le"),
		]);
		expect(parseEnv(decodeEnvFile(utf16)).DATABASE_URL).toBe(
			"postgresql://localhost/crm",
		);
	});
});

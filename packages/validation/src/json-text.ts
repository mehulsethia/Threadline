import { z } from "zod";

/**
 * A string that must hold JSON, parsed as one schema step so the result can be
 * piped straight into the schema for its contents. Bad JSON is a parse issue,
 * not an exception.
 */
export const jsonText = z.string().transform((text, ctx) => {
	try {
		return JSON.parse(text);
	} catch {
		ctx.addIssue({ code: "custom", message: "Expected JSON text." });
		return z.NEVER;
	}
});

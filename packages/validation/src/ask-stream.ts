import { z } from "zod";

export const askStreamEvent = z.discriminatedUnion("type", [
	z.object({ type: z.literal("tool"), name: z.string() }),
	z.object({ type: z.literal("text"), delta: z.string() }),
	z.object({
		type: z.literal("done"),
		answer: z.string(),
		tools: z.array(z.string()),
	}),
	z.object({ type: z.literal("error"), message: z.string() }),
]);

export type AskStreamEvent = z.infer<typeof askStreamEvent>;

export function parseAskStreamEvent(line: string): AskStreamEvent | null {
	if (!line.startsWith("data: ")) return null;
	try {
		const parsed = askStreamEvent.safeParse(JSON.parse(line.slice(6)));
		return parsed.success ? parsed.data : null;
	} catch {
		return null;
	}
}

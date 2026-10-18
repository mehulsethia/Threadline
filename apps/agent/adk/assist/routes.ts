import { rootDb, runInWorkspace } from "@crm/db";
import { jsonText } from "@crm/validation/json-text";
import { z } from "zod";
import { type AskEvent, askCrm, runAsk } from "./ask";
import { scoreDeal, scoreOpenDeals } from "./score";
import { DRAFT_CHANNELS, draftMessage, meetingBrief } from "./writer";

const askBody = z.object({
	history: z
		.array(
			z.object({
				role: z.enum(["user", "assistant"]),
				text: z.string().max(8_000),
			}),
		)
		.min(1)
		.max(30),
});

const draftBody = z.object({
	dealId: z.string().min(1),
	channel: z.enum(DRAFT_CHANNELS),
	goal: z.string().max(500).nullable().optional(),
});

const dealBody = z.object({ dealId: z.string().min(1) });

const emptyBody = z.object({}).catch({});

async function run(operation: string, raw: string): Promise<object | null> {
	const body = jsonText;
	switch (operation) {
		case "ask":
			return askCrm(body.pipe(askBody).parse(raw).history);
		case "draft":
			return draftMessage(body.pipe(draftBody).parse(raw));
		case "brief":
			return meetingBrief(body.pipe(dealBody).parse(raw).dealId);
		case "score":
			return scoreDeal(body.pipe(dealBody).parse(raw).dealId);
		case "score-all":
			body.pipe(emptyBody).parse(raw || "{}");
			return { scored: await scoreOpenDeals(false) };
		default:
			throw new UnknownOperation(operation);
	}
}

class UnknownOperation extends Error {}

export async function handleAssist(
	operation: string,
	workspaceId: string | null,
	raw: string,
): Promise<Response> {
	if (!workspaceId) {
		return Response.json({ error: "Missing workspace." }, { status: 400 });
	}
	const workspace = await rootDb.organization.findUnique({
		where: { id: workspaceId },
		select: { id: true },
	});
	if (!workspace) {
		return Response.json({ error: "Unknown workspace." }, { status: 404 });
	}
	if (operation === "ask-stream") return streamAsk(workspaceId, raw);
	try {
		const result = await runInWorkspace(workspaceId, () => run(operation, raw));
		return Response.json({ result });
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		const status =
			error instanceof UnknownOperation
				? 404
				: error instanceof z.ZodError
					? 400
					: 500;
		console.error(`[assist] ${operation} failed:`, message);
		return Response.json({ error: message }, { status });
	}
}

const STREAM_PING_MS = 5_000;

function streamAsk(workspaceId: string, raw: string): Response {
	const parsed = jsonText.pipe(askBody).safeParse(raw);
	if (!parsed.success) {
		return Response.json({ error: "Invalid question." }, { status: 400 });
	}
	const encoder = new TextEncoder();
	const stream = new ReadableStream<Uint8Array>({
		start(controller) {
			let open = true;
			const write = (text: string) => {
				if (open) controller.enqueue(encoder.encode(text));
			};
			const send = (event: AskEvent) =>
				write(`data: ${JSON.stringify(event)}\n\n`);
			const ping = setInterval(() => write(": ping\n\n"), STREAM_PING_MS);
			runInWorkspace(workspaceId, () => runAsk(parsed.data.history, send))
				.catch((error) => {
					const message =
						error instanceof Error ? error.message : String(error);
					console.error("[assist] ask-stream failed:", message);
					send({ type: "error", message });
				})
				.finally(() => {
					clearInterval(ping);
					open = false;
					controller.close();
				});
		},
	});
	return new Response(stream, {
		headers: {
			"content-type": "text/event-stream",
			"cache-control": "no-cache, no-transform",
		},
	});
}

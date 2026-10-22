import { rootDb, runInWorkspace } from "@crm/db";
import { jsonText } from "@crm/validation/json-text";
import {
	voiceDealRequest,
	voiceTranscribeRequest,
} from "@crm/validation/voice";
import { z } from "zod";
import { DealNotFound, dealContext } from "./context";
import { transcribeAndQualify } from "./transcribe";

export async function knownWorkspace(
	workspaceId: string | null,
): Promise<string | null> {
	if (!workspaceId) return null;
	const workspace = await rootDb.organization.findUnique({
		where: { id: workspaceId },
		select: { id: true },
	});
	return workspace?.id ?? null;
}

async function run(operation: string, raw: string): Promise<object> {
	switch (operation) {
		case "context":
			return dealContext(jsonText.pipe(voiceDealRequest).parse(raw).dealId);
		case "transcribe":
			return transcribeAndQualify(
				jsonText.pipe(voiceTranscribeRequest).parse(raw),
			);
		default:
			throw new UnknownOperation(operation);
	}
}

class UnknownOperation extends Error {}

export async function handleVoice(
	operation: string,
	workspaceId: string | null,
	raw: string,
): Promise<Response> {
	const workspace = await knownWorkspace(workspaceId);
	if (!workspace) {
		return Response.json({ error: "Unknown workspace." }, { status: 404 });
	}
	try {
		const result = await runInWorkspace(workspace, () => run(operation, raw));
		return Response.json({ result });
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		const status =
			error instanceof UnknownOperation || error instanceof DealNotFound
				? 404
				: error instanceof z.ZodError
					? 400
					: 500;
		console.error(`[voice] ${operation} failed:`, message);
		return Response.json({ error: message }, { status });
	}
}

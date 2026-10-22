import { requireWorkspaceId } from "@crm/db";
import { cloudRunAuthHeaders } from "@crm/env/cloud-run";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { type Bridge, bridge } from "./bridge";

export const agentEnvelope = z.object({
	result: z.unknown().optional(),
	error: z.string().optional(),
});

export function requireBridge(): Bridge {
	const agent = bridge();
	if (!agent) {
		throw new TRPCError({
			code: "PRECONDITION_FAILED",
			message: "The agent is not configured for this deployment.",
		});
	}
	return agent;
}

export async function agentHeaders(
	agent: Bridge,
): Promise<Record<string, string>> {
	return {
		...(await cloudRunAuthHeaders()),
		authorization: `Bearer ${agent.secret}`,
		"x-crm-workspace": requireWorkspaceId(),
	};
}

export async function callAgent<T>(
	path: string,
	body: unknown,
	schema: z.ZodType<T>,
	timeoutMs: number,
): Promise<T> {
	const agent = requireBridge();
	const response = await fetch(agent.url(path), {
		method: "POST",
		headers: {
			...(await agentHeaders(agent)),
			"content-type": "application/json",
		},
		body: JSON.stringify(body),
		signal: AbortSignal.timeout(timeoutMs),
	});
	const envelope = agentEnvelope.parse(await response.json().catch(() => ({})));
	if (!response.ok || envelope.error) {
		throw new TRPCError({
			code: response.status === 404 ? "NOT_FOUND" : "INTERNAL_SERVER_ERROR",
			message: envelope.error ?? `The agent answered ${response.status}.`,
		});
	}
	return schema.parse(envelope.result);
}

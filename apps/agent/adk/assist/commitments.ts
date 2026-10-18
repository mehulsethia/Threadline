import { ActivityType, db } from "@crm/db";
import { notify } from "@crm/db/notifications";
import { jsonText } from "@crm/validation/json-text";
import { z } from "zod";
import { getFastClient } from "../extraction";
import { ASSIST } from "./assist-config";

const found = z.object({
	promises: z
		.array(
			z.object({
				owner: z.enum(["us", "lead"]),
				text: z.string().min(3).max(240),
				dueAt: z.string().nullable().catch(null),
				quote: z.string().catch(""),
			}),
		)
		.catch([]),
	fulfilled: z.array(z.string()).catch([]),
});

function normalize(text: string): string {
	return text.toLowerCase().replace(/\s+/g, " ").trim();
}

function validDate(value: string | null): Date | null {
	if (!value) return null;
	const date = new Date(value);
	return Number.isNaN(date.getTime()) ? null : date;
}

export async function trackCommitments(input: {
	jobId: string;
	dealId: string;
	contactId: string | null;
	conversation: string;
	sourceKind: string;
	usName: string;
}): Promise<{ added: number; kept: number }> {
	if (!input.conversation.trim()) return { added: 0, kept: 0 };
	const open = await db.commitment.findMany({
		where: { dealId: input.dealId, status: { in: ["open", "overdue"] } },
		select: { id: true, owner: true, text: true },
	});

	const { ai, model } = getFastClient();
	const prompt = [
		`Find every concrete promise in this sales conversation. "us" is ${input.usName}; "lead" is the other side.`,
		"A promise is a commitment to do something specific: send a proposal, share pricing, get approval, book a demo, reply by a date.",
		"Ignore vague pleasantries. Resolve relative dates against the message timestamps. dueAt is ISO 8601 or null.",
		"quote must be copied word for word from the conversation.",
		"Also list the ids of the open promises below that this conversation shows were done.",
		"",
		"Open promises:",
		...open.map((c) => `- ${c.id}: (${c.owner}) ${c.text}`),
		"",
		"Conversation:",
		input.conversation,
		"",
		'Return JSON: {"promises": [{"owner": "us"|"lead", "text": string, "dueAt": string|null, "quote": string}], "fulfilled": string[]}',
	].join("\n");
	const response = await ai.models.generateContent({
		model,
		contents: prompt,
		config: { responseMimeType: "application/json", temperature: 0 },
	});
	const parsed = jsonText.pipe(found).safeParse(response.text ?? "");
	if (!parsed.success) return { added: 0, kept: 0 };

	const source = normalize(input.conversation);
	let added = 0;
	for (const promise of parsed.data.promises) {
		if (!promise.quote || !source.includes(normalize(promise.quote))) continue;
		const dueAt = validDate(promise.dueAt);
		const existing = await db.commitment.findUnique({
			where: { dealId_text: { dealId: input.dealId, text: promise.text } },
			select: { id: true },
		});
		if (existing) continue;
		let taskId: string | null = null;
		if (promise.owner === "us") {
			const owner = await db.deal.findUnique({
				where: { id: input.dealId },
				select: { ownerId: true },
			});
			const task = await db.activity.create({
				data: {
					type: ActivityType.TASK,
					subject: `Promise: ${promise.text}`,
					dueAt,
					dealId: input.dealId,
					contactId: input.contactId,
					createdById: owner?.ownerId ?? "system",
					occurredAt: new Date(),
				},
				select: { id: true },
			});
			taskId = task.id;
		}
		await db.commitment.create({
			data: {
				dealId: input.dealId,
				contactId: input.contactId,
				owner: promise.owner,
				text: promise.text,
				dueAt,
				quote: promise.quote,
				sourceKind: input.sourceKind,
				jobId: input.jobId,
				taskId,
			},
		});
		added += 1;
	}

	const openIds = new Set(open.map((c) => c.id));
	const keptIds = parsed.data.fulfilled.filter((id) => openIds.has(id));
	if (keptIds.length > 0) {
		await db.commitment.updateMany({
			where: { id: { in: keptIds } },
			data: { status: "kept", resolvedAt: new Date() },
		});
	}
	return { added, kept: keptIds.length };
}

export async function flagOverdueCommitments(): Promise<number> {
	const cutoff = new Date(Date.now() - ASSIST.commitments.overdueGraceMs);
	const late = await db.commitment.findMany({
		where: { status: "open", dueAt: { lt: cutoff } },
		select: {
			id: true,
			owner: true,
			text: true,
			dealId: true,
			deal: { select: { name: true } },
		},
		take: 100,
	});
	for (const commitment of late) {
		await db.commitment.update({
			where: { id: commitment.id },
			data: { status: "overdue" },
		});
		await notify(db, {
			kind: "promise.overdue",
			title:
				commitment.owner === "us"
					? `We missed a promise on ${commitment.deal?.name ?? "a deal"}`
					: `${commitment.deal?.name ?? "A lead"}: the lead's promise is overdue`,
			body: commitment.text,
			entity: commitment.dealId ? "deal" : undefined,
			entityId: commitment.dealId ?? undefined,
			source: "promise",
			slack: commitment.owner === "us",
		});
	}
	return late.length;
}

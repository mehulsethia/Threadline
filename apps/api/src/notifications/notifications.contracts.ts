import { z } from "zod";

export const notificationListInput = z.object({
	limit: z.number().int().min(1).max(100).default(30),
});

export const notificationItemOutput = z.object({
	id: z.string(),
	kind: z.string(),
	title: z.string(),
	body: z.string().nullable(),
	entity: z.enum(["contact", "deal", "company"]).nullable(),
	entityId: z.string().nullable(),
	source: z.string().nullable(),
	createdAt: z.string(),
	read: z.boolean(),
});

export const notificationListOutput = z.object({
	items: z.array(notificationItemOutput),
	unread: z.number().int(),
});

export const notificationMarkReadInput = z.object({
	ids: z.array(z.string()).max(200).optional(),
});

export const notificationMarkReadOutput = z.object({
	updated: z.number().int(),
});

export type NotificationListOutput = z.infer<typeof notificationListOutput>;

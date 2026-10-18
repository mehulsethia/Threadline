import { z } from "zod";

export const leadFormOutput = z.object({
	id: z.string(),
	title: z.string(),
	description: z.string().nullable(),
	thankYou: z.string().nullable(),
	active: z.boolean(),
	submissions: z.number(),
	path: z.string(),
	createdAt: z.string(),
});

export const leadFormListOutput = z.array(leadFormOutput);

export const leadFormCreateInput = z.object({
	title: z.string().trim().min(1).max(120),
	description: z.string().trim().max(500).nullable().optional(),
	thankYou: z.string().trim().max(300).nullable().optional(),
});

export const leadFormUpdateInput = z.object({
	id: z.string().min(1),
	title: z.string().trim().min(1).max(120).optional(),
	description: z.string().trim().max(500).nullable().optional(),
	thankYou: z.string().trim().max(300).nullable().optional(),
	active: z.boolean().optional(),
});

export const leadFormIdInput = z.object({ id: z.string().min(1) });

export const publicSubmission = z.object({
	name: z.string().trim().min(1).max(120),
	email: z.email().max(200),
	phone: z.string().trim().max(40).optional().default(""),
	company: z.string().trim().max(160).optional().default(""),
	message: z.string().trim().min(1).max(4_000),
	website: z.string().max(500).optional().default(""),
});

export type LeadFormOutput = z.infer<typeof leadFormOutput>;

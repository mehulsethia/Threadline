import { citedEvidenceItem } from "@crm/validation/cited-evidence";
import { z } from "zod";

export const revivalListInput = z.object({
	status: z
		.enum(["PENDING_APPROVAL", "APPROVED", "SENT", "REJECTED"])
		.optional(),
});

export const revivalDraftItem = z.object({
	id: z.string(),
	dealId: z.string(),
	dealName: z.string(),
	dealStage: z.string(),
	dealValue: z.number().nullable(),
	dealCurrency: z.string(),
	contactId: z.string(),
	contactName: z.string(),
	contactPhone: z.string().nullable(),
	contactEmail: z.string().nullable(),
	companyName: z.string().nullable(),
	channel: z.string(),
	strategy: z.string().nullable(),
	contextRationale: z.string(),
	draftText: z.string(),
	subject: z.string().nullable(),
	confidence: z.number().nullable(),
	citedEvidence: z.array(citedEvidenceItem),
	stalledReason: z.string().nullable(),
	priorityScore: z.number().nullable(),
	status: z.string(),
	waLink: z.string().nullable(),
	createdAt: z.string(),
});

export const revivalListOutput = z.object({
	drafts: z.array(revivalDraftItem),
});

export const revivalRunInput = z.object({});

export const revivalRunOutput = z.object({
	queued: z.boolean(),
	message: z.string(),
});

export const revivalApproveInput = z.object({
	draftId: z.string(),
	draftText: z.string().optional(),
});

export const revivalApproveOutput = z.object({
	success: z.boolean(),
	status: z.string(),
	actionUrl: z.string().nullable(),
});

export const revivalUpdateInput = z.object({
	draftId: z.string(),
	draftText: z.string(),
	subject: z.string().optional(),
});

export const revivalUpdateOutput = z.object({
	success: z.boolean(),
});

export const revivalRejectInput = z.object({
	draftId: z.string(),
});

export const revivalRejectOutput = z.object({
	success: z.boolean(),
});

export const revivalSettingsInput = z.object({});

export const revivalSettingsOutput = z.object({
	slas: z.record(z.string(), z.number()),
	playbook: z.string(),
});

export const revivalUpdateSettingsInput = z.object({
	slas: z.record(z.string(), z.number()).optional(),
	playbook: z.string().optional(),
});

export const revivalUpdateSettingsOutput = z.object({
	success: z.boolean(),
	slas: z.record(z.string(), z.number()),
	playbook: z.string(),
});

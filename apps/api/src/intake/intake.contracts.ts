import { IntakeJobStatus, IntakeSourceType } from "@crm/db";
import { z } from "zod";

const intakeJobStatusEnum = z.enum(
	Object.values(IntakeJobStatus) as [IntakeJobStatus, ...IntakeJobStatus[]],
);

const intakeSourceTypeEnum = z.enum(
	Object.values(IntakeSourceType) as [IntakeSourceType, ...IntakeSourceType[]],
);

export const intakePreviewInput = z.object({
	jobId: z.string().optional(),
	fileUrl: z.string().optional(),
});

export type IntakePreviewInput = z.infer<typeof intakePreviewInput>;

export const intakePreviewOutput = z.object({
	participants: z.array(z.string()),
	me: z.string(),
	lead: z.string(),
	confidence: z.number(),
	autoDetected: z.boolean(),
	messageCount: z.number(),
});

export type IntakePreviewOutput = z.infer<typeof intakePreviewOutput>;

export const intakeStartInput = z.object({
	jobId: z.string(),
	me: z.string().optional(),
});

export type IntakeStartInput = z.infer<typeof intakeStartInput>;

export const intakeStartOutput = z.object({
	jobId: z.string(),
	status: intakeJobStatusEnum,
	queued: z.boolean(),
});

export type IntakeStartOutput = z.infer<typeof intakeStartOutput>;

export const intakeStatusInput = z.object({
	jobId: z.string(),
});

export type IntakeStatusInput = z.infer<typeof intakeStatusInput>;

export const intakeTimelineEventOutput = z.object({
	id: z.string(),
	tool: z.string(),
	message: z.string(),
	timestamp: z.date().or(z.string()),
	data: z.record(z.string(), z.unknown()).optional(),
});

export type IntakeTimelineEventOutput = z.infer<
	typeof intakeTimelineEventOutput
>;

export const intakeStatusOutput = z.object({
	id: z.string(),
	status: intakeJobStatusEnum,
	sourceType: intakeSourceTypeEnum,
	fileUrl: z.string(),
	summary: z.unknown().nullable().optional(),
	error: z.string().nullable().optional(),
	createdContactIds: z.array(z.string()),
	createdDealIds: z.array(z.string()),
	createdAt: z.date().or(z.string()),
	updatedAt: z.date().or(z.string()),
	timeline: z.array(intakeTimelineEventOutput),
});

export type IntakeStatusOutput = z.infer<typeof intakeStatusOutput>;

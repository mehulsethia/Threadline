import { Inject } from "@nestjs/common";
import { Input, Mutation, Query, Router, UseMiddlewares } from "nestjs-trpc";
import type { z } from "zod";
import { AuthMiddleware } from "../trpc/middlewares/auth.middleware";
import { restMeta } from "../trpc/openapi";
import {
	intakePreviewInput,
	intakePreviewOutput,
	intakeStartInput,
	intakeStartOutput,
	intakeStatusInput,
	intakeStatusOutput,
} from "./intake.contracts";
import { IntakeService } from "./intake.service";

@Router({ alias: "intake" })
@UseMiddlewares(AuthMiddleware)
export class IntakeRouter {
	constructor(@Inject(IntakeService) private readonly intake: IntakeService) {}

	@Query({
		input: intakePreviewInput,
		output: intakePreviewOutput,
		meta: restMeta("POST", "/intake/preview", ["Intake"]),
	})
	async previewParticipants(
		@Input() input: z.infer<typeof intakePreviewInput>,
	) {
		return this.intake.previewParticipants(input);
	}

	@Mutation({
		input: intakeStartInput,
		output: intakeStartOutput,
		meta: restMeta("POST", "/intake/start", ["Intake"]),
	})
	async start(@Input() input: z.infer<typeof intakeStartInput>) {
		return this.intake.start(input);
	}

	@Query({
		input: intakeStatusInput,
		output: intakeStatusOutput,
		meta: restMeta("GET", "/intake/status", ["Intake"]),
	})
	async status(@Input() input: z.infer<typeof intakeStatusInput>) {
		return this.intake.status(input.jobId);
	}
}

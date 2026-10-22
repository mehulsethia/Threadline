import { Inject } from "@nestjs/common";
import {
	Ctx,
	Input,
	Mutation,
	Query,
	Router,
	UseMiddlewares,
} from "nestjs-trpc";
import type { z } from "zod";
import type { AuthedTrpcContext } from "../trpc/context.types";
import { AuthMiddleware } from "../trpc/middlewares/auth.middleware";
import { restMeta } from "../trpc/openapi";
import {
	revivalApproveInput,
	revivalApproveOutput,
	revivalListInput,
	revivalListOutput,
	revivalRejectInput,
	revivalRejectOutput,
	revivalRunInput,
	revivalRunOutput,
	revivalSettingsInput,
	revivalSettingsOutput,
	revivalUpdateInput,
	revivalUpdateOutput,
	revivalUpdateSettingsInput,
	revivalUpdateSettingsOutput,
} from "./revival.contracts";
import { RevivalService } from "./revival.service";

@Router({ alias: "revival" })
@UseMiddlewares(AuthMiddleware)
export class RevivalRouter {
	constructor(
		@Inject(RevivalService) private readonly revival: RevivalService,
	) {}

	@Query({
		input: revivalListInput,
		output: revivalListOutput,
		meta: restMeta("GET", "/revival/drafts", ["Revival"]),
	})
	async listDrafts(@Input() input: z.infer<typeof revivalListInput>) {
		return this.revival.listDrafts(input);
	}

	@Mutation({
		input: revivalRunInput,
		output: revivalRunOutput,
		meta: restMeta("POST", "/revival/run", ["Revival"]),
	})
	async runNow(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() _input: z.infer<typeof revivalRunInput>,
	) {
		return this.revival.runNow(ctx.user.id);
	}

	@Mutation({
		input: revivalApproveInput,
		output: revivalApproveOutput,
		meta: restMeta("POST", "/revival/approve", ["Revival"]),
	})
	async approveAndSend(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof revivalApproveInput>,
	) {
		return this.revival.approveAndSend(input, ctx.user.id);
	}

	@Mutation({
		input: revivalUpdateInput,
		output: revivalUpdateOutput,
		meta: restMeta("POST", "/revival/update", ["Revival"]),
	})
	async updateDraft(@Input() input: z.infer<typeof revivalUpdateInput>) {
		return this.revival.updateDraft(input);
	}

	@Mutation({
		input: revivalRejectInput,
		output: revivalRejectOutput,
		meta: restMeta("POST", "/revival/reject", ["Revival"]),
	})
	async rejectDraft(@Input() input: z.infer<typeof revivalRejectInput>) {
		return this.revival.rejectDraft(input);
	}

	@Query({
		input: revivalSettingsInput,
		output: revivalSettingsOutput,
		meta: restMeta("GET", "/revival/settings", ["Revival"]),
	})
	async getSettings(@Input() _input: z.infer<typeof revivalSettingsInput>) {
		return this.revival.getSettings();
	}

	@Mutation({
		input: revivalUpdateSettingsInput,
		output: revivalUpdateSettingsOutput,
		meta: restMeta("POST", "/revival/settings", ["Revival"]),
	})
	async updateSettings(
		@Input() input: z.infer<typeof revivalUpdateSettingsInput>,
	) {
		return this.revival.updateSettings(input);
	}
}

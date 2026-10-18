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
	askInput,
	askOutput,
	briefOutput,
	dealInput,
	draftInput,
	draftOutput,
	forecastOutput,
	insightsOutput,
	okOutput,
	promiseListInput,
	promiseListOutput,
	promiseUpdateInput,
	rescoreAllOutput,
} from "./assist.contracts";
import { AssistService } from "./assist.service";

@Router({ alias: "assist" })
@UseMiddlewares(AuthMiddleware)
export class AssistRouter {
	constructor(@Inject(AssistService) private readonly assist: AssistService) {}

	@Mutation({
		input: askInput,
		output: askOutput,
		meta: restMeta("POST", "/assist/ask", ["Assist"]),
	})
	ask(@Ctx() ctx: AuthedTrpcContext, @Input() input: z.infer<typeof askInput>) {
		return this.assist.ask(ctx.user.id, input.history);
	}

	@Mutation({
		input: draftInput,
		output: draftOutput.nullable(),
		meta: restMeta("POST", "/assist/draft", ["Assist"]),
	})
	draft(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof draftInput>,
	) {
		return this.assist.draft(ctx.user.id, input);
	}

	@Mutation({
		input: dealInput,
		output: briefOutput.nullable(),
		meta: restMeta("POST", "/assist/brief", ["Assist"]),
	})
	brief(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof dealInput>,
	) {
		return this.assist.brief(ctx.user.id, input.dealId);
	}

	@Mutation({
		input: dealInput,
		output: insightsOutput,
		meta: restMeta("POST", "/assist/rescore", ["Assist"]),
	})
	rescore(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof dealInput>,
	) {
		return this.assist.rescore(ctx.user.id, input.dealId);
	}

	@Mutation({
		output: rescoreAllOutput,
		meta: restMeta("POST", "/assist/rescore-all", ["Assist"]),
	})
	rescoreAll(@Ctx() ctx: AuthedTrpcContext) {
		return this.assist.rescoreAll(ctx.user.id);
	}

	@Query({
		input: dealInput,
		output: insightsOutput,
		meta: restMeta("GET", "/assist/insights", ["Assist"]),
	})
	insights(@Input() input: z.infer<typeof dealInput>) {
		return this.assist.insights(input.dealId);
	}

	@Query({
		output: forecastOutput,
		meta: restMeta("GET", "/assist/forecast", ["Assist"]),
	})
	forecast() {
		return this.assist.forecast();
	}

	@Query({
		input: promiseListInput,
		output: promiseListOutput,
		meta: restMeta("GET", "/assist/promises", ["Assist"]),
	})
	promises(@Input() input: z.infer<typeof promiseListInput>) {
		return this.assist.promises(input.status);
	}

	@Mutation({
		input: promiseUpdateInput,
		output: okOutput,
		meta: restMeta("PATCH", "/assist/promises", ["Assist"]),
	})
	updatePromise(@Input() input: z.infer<typeof promiseUpdateInput>) {
		return this.assist.updatePromise(input.id, input.status);
	}
}

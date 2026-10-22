import { Inject } from "@nestjs/common";
import { Ctx, Input, Query, Router, UseMiddlewares } from "nestjs-trpc";
import type { z } from "zod";
import type { AuthedTrpcContext } from "../trpc/context.types";
import { AuthMiddleware } from "../trpc/middlewares/auth.middleware";
import { restMeta } from "../trpc/openapi";
import { AgentFeedService } from "./agent-feed.service";
import {
	agentFeedOutput,
	dashboardSummaryInput,
	dashboardSummaryOutput,
} from "./dashboard.contracts";
import { DashboardService } from "./dashboard.service";

@Router({ alias: "dashboard" })
@UseMiddlewares(AuthMiddleware)
export class DashboardRouter {
	constructor(
		@Inject(DashboardService) private readonly dashboard: DashboardService,
		@Inject(AgentFeedService) private readonly feed: AgentFeedService,
	) {}

	@Query({
		output: agentFeedOutput,
		meta: restMeta("GET", "/dashboard/agent-activity", ["Dashboard"]),
	})
	async agentActivity() {
		return this.feed.activity();
	}

	@Query({
		input: dashboardSummaryInput,
		output: dashboardSummaryOutput,
		meta: restMeta("GET", "/dashboard/summary", ["Dashboard"]),
	})
	async summary(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof dashboardSummaryInput>,
	) {
		return this.dashboard.summary(ctx.user.id, input);
	}
}

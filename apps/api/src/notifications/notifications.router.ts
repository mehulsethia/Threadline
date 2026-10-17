import { Inject } from "@nestjs/common";
import { Input, Mutation, Query, Router, UseMiddlewares } from "nestjs-trpc";
import type { z } from "zod";
import { AuthMiddleware } from "../trpc/middlewares/auth.middleware";
import { restMeta } from "../trpc/openapi";
import {
	notificationListInput,
	notificationListOutput,
	notificationMarkReadInput,
	notificationMarkReadOutput,
} from "./notifications.contracts";
import { NotificationsService } from "./notifications.service";

@Router({ alias: "notifications" })
@UseMiddlewares(AuthMiddleware)
export class NotificationsRouter {
	constructor(
		@Inject(NotificationsService)
		private readonly notifications: NotificationsService,
	) {}

	@Query({
		input: notificationListInput,
		output: notificationListOutput,
		meta: restMeta("GET", "/notifications", ["Notifications"]),
	})
	async list(@Input() input: z.infer<typeof notificationListInput>) {
		return this.notifications.list(input.limit);
	}

	@Mutation({
		input: notificationMarkReadInput,
		output: notificationMarkReadOutput,
		meta: restMeta("POST", "/notifications/read", ["Notifications"]),
	})
	async markRead(@Input() input: z.infer<typeof notificationMarkReadInput>) {
		return this.notifications.markRead(input.ids);
	}
}

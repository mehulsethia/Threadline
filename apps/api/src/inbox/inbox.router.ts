import { Inject } from "@nestjs/common";
import { Query, Router, UseMiddlewares } from "nestjs-trpc";
import { AuthMiddleware } from "../trpc/middlewares/auth.middleware";
import { restMeta } from "../trpc/openapi";
import { inboxCountOutput, inboxListOutput } from "./inbox.contracts";
import { InboxService } from "./inbox.service";

@Router({ alias: "inbox" })
@UseMiddlewares(AuthMiddleware)
export class InboxRouter {
	constructor(@Inject(InboxService) private readonly inbox: InboxService) {}

	@Query({
		output: inboxListOutput,
		meta: restMeta("GET", "/inbox", ["Inbox"]),
	})
	async list() {
		return this.inbox.list();
	}

	@Query({
		output: inboxCountOutput,
		meta: restMeta("GET", "/inbox/count", ["Inbox"]),
	})
	async count() {
		return this.inbox.count();
	}
}

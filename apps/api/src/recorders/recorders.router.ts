import { Inject } from "@nestjs/common";
import { Input, Mutation, Query, Router, UseMiddlewares } from "nestjs-trpc";
import type { z } from "zod";
import { AuthMiddleware } from "../trpc/middlewares/auth.middleware";
import { restMeta } from "../trpc/openapi";
import {
	recorderRemoveKeyInput,
	recorderSetKeyInput,
	recorderStatusOutput,
	recorderSyncOutput,
} from "./recorders.contracts";
import { RecordersService } from "./recorders.service";

@Router({ alias: "recorders" })
@UseMiddlewares(AuthMiddleware)
export class RecordersRouter {
	constructor(
		@Inject(RecordersService) private readonly recorders: RecordersService,
	) {}

	@Query({
		output: recorderStatusOutput,
		meta: restMeta("GET", "/recorders", ["Recorders"]),
	})
	async status() {
		return this.recorders.status();
	}

	@Mutation({
		input: recorderSetKeyInput,
		output: recorderStatusOutput,
		meta: restMeta("PUT", "/recorders/key", ["Recorders"]),
	})
	async setKey(@Input() input: z.infer<typeof recorderSetKeyInput>) {
		return this.recorders.setKey(input.provider, input.apiKey);
	}

	@Mutation({
		input: recorderRemoveKeyInput,
		output: recorderStatusOutput,
		meta: restMeta("DELETE", "/recorders/key", ["Recorders"]),
	})
	async removeKey(@Input() input: z.infer<typeof recorderRemoveKeyInput>) {
		return this.recorders.removeKey(input.provider);
	}

	@Mutation({
		output: recorderSyncOutput,
		meta: restMeta("POST", "/recorders/sync", ["Recorders"]),
	})
	async syncNow() {
		return this.recorders.syncNow();
	}
}

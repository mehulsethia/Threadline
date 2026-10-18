import { rootDb } from "@crm/db";
import { Inject } from "@nestjs/common";
import {
	Ctx,
	Input,
	Mutation,
	Query,
	Router,
	UseMiddlewares,
} from "nestjs-trpc";
import { z } from "zod";
import { AuthService } from "../auth/auth.service";
import type { AuthedTrpcContext } from "../trpc/context.types";
import { AuthMiddleware } from "../trpc/middlewares/auth.middleware";
import { restMeta } from "../trpc/openapi";
import { UsersService } from "./users.service";

const usersListOutput = z.array(
	z.object({
		id: z.string(),
		name: z.string(),
		email: z.string(),
		image: z.string().nullable(),
	}),
);

const updateProfileInput = z.object({
	name: z.string().trim().min(1).max(120),
});

const updateProfileOutput = z.object({ name: z.string() });

@Router({ alias: "users" })
@UseMiddlewares(AuthMiddleware)
export class UsersRouter {
	constructor(
		@Inject(UsersService) private readonly users: UsersService,
		@Inject(AuthService) private readonly auth: AuthService,
	) {}

	@Query()
	async me(@Ctx() ctx: AuthedTrpcContext) {
		return this.auth.getProfile(ctx.user.id);
	}

	@Mutation({
		input: updateProfileInput,
		output: updateProfileOutput,
		meta: restMeta("PATCH", "/users/me", ["Users"]),
	})
	async updateProfile(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof updateProfileInput>,
	) {
		const user = await rootDb.user.update({
			where: { id: ctx.user.id },
			data: { name: input.name },
			select: { name: true },
		});
		return user;
	}

	@Query({
		output: usersListOutput,
		meta: restMeta("GET", "/users", ["Users"]),
	})
	async list() {
		return this.users.list();
	}
}

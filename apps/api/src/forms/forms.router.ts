import { Inject } from "@nestjs/common";
import { Input, Mutation, Query, Router, UseMiddlewares } from "nestjs-trpc";
import type { z } from "zod";
import { okOutput } from "../assist/assist.contracts";
import { AuthMiddleware } from "../trpc/middlewares/auth.middleware";
import { restMeta } from "../trpc/openapi";
import {
	leadFormCreateInput,
	leadFormIdInput,
	leadFormListOutput,
	leadFormOutput,
	leadFormUpdateInput,
} from "./forms.contracts";
import { FormsService } from "./forms.service";

@Router({ alias: "forms" })
@UseMiddlewares(AuthMiddleware)
export class FormsRouter {
	constructor(@Inject(FormsService) private readonly forms: FormsService) {}

	@Query({
		output: leadFormListOutput,
		meta: restMeta("GET", "/forms", ["Forms"]),
	})
	list() {
		return this.forms.list();
	}

	@Mutation({
		input: leadFormCreateInput,
		output: leadFormOutput,
		meta: restMeta("POST", "/forms", ["Forms"]),
	})
	create(@Input() input: z.infer<typeof leadFormCreateInput>) {
		return this.forms.create(input);
	}

	@Mutation({
		input: leadFormUpdateInput,
		output: leadFormOutput,
		meta: restMeta("PATCH", "/forms", ["Forms"]),
	})
	update(@Input() input: z.infer<typeof leadFormUpdateInput>) {
		return this.forms.update(input);
	}

	@Mutation({
		input: leadFormIdInput,
		output: okOutput,
		meta: restMeta("DELETE", "/forms", ["Forms"]),
	})
	remove(@Input() input: z.infer<typeof leadFormIdInput>) {
		return this.forms.remove(input.id);
	}
}

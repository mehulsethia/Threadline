import type { IncomingMessage } from "node:http";
import type { auth } from "@crm/auth";
import { jsonText } from "@crm/validation/json-text";
import {
	BadRequestException,
	Controller,
	HttpException,
	Post,
	Req,
	Res,
} from "@nestjs/common";
import { ApiExcludeController } from "@nestjs/swagger";
import { Session, type UserSession } from "@thallesp/nestjs-better-auth";
import { TRPCError } from "@trpc/server";
import type { Response } from "express";
import { askInput } from "./assist.contracts";
import { AssistService } from "./assist.service";

type CrmSession = UserSession<typeof auth>;

const MAX_BODY_BYTES = 256_000;

async function readBody(request: IncomingMessage): Promise<string> {
	const chunks: Buffer[] = [];
	let size = 0;
	for await (const chunk of request) {
		const buffer = Buffer.from(chunk);
		size += buffer.length;
		if (size > MAX_BODY_BYTES) throw new BadRequestException("Too large.");
		chunks.push(buffer);
	}
	return Buffer.concat(chunks).toString("utf8");
}

@ApiExcludeController()
@Controller("api/assist")
export class AssistStreamController {
	constructor(private readonly assist: AssistService) {}

	@Post("ask-stream")
	async askStream(
		@Session() session: CrmSession,
		@Req() request: IncomingMessage,
		@Res() response: Response,
	): Promise<void> {
		const parsed = jsonText.pipe(askInput).safeParse(await readBody(request));
		if (!parsed.success) throw new BadRequestException("Ask a question first.");

		let upstream: globalThis.Response;
		try {
			upstream = await this.assist.streamAsk(
				session.user.id,
				parsed.data.history,
			);
		} catch (error) {
			if (error instanceof TRPCError && error.code === "TOO_MANY_REQUESTS") {
				throw new HttpException(error.message, 429);
			}
			throw error;
		}

		if (!upstream.ok || !upstream.body) {
			throw new HttpException(
				"The agent did not answer. Try again.",
				upstream.status || 502,
			);
		}

		response.status(200);
		response.setHeader("content-type", "text/event-stream");
		response.setHeader("cache-control", "no-cache, no-transform");
		response.setHeader("x-accel-buffering", "no");
		response.flushHeaders();

		const reader = upstream.body.getReader();
		request.on("close", () => {
			reader.cancel().catch(() => {});
		});
		for (;;) {
			const { done, value } = await reader.read();
			if (done) break;
			response.write(value);
		}
		response.end();
	}
}

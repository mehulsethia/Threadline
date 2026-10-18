import type { IncomingMessage } from "node:http";
import { jsonText } from "@crm/validation/json-text";
import {
	BadRequestException,
	Controller,
	Get,
	HttpCode,
	HttpException,
	HttpStatus,
	Ip,
	Param,
	Post,
	Req,
} from "@nestjs/common";
import { AllowAnonymous } from "@thallesp/nestjs-better-auth";
import { z } from "zod";
import { publicSubmission } from "./forms.contracts";
import { FormsService } from "./forms.service";

const MAX_BODY_BYTES = 32_000;

const parsedRequest = z
	.object({ body: z.record(z.string(), z.json()).optional() })
	.catch({});

async function readBody(request: IncomingMessage): Promise<string> {
	const parsed = parsedRequest.parse(request).body;
	if (parsed && Object.keys(parsed).length > 0) return JSON.stringify(parsed);
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

const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 5;
const hits = new Map<string, number[]>();

function limited(key: string): boolean {
	const now = Date.now();
	const recent = (hits.get(key) ?? []).filter((at) => now - at < WINDOW_MS);
	recent.push(now);
	hits.set(key, recent);
	return recent.length > MAX_PER_WINDOW;
}

@Controller("api/forms")
export class FormsController {
	constructor(private readonly forms: FormsService) {}

	@AllowAnonymous()
	@Get(":slug/:formId")
	form(@Param("slug") slug: string, @Param("formId") formId: string) {
		return this.forms.publicForm(slug, formId);
	}

	@AllowAnonymous()
	@Post(":slug/:formId")
	@HttpCode(HttpStatus.OK)
	async submit(
		@Param("slug") slug: string,
		@Param("formId") formId: string,
		@Req() request: IncomingMessage,
		@Ip() ip: string,
	) {
		if (limited(`${ip}:${formId}`)) {
			throw new HttpException(
				"Too many submissions. Try again in a minute.",
				HttpStatus.TOO_MANY_REQUESTS,
			);
		}
		const parsed = jsonText
			.pipe(publicSubmission)
			.safeParse(await readBody(request));
		if (!parsed.success) {
			throw new BadRequestException(
				"Please fill in your name, email and message.",
			);
		}
		return this.forms.submit(slug, formId, parsed.data);
	}
}

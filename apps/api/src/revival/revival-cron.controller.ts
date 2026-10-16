import { timingSafeEqual } from "node:crypto";
import {
	Controller,
	ForbiddenException,
	Headers,
	HttpCode,
	HttpStatus,
	Logger,
	Post,
	ServiceUnavailableException,
} from "@nestjs/common";
import { ApiExcludeController } from "@nestjs/swagger";
import { AllowAnonymous } from "@thallesp/nestjs-better-auth";
import { RevivalService } from "./revival.service";

/**
 * Cloud Scheduler's hourly revival tick. It queues a revival cycle and wakes
 * the agent, which scales to zero between ticks. `Bearer <CRON_SECRET>`, like
 * the other internal cron routes; refuses everything when the secret is unset.
 */
@ApiExcludeController()
@Controller("internal/revival")
export class RevivalCronController {
	private readonly logger = new Logger(RevivalCronController.name);

	constructor(private readonly revival: RevivalService) {}

	@Post("run")
	@AllowAnonymous()
	@HttpCode(HttpStatus.ACCEPTED)
	async run(@Headers("authorization") authorization?: string) {
		const secret = process.env.CRON_SECRET;
		if (!secret) {
			this.logger.error("CRON_SECRET is not set; refusing the revival tick.");
			throw new ServiceUnavailableException("Revival cron is not configured.");
		}
		const given = Buffer.from(authorization ?? "");
		const expected = Buffer.from(`Bearer ${secret}`);
		if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
			throw new ForbiddenException();
		}
		return this.revival.runNow();
	}
}

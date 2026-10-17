import type { auth } from "@crm/auth";
import {
	BadRequestException,
	Body,
	Controller,
	HttpCode,
	HttpException,
	HttpStatus,
	Post,
	UploadedFile,
	UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiConsumes, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Session, type UserSession } from "@thallesp/nestjs-better-auth";
import { IntakeService, type UploadedFileRecord } from "./intake.service";

type CrmSession = UserSession<typeof auth>;

@ApiTags("Intake")
@Controller("api/intake")
export class IntakeController {
	constructor(private readonly intake: IntakeService) {}

	// Signed-in members only: an upload starts paid Gemini work and writes
	// records, so it is never open to the internet.
	@Post("upload")
	@HttpCode(HttpStatus.OK)
	@ApiOperation({
		summary: "Upload conversation export or audio recording for intake",
	})
	@ApiConsumes("multipart/form-data")
	@UseInterceptors(
		FileInterceptor("file", {
			limits: { fileSize: 50 * 1024 * 1024 },
		}),
	)
	async upload(
		@Session() session: CrmSession,
		@UploadedFile() file: UploadedFileRecord | undefined,
		@Body("me") me?: string,
		@Body("autoStart") autoStart?: string | boolean,
		@Body("kind") kind?: string,
		@Body("text") text?: string,
	) {
		const pasted = text?.trim();
		const upload: UploadedFileRecord | undefined =
			file ??
			(pasted
				? {
						buffer: Buffer.from(pasted, "utf8"),
						originalname: "pasted-transcript.txt",
						mimetype: "text/plain",
					}
				: undefined);
		if (!upload) {
			throw new BadRequestException("No file or text provided in request");
		}
		if (!(await this.intake.consumeImportQuota(session.user.id))) {
			throw new HttpException(
				"The demo account has used today's imports.",
				HttpStatus.TOO_MANY_REQUESTS,
			);
		}

		const autoStartBool =
			autoStart === "false" || autoStart === false ? false : true;

		return this.intake.uploadAndCreateJob(upload, {
			me,
			autoStart: autoStartBool,
			userId: session.user.id,
			kind:
				kind === "transcript" || (!file && pasted)
					? "transcript"
					: "conversation",
		});
	}
}

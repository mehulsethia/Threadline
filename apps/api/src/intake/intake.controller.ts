import type { auth } from "@crm/auth";
import {
	BadRequestException,
	Body,
	Controller,
	HttpCode,
	HttpStatus,
	Post,
	UploadedFile,
	UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiConsumes, ApiOperation, ApiTags } from "@nestjs/swagger";
import {
	AllowAnonymous,
	Session,
	type UserSession,
} from "@thallesp/nestjs-better-auth";
import { IntakeService, type UploadedFileRecord } from "./intake.service";

type CrmSession = UserSession<typeof auth>;

@ApiTags("Intake")
@Controller("api/intake")
export class IntakeController {
	constructor(private readonly intake: IntakeService) {}

	@Post("upload")
	@AllowAnonymous()
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
		@UploadedFile() file: UploadedFileRecord | undefined,
		@Body("me") me?: string,
		@Body("autoStart") autoStart?: string | boolean,
		@Session() session?: CrmSession,
	) {
		if (!file) {
			throw new BadRequestException("No file provided in request");
		}

		const autoStartBool =
			autoStart === "false" || autoStart === false ? false : true;

		return this.intake.uploadAndCreateJob(file, {
			me,
			autoStart: autoStartBool,
			userId: session?.user?.id ?? null,
		});
	}
}

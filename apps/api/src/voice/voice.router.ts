import { apiUrl } from "@crm/auth";
import { Injectable } from "@nestjs/common";
import {
	Ctx,
	Input,
	Mutation,
	Query,
	Router,
	UseMiddlewares,
} from "nestjs-trpc";
import type { AuthedTrpcContext } from "../trpc/context.types";
import { AuthMiddleware } from "../trpc/middlewares/auth.middleware";
import {
	voiceDealContextInput,
	voiceDealContextOutput,
	voiceLiveTicketOutput,
	voiceTranscribeQualifyInput,
	voiceTranscribeQualifyOutput,
} from "./voice.contracts";
import { VoiceQualifierService } from "./voice-qualifier.service";
import { issueVoiceTicket } from "./voice-ticket";

/** Where the browser opens the call socket: the API's own public origin. */
function voiceWsUrl(): string {
	const explicit = process.env.VOICE_WS_URL;
	if (explicit) return explicit;
	return `${apiUrl.replace(/^http/, "ws")}/api/voice/live`;
}

@Router({ alias: "voice" })
@Injectable()
export class VoiceRouter {
	constructor(private readonly voiceService: VoiceQualifierService) {}

	@Query({
		input: voiceDealContextInput,
		output: voiceDealContextOutput,
	})
	@UseMiddlewares(AuthMiddleware)
	async dealContext(input: { dealId: string }) {
		return await this.voiceService.getDealContext(input.dealId);
	}

	@Mutation({
		input: voiceDealContextInput,
		output: voiceLiveTicketOutput,
	})
	@UseMiddlewares(AuthMiddleware)
	async liveTicket(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: { dealId: string },
	) {
		// Confirms the deal exists before handing out a pass for it.
		await this.voiceService.getDealContext(input.dealId);
		return {
			ticket: issueVoiceTicket(ctx.user.id, input.dealId),
			wsUrl: voiceWsUrl(),
		};
	}

	@Mutation({
		input: voiceTranscribeQualifyInput,
		output: voiceTranscribeQualifyOutput,
	})
	@UseMiddlewares(AuthMiddleware)
	async transcribeQualify(input: {
		dealId: string;
		audioBase64: string;
		mimeType?: string;
	}) {
		const audioBuffer = Buffer.from(input.audioBase64, "base64");
		return await this.voiceService.transcribeAndQualify({
			dealId: input.dealId,
			audioBuffer,
			mimeType: input.mimeType,
		});
	}
}

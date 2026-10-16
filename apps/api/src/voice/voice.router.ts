import { Injectable } from "@nestjs/common";
import { Mutation, Query, Router, UseMiddlewares } from "nestjs-trpc";
import { AuthMiddleware } from "../trpc/middlewares/auth.middleware";
import {
	voiceDealContextInput,
	voiceDealContextOutput,
	voiceTranscribeQualifyInput,
	voiceTranscribeQualifyOutput,
} from "./voice.contracts";
import { VoiceQualifierService } from "./voice-qualifier.service";

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

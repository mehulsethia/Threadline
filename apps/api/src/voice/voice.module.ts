import { Module } from "@nestjs/common";
import { TrpcModule } from "../trpc/trpc.module";
import { VoiceRouter } from "./voice.router";
import { VoiceQualifierGateway } from "./voice-qualifier.gateway";
import { VoiceQualifierService } from "./voice-qualifier.service";

@Module({
	imports: [TrpcModule],
	providers: [VoiceQualifierService, VoiceQualifierGateway, VoiceRouter],
	exports: [VoiceQualifierService],
})
export class VoiceModule {}

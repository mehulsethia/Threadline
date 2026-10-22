import type { Db } from "@crm/db";
import { consumeDemoQuota } from "@crm/db/demo";
import {
	type VoiceDealContext,
	type VoiceTranscribeRequest,
	type VoiceTranscribeResult,
	voiceDealContext,
	voiceTranscribeResult,
} from "@crm/validation/voice";
import { Injectable } from "@nestjs/common";
import { callAgent } from "../agent/agent-call";
import { InjectDatabase } from "../database/database.constants";
import { VOICE } from "./voice-config";

@Injectable()
export class VoiceQualifierService {
	constructor(@InjectDatabase() private readonly db: Db) {}

	consumeCallQuota(userId: string): Promise<boolean> {
		return consumeDemoQuota(this.db, userId, "voice");
	}

	dealContext(dealId: string): Promise<VoiceDealContext> {
		return callAgent(
			"/internal/crm/voice/context",
			{ dealId },
			voiceDealContext,
			VOICE.agent.contextTimeoutMs,
		);
	}

	transcribe(input: VoiceTranscribeRequest): Promise<VoiceTranscribeResult> {
		return callAgent(
			"/internal/crm/voice/transcribe",
			input,
			voiceTranscribeResult,
			VOICE.agent.transcribeTimeoutMs,
		);
	}
}

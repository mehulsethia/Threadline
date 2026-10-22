export const VOICE = {
	live: {
		model: "gemini-live-2.5-flash-native-audio",
		location: "us-central1",
		inputMimeType: "audio/pcm;rate=16000",
	},
	transcribe: { model: "gemini-4-argon", location: "global" },
	wrapUp: {
		model: "gemini-4-argon",
		location: "global",
		minLeadTurns: 1,
		draftPriority: 100,
		maxTranscriptCharacters: 20_000,
	},
	evidenceScore: 0.9,
} as const;

export function liveModel(): string {
	return process.env.GEMINI_LIVE_MODEL || VOICE.live.model;
}

export function liveLocation(): string {
	return process.env.GEMINI_LIVE_LOCATION || VOICE.live.location;
}

export function transcribeModel(): string {
	return process.env.GEMINI_FAST_MODEL || VOICE.transcribe.model;
}

export function transcribeLocation(): string {
	return process.env.GEMINI_FAST_LOCATION || VOICE.transcribe.location;
}

export function wrapUpModel(): string {
	return process.env.GEMINI_SMART_MODEL || VOICE.wrapUp.model;
}

export function wrapUpLocation(): string {
	return process.env.GEMINI_SMART_LOCATION || VOICE.wrapUp.location;
}

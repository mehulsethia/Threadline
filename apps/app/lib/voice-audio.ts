const SECOND_MS = 1000;

export const VOICE_CALL = {
	connectTimeoutMs: 45 * SECOND_MS,
	maxCallSeconds: 180,
	input: { sampleRate: 16_000, frameSize: 2048 },
	output: { sampleRate: 24_000, leadMs: 0.05 * SECOND_MS },
	bargeIn: {
		floorRms: 0.012,
		echoRatio: 0.18,
		tailMs: 0.4 * SECOND_MS,
		preRollFrames: 2,
		holdFrames: 4,
	},
} as const;

export type PlaybackQueue = {
	play: (base64Pcm: string) => void;
	flush: () => void;
	isPlaying: () => boolean;
	level: () => number;
	close: () => void;
};

export function createPlaybackQueue(
	onSpeakingChange: (speaking: boolean) => void,
): PlaybackQueue {
	const ctx = new AudioContext({ sampleRate: VOICE_CALL.output.sampleRate });
	const analyser = ctx.createAnalyser();
	analyser.fftSize = 1024;
	analyser.connect(ctx.destination);
	const probe = new Float32Array(analyser.fftSize);
	const sources = new Set<AudioBufferSourceNode>();
	let nextStart = 0;
	let lastEndedAt = 0;

	const play = (base64Pcm: string) => {
		if (ctx.state === "suspended") void ctx.resume();
		const samples = decodePcm16Base64(base64Pcm);
		if (samples.length === 0) return;

		const buffer = ctx.createBuffer(
			1,
			samples.length,
			VOICE_CALL.output.sampleRate,
		);
		buffer.copyToChannel(samples, 0);

		const source = ctx.createBufferSource();
		source.buffer = buffer;
		source.connect(analyser);

		const earliest = ctx.currentTime + VOICE_CALL.output.leadMs / SECOND_MS;
		const startAt = Math.max(nextStart, earliest);
		source.start(startAt);
		nextStart = startAt + buffer.duration;

		if (sources.size === 0) onSpeakingChange(true);
		sources.add(source);
		source.onended = () => {
			sources.delete(source);
			if (sources.size === 0) {
				lastEndedAt = performance.now();
				onSpeakingChange(false);
			}
		};
	};

	const flush = () => {
		for (const source of sources) {
			source.onended = null;
			try {
				source.stop();
			} catch {}
		}
		sources.clear();
		nextStart = 0;
		lastEndedAt = performance.now();
		onSpeakingChange(false);
	};

	return {
		play,
		flush,
		isPlaying: () =>
			sources.size > 0 ||
			performance.now() - lastEndedAt < VOICE_CALL.bargeIn.tailMs,
		level: () => {
			if (sources.size === 0) return 0;
			analyser.getFloatTimeDomainData(probe);
			return rms(probe);
		},
		close: () => {
			flush();
			void ctx.close();
		},
	};
}

export type MicGate = {
	accept: (
		frame: Float32Array,
		playback: PlaybackQueue | null,
	) => Float32Array[];
};

export function createMicGate(): MicGate {
	const recent: Float32Array[] = [];
	let hold = 0;

	return {
		accept: (frame, playback) => {
			const copy = new Float32Array(frame);
			if (!playback?.isPlaying()) {
				hold = 0;
				recent.length = 0;
				return [copy];
			}

			const threshold = Math.max(
				VOICE_CALL.bargeIn.floorRms,
				playback.level() * VOICE_CALL.bargeIn.echoRatio,
			);
			if (rms(copy) > threshold) {
				const opening = hold === 0 ? recent.splice(0) : [];
				hold = VOICE_CALL.bargeIn.holdFrames;
				return [...opening, copy];
			}
			if (hold > 0) {
				hold -= 1;
				return [copy];
			}

			recent.push(copy);
			if (recent.length > VOICE_CALL.bargeIn.preRollFrames) recent.shift();
			return [new Float32Array(copy.length)];
		},
	};
}

export function rms(samples: Float32Array): number {
	let sum = 0;
	for (const sample of samples) sum += sample * sample;
	return samples.length === 0 ? 0 : Math.sqrt(sum / samples.length);
}

export function encodePcm16Base64(samples: Float32Array): string {
	const pcm16 = new Int16Array(samples.length);
	for (let i = 0; i < samples.length; i++) {
		const s = Math.max(-1, Math.min(1, samples[i] ?? 0));
		pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
	}
	const bytes = new Uint8Array(pcm16.buffer);
	let binary = "";
	for (let i = 0; i < bytes.length; i++) {
		binary += String.fromCharCode(bytes[i] ?? 0);
	}
	return btoa(binary);
}

function decodePcm16Base64(base64Pcm: string): Float32Array<ArrayBuffer> {
	const binary = atob(base64Pcm);
	const bytes = new Uint8Array(binary.length - (binary.length % 2));
	for (let i = 0; i < bytes.length; i++) bytes[i] = binary.charCodeAt(i);
	const pcm16 = new Int16Array(bytes.buffer);
	const samples = new Float32Array(pcm16.length);
	for (let i = 0; i < pcm16.length; i++) samples[i] = (pcm16[i] ?? 0) / 32768;
	return samples;
}

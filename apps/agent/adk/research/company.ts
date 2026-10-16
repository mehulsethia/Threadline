import { getSmartClient } from "../extraction";

export type ResearchCompanyInput = {
	companyName: string;
	city?: string | null;
	domain?: string | null;
};

export type ResearchCompanyResult = {
	overview?: string;
	sizeSignals?: string;
	location?: string;
	recentNews?: string;
	sourceUrls: string[];
	latencyMs: number;
	estimatedCostUsd: number;
};

export async function researchCompany(
	input: ResearchCompanyInput,
): Promise<ResearchCompanyResult | null> {
	const companyName = input.companyName?.trim();
	if (!companyName) {
		return null;
	}

	const locationHint = input.city?.trim();
	const domainHint = input.domain?.trim();

	const queryParts = [companyName];
	if (locationHint) queryParts.push(locationHint);
	if (domainHint) queryParts.push(domainHint);

	const prompt = [
		`Research the business "${companyName}" (${queryParts.join(", ")}).`,
		"Provide a concise profile covering what they do, size signals, location, and recent news.",
		"Return a valid JSON object matching this schema exactly:",
		JSON.stringify({
			overview: "Concise 1-2 sentence description of what they sell and who to",
			sizeSignals: "Headcount, scale, or revenue signals if found",
			location: "Headquarters or primary cities",
			recentNews: "Recent products, funding, or press items if found",
		}),
	].join("\n");

	const { ai, model } = getSmartClient();
	const start = Date.now();

	let rawText = "";
	const sourceUrls: string[] = [];
	let tokenCount = 600;

	try {
		const res = await ai.models.generateContent({
			model,
			contents: prompt,
			config: {
				tools: [{ googleSearch: {} }],
			},
		});

		rawText = res.text || "";
		if (res.usageMetadata?.totalTokenCount) {
			tokenCount = res.usageMetadata.totalTokenCount;
		}

		const candidate = res.candidates?.[0];
		const chunks = candidate?.groundingMetadata?.groundingChunks || [];
		for (const chunk of chunks) {
			const uri = chunk.web?.uri;
			if (
				typeof uri === "string" &&
				uri.startsWith("http") &&
				!sourceUrls.includes(uri)
			) {
				sourceUrls.push(uri);
			}
		}
	} catch (error) {
		console.error(
			`[ResearchCompany] Failed to research "${companyName}":`,
			error,
		);
		return null;
	}

	const latencyMs = Date.now() - start;
	const estimatedCostUsd = 0.035 + (tokenCount / 1000) * 0.005;

	console.log(
		`[ResearchCompany] Grounded research for "${companyName}": latency=${latencyMs}ms, cost=$${estimatedCostUsd.toFixed(4)}, citations=${sourceUrls.length}`,
	);

	let overview: string | undefined;
	let sizeSignals: string | undefined;
	let location: string | undefined;
	let recentNews: string | undefined;

	try {
		const cleaned = rawText
			.replace(/^```json\s*/i, "")
			.replace(/^```\s*/i, "")
			.replace(/\s*```$/i, "")
			.trim();
		const parsed = JSON.parse(cleaned) as Record<string, unknown>;

		if (typeof parsed.overview === "string" && parsed.overview.trim()) {
			overview = parsed.overview.trim();
		}
		if (typeof parsed.sizeSignals === "string" && parsed.sizeSignals.trim()) {
			sizeSignals = parsed.sizeSignals.trim();
		}
		if (typeof parsed.location === "string" && parsed.location.trim()) {
			location = parsed.location.trim();
		}
		if (typeof parsed.recentNews === "string" && parsed.recentNews.trim()) {
			recentNews = parsed.recentNews.trim();
		}
	} catch {
		if (rawText.trim()) {
			overview = rawText.slice(0, 300).trim();
		}
	}

	return {
		overview,
		sizeSignals,
		location,
		recentNews,
		sourceUrls,
		latencyMs,
		estimatedCostUsd,
	};
}

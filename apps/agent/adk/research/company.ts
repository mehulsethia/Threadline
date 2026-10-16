import { getFastClient } from "../extraction";

export type ResearchCompanyInput = {
	companyName: string;
	city?: string | null;
	domain?: string | null;
	industryContext?: string | null;
};

export type ResearchCompanyResult = {
	entityMatched?: string | null;
	matchConfidence: number;
	matchReasons: string[];
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
	const industryHint = input.industryContext?.trim();

	const prompt = [
		`Research the business entity "${companyName}".`,
		locationHint ? `Known location: ${locationHint}` : "",
		domainHint ? `Known domain: ${domainHint}` : "",
		industryHint ? `Conversation context: ${industryHint}` : "",
		"",
		"Entity Match Verification Task:",
		`1. Search for public information about the company "${companyName}".`,
		"2. Critically verify whether any discovered web entities match this exact target business.",
		"   - Compare the company name strictly. Do NOT confuse different companies that share a partial word (e.g. 'Datacore Cloud' is a different entity from 'DataCore Software'; do not match 'DataCore Software' when searching for 'Datacore Cloud').",
		locationHint
			? `   - Verify whether the found entity is located in or operates in "${locationHint}".`
			: "",
		domainHint
			? `   - Verify whether the found entity uses domain "${domainHint}".`
			: "",
		industryHint
			? `   - Verify whether the found entity operates in the industry or deals with the products described in: "${industryHint}".`
			: "",
		"3. Assign a matchConfidence score between 0.0 and 1.0:",
		"   - 0.80 - 1.00: High confidence exact entity match (name matches and location/domain/product align).",
		"   - 0.70 - 0.79: Reasonable match with minor name variation but matching product and location.",
		"   - 0.00 - 0.69: Unconfident, ambiguous, or matched a completely different company (e.g. DataCore Software for Datacore Cloud).",
		"4. Provide matchReasons: an array of concise reasons explaining why the entity matches or why it failed to match.",
		"5. If matchConfidence >= 0.70, provide overview, sizeSignals, location, recentNews.",
		"   If matchConfidence < 0.70, set overview, sizeSignals, location, recentNews to null.",
		"",
		"Return a valid JSON object matching this schema exactly:",
		JSON.stringify({
			entityMatched:
				"Exact name of the entity found online, or null if no confident match",
			matchConfidence: 0.85,
			matchReasons: ["Reason 1", "Reason 2"],
			overview:
				"Concise 1-2 sentence description of what they sell and who to, or null if matchConfidence < 0.7",
			sizeSignals: "Headcount, scale, or revenue signals if found, or null",
			location: "Headquarters or primary cities, or null",
			recentNews: "Recent products, funding, or press items if found, or null",
		}),
	]
		.filter(Boolean)
		.join("\n");

	const { ai, model } = getFastClient();
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
				abortSignal: AbortSignal.timeout(30000),
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

	let entityMatched: string | null = null;
	let matchConfidence = 0.0;
	let matchReasons: string[] = [];
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

		if (
			typeof parsed.entityMatched === "string" &&
			parsed.entityMatched.trim()
		) {
			entityMatched = parsed.entityMatched.trim();
		}
		if (typeof parsed.matchConfidence === "number") {
			matchConfidence = Math.max(0, Math.min(1, parsed.matchConfidence));
		}
		if (Array.isArray(parsed.matchReasons)) {
			matchReasons = parsed.matchReasons.filter(
				(r): r is string => typeof r === "string" && Boolean(r.trim()),
			);
		}

		if (matchConfidence >= 0.7) {
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
		} else {
			if (matchReasons.length === 0) {
				matchReasons.push(
					"Entity did not match target business with sufficient confidence.",
				);
			}
		}
	} catch {
		if (rawText.trim()) {
			matchConfidence = 0.3;
			matchReasons.push(
				"Could not parse structured entity verification response.",
			);
		}
	}

	console.log(
		`[ResearchCompany] Grounded research for "${companyName}": matchConfidence=${matchConfidence.toFixed(2)}, citations=${sourceUrls.length}, latency=${latencyMs}ms`,
	);

	return {
		entityMatched,
		matchConfidence,
		matchReasons,
		overview,
		sizeSignals,
		location,
		recentNews,
		sourceUrls,
		latencyMs,
		estimatedCostUsd,
	};
}

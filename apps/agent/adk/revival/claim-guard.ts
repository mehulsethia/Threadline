export type EvidenceSourceContext = {
	facts: Array<{ field: string; value: string; id?: string }>;
	messages: Array<{ body: string; sender: string; timestamp?: string }>;
	tasks: Array<{ subject: string; dueAt?: string | null }>;
};

export type ClaimVerificationResult = {
	valid: boolean;
	unsupportedClaims: string[];
	supportedClaims: string[];
};

function normalizeText(text: string): string {
	return text
		.toLowerCase()
		.replace(/[\u200E\u200F\uFEFF]/g, "")
		.replace(/[^a-z0-9äöüßéèàáíóúçñ\s]/gi, " ")
		.replace(/\s+/g, " ")
		.trim();
}

const COMMON_CAPABILITIES = [
	{
		label: "high-volume reliability",
		pattern: /\bhigh[- ]volume\s+reliability\b/i,
	},
	{ label: "fast deployment", pattern: /\bfast\s+deployment\b/i },
	{
		label: "schnelle Bereitstellung",
		pattern: /\bschnelle(?:n|r)?\s+bereitstellung\b/i,
	},
	{ label: "24/7 support", pattern: /\b24\/7\s+support\b/i },
	{ label: "zero downtime", pattern: /\bzero[- ]downtime\b/i },
];

const COMPLIANCE_PATTERNS = [
	{ label: "ISO 27001", pattern: /\biso[- ]?27001\b/i },
	{
		label: "SOC2 Type II",
		pattern: /\bsoc[- ]?2\s*(?:type\s*ii|type\s*2)?\b/i,
	},
	{ label: "EN 10204 3.1", pattern: /\ben[- ]?10204\b/i },
	{
		label: "CE-Zertifizierung",
		pattern: /\bce[- ](?:zertifizierung|zertifikat)\b/i,
	},
	{ label: "HIPAA", pattern: /\bhipaa\b/i },
	{ label: "GDPR", pattern: /\bgdpr\b/i },
];

const MEETING_PATTERNS = [
	{
		label: "geplante Demo / vereinbarte Termin",
		pattern:
			/\b(?:geplante(?:n|r|s)?\s+demo|vereinbarte(?:n|r|s)?\s+termin|geplante(?:n|r|s)?\s+termin)\b/i,
	},
	{
		label: "scheduled demo / agreed meeting",
		pattern:
			/\b(?:scheduled\s+demo|agreed\s+meeting|confirmed\s+meeting|planned\s+demo)\b/i,
	},
];

export function extractClaimsFromDraft(
	draftText: string,
): Array<{ label: string; rawMatch: string }> {
	const claims: Array<{ label: string; rawMatch: string }> = [];

	for (const item of COMMON_CAPABILITIES) {
		const match = draftText.match(item.pattern);
		if (match) {
			claims.push({ label: item.label, rawMatch: match[0] });
		}
	}

	for (const item of COMPLIANCE_PATTERNS) {
		const match = draftText.match(item.pattern);
		if (match) {
			claims.push({ label: item.label, rawMatch: match[0] });
		}
	}

	for (const item of MEETING_PATTERNS) {
		const match = draftText.match(item.pattern);
		if (match) {
			claims.push({ label: item.label, rawMatch: match[0] });
		}
	}

	return claims;
}

export function isClaimSupportedByEvidence(
	claim: { label: string; rawMatch: string },
	context: EvidenceSourceContext,
): boolean {
	const combinedSources = [
		...context.facts.map((f) => `${f.field} ${f.value}`),
		...context.messages.map((m) => m.body),
		...context.tasks.map((t) => t.subject),
	];

	const normalizedCorpus = normalizeText(combinedSources.join(" "));

	if (claim.label === "ISO 27001") {
		return (
			normalizedCorpus.includes("iso 27001") ||
			normalizedCorpus.includes("iso27001")
		);
	}
	if (claim.label === "SOC2 Type II") {
		return (
			normalizedCorpus.includes("soc2") || normalizedCorpus.includes("soc 2")
		);
	}
	if (claim.label === "EN 10204 3.1") {
		return (
			normalizedCorpus.includes("en 10204") ||
			normalizedCorpus.includes("10204")
		);
	}
	if (claim.label === "CE-Zertifizierung") {
		// normalizeText turns "CE-Zertifizierung" into "ce zertifizierung".
		return /\bce (?:zertifi|certifi|mark|kennzeichnung)/.test(normalizedCorpus);
	}
	if (claim.label === "HIPAA") return normalizedCorpus.includes("hipaa");
	if (claim.label === "GDPR") {
		return (
			normalizedCorpus.includes("gdpr") || normalizedCorpus.includes("dsgvo")
		);
	}

	if (
		claim.label === "geplante Demo / vereinbarte Termin" ||
		claim.label === "scheduled demo / agreed meeting"
	) {
		const hasConfirmedMeeting = combinedSources.some((src) => {
			const n = normalizeText(src);
			return (
				(n.includes("termin") ||
					n.includes("demo") ||
					n.includes("meeting") ||
					n.includes("call")) &&
				(n.includes("booked") ||
					n.includes("scheduled") ||
					n.includes("vereinbart") ||
					n.includes("confirmed") ||
					n.includes("passt") ||
					n.includes("festgelegt"))
			);
		});
		return hasConfirmedMeeting;
	}

	const normalizedMatch = normalizeText(claim.rawMatch);
	if (normalizedCorpus.includes(normalizedMatch)) {
		return true;
	}

	const matchTokens = normalizedMatch.split(" ").filter((t) => t.length > 3);
	if (
		matchTokens.length > 0 &&
		matchTokens.every((token) => normalizedCorpus.includes(token))
	) {
		return true;
	}

	return false;
}

export function verifyFactualClaims(
	draftText: string,
	context: EvidenceSourceContext,
): ClaimVerificationResult {
	const claims = extractClaimsFromDraft(draftText);
	const unsupportedClaims: string[] = [];
	const supportedClaims: string[] = [];

	for (const claim of claims) {
		if (isClaimSupportedByEvidence(claim, context)) {
			supportedClaims.push(claim.label);
		} else {
			unsupportedClaims.push(claim.label);
		}
	}

	return {
		valid: unsupportedClaims.length === 0,
		unsupportedClaims,
		supportedClaims,
	};
}

export function stripUnsupportedClaims(
	draftText: string,
	unsupportedClaims: string[],
): string {
	let cleaned = draftText;

	if (
		unsupportedClaims.includes("schnelle Bereitstellung") ||
		unsupportedClaims.includes("geplante Demo / vereinbarte Termin")
	) {
		cleaned = cleaned.replace(
			/,\s*(?:unsere\s+)?schnelle\s+Bereitstellung/gi,
			"",
		);
		cleaned = cleaned.replace(
			/und\s*(?:unsere\s+)?schnelle\s+Bereitstellung/gi,
			"",
		);
		cleaned = cleaned.replace(/schnelle\s+Bereitstellung\s*(?:und|,)?/gi, "");
		cleaned = cleaned.replace(
			/in\s+unserer\s+geplanten\s+Demo\s+vorstellen\.?/gi,
			"mitteilen.",
		);
		cleaned = cleaned.replace(
			/Passt\s+der\s+vereinbarte\s+Termin\s+noch\s+für\s+Sie\??/gi,
			"",
		);
	}

	if (
		unsupportedClaims.includes("high-volume reliability") ||
		unsupportedClaims.includes("fast deployment")
	) {
		cleaned = cleaned.replace(
			/to\s+ensure\s+it\s+fully\s+supports\s+your\s+high[- ]volume\s+reliability\s+requirements\.?/gi,
			"to ensure everything is aligned.",
		);
		cleaned = cleaned.replace(
			/so\s+we\s+can\s+get\s+you\s+ready\s+for\s+fast\s+deployment\??/gi,
			"so we can finalize the agreement?",
		);
		cleaned = cleaned.replace(/,\s*high[- ]volume\s+reliability/gi, "");
		cleaned = cleaned.replace(
			/high[- ]volume\s+reliability\s*(?:and|,)?/gi,
			"",
		);
		cleaned = cleaned.replace(/fast\s+deployment\s*(?:and|,)?/gi, "");
	}

	if (unsupportedClaims.includes("ISO 27001")) {
		cleaned = cleaned.replace(/ISO\s*27001\s*(?:and|und)?\s*/gi, "");
	}

	cleaned = cleaned
		.replace(/\s{2,}/g, " ")
		.replace(/\s+\./g, ".")
		.replace(/\s+\?/g, "?")
		.replace(/\s+,/g, ",")
		.trim();

	return cleaned;
}

export function assertGreetingMatchesContact(
	draftText: string,
	contact: {
		firstName?: string | null;
		lastName?: string | null;
		name?: string | null;
	},
): { matches: boolean; greetingLine?: string; reason?: string } {
	const first = contact.firstName?.trim();
	const last = contact.lastName?.trim();
	const full = contact.name?.trim();

	const validTokens: string[] = [];
	if (first && first.length >= 2) validTokens.push(first.toLowerCase());
	if (last && last.length >= 2) validTokens.push(last.toLowerCase());
	if (full && full.length >= 2) {
		for (const part of full.split(/\s+/)) {
			if (part.length >= 2) validTokens.push(part.toLowerCase());
		}
	}

	if (validTokens.length === 0) {
		return { matches: true };
	}

	const lines = draftText
		.split("\n")
		.map((l) => l.trim())
		.filter((l) => l.length > 0 && !/^subject:|^betreff:|^objet:/i.test(l));

	const greetingLine = lines[0];
	if (!greetingLine) {
		return { matches: true };
	}

	// A salutation either opens with a known greeting or is a short line that
	// ends in a comma ("Frau Rostova,"), in any script.
	const isGreeting =
		/^(?:hi|hello|hey|dear|good (?:morning|afternoon|evening)|hallo|guten (?:tag|morgen|abend)|sehr geehrte[rn]?|liebe[r]?|bonjour|bonsoir|cher|chère|madame|monsieur|hola|estimad[oa]|buen[oa]s|ciao|gentile|olá|caro|namaste|नमस्ते|marhaba|مرحبا)/i.test(
			greetingLine,
		) ||
		(greetingLine.length <= 60 && /[,،]\s*$/.test(greetingLine));

	if (!isGreeting) {
		return { matches: true };
	}

	// A name transliterated into another script ("सुनीता") cannot be compared
	// with the Latin record; only Latin-script salutations are checked.
	if (!/[a-z]{2,}/i.test(greetingLine.replace(/^(?:namaste|marhaba)\b/i, ""))) {
		return { matches: true, greetingLine };
	}

	const lowerGreeting = greetingLine.toLowerCase();
	const matchedToken = validTokens.find((tok) => lowerGreeting.includes(tok));

	if (!matchedToken) {
		return {
			matches: false,
			greetingLine,
			reason: `Greeting "${greetingLine}" does not match contact name (${first ?? ""} ${last ?? ""}).`,
		};
	}

	return { matches: true, greetingLine };
}

export function detectContactInboundLanguage(
	messages: Array<{
		body: string;
		direction?: string;
		contactId?: string | null;
	}>,
	contactId?: string | null,
	contactLanguageFact?: string | null,
): string {
	const inbound = messages.filter((m) => {
		const isContact = contactId
			? m.contactId === contactId ||
				m.contactId === null ||
				m.contactId === undefined
			: true;
		const isInbound = !m.direction || m.direction === "INBOUND";
		return isContact && isInbound && m.body && m.body.trim().length > 0;
	});

	if (inbound.length === 0) {
		return "en";
	}

	if (contactLanguageFact && contactLanguageFact.trim().length >= 2) {
		return contactLanguageFact.trim().toLowerCase();
	}

	const combined = inbound
		.map((m) => m.body)
		.join(" ")
		.toLowerCase();

	if (
		/\b(?:und|ich|wir|bitte|termin|bereitstellung|nachfragen|geplante|angebot|grüße|mitteilen|danke|können)\b/i.test(
			combined,
		)
	) {
		return "de";
	}
	if (
		/\b(?:bonjour|merci|vous|nous|projet|devis|accord|cordialement|suivi|disponible)\b/i.test(
			combined,
		)
	) {
		return "fr";
	}
	if (
		/\b(?:hola|gracias|nosotros|ustedes|proyecto|presupuesto|saludos|disponible)\b/i.test(
			combined,
		)
	) {
		return "es";
	}

	return "en";
}

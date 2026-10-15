import { DealStage } from "@crm/db";
import type { WhatsAppMessageItem } from "@crm/validation/whatsapp-parser";
import type {
	EvidenceRef,
	EvidenceSpeaker,
	ExtractedLeadFacts,
} from "./extraction";

export type ValidationSummary = {
	verified: number;
	fixed: number;
	downgraded: number;
	details: Array<{
		field: string;
		status: "verified" | "fixed" | "downgraded";
		reason?: string;
	}>;
};

const SELLER_SIGNALS = [
	"hamara",
	"humara",
	"fee",
	"fees",
	"price",
	"rate",
	"cost",
	"quote",
	"quotation",
	"bhejta",
	"bhejenge",
	"supply",
	"dispatch",
	"stock",
	"ready stock",
	"advance",
	"credit",
	"delivery ho jayegi",
	"batch",
	"batch size",
	"centre",
	"swagat",
	"welcome",
	"academy",
	"valves",
	"fittings",
	"classes",
	"conduct karenge",
];

const BUYER_SIGNALS = [
	"hume chahiye",
	"humko chahiye",
	"requirement",
	"enquiry",
	"enquire",
	"mera budget",
	"hamara budget",
	"budget approx",
	"timing kya",
	"issue hai",
	"problem",
	"concern",
	"personal attention",
	"discount",
	"chahiye",
];

function normalize(text: string): string {
	return text
		.toLowerCase()
		.replace(/[\u200E\u200F\uFEFF]/g, "")
		.replace(/\s+/g, " ")
		.trim();
}

export function detectParticipants(
	participants: string[],
	messages: WhatsAppMessageItem[],
	meFlag?: string,
): { me: string; lead: string; confidence: number; autoDetected: boolean } {
	if (participants.length === 0) {
		return {
			me: meFlag ?? "Business",
			lead: "Lead",
			confidence: 0.5,
			autoDetected: false,
		};
	}

	if (meFlag) {
		const normalizedFlag = normalize(meFlag);
		const matchedMe =
			participants.find((p) => normalize(p) === normalizedFlag) ??
			participants.find((p) => normalize(p).includes(normalizedFlag)) ??
			meFlag;

		const lead = participants.find((p) => p !== matchedMe) ?? "Lead";
		return {
			me: matchedMe,
			lead,
			confidence: 1.0,
			autoDetected: false,
		};
	}

	if (participants.length === 1) {
		const only = participants[0] ?? "Unknown";
		return {
			me: "Business",
			lead: only,
			confidence: 0.5,
			autoDetected: true,
		};
	}

	const scores: Record<string, number> = {};
	for (const p of participants) {
		scores[p] = 0;
	}

	for (const msg of messages) {
		const norm = normalize(msg.text);
		let sellerHits = 0;
		let buyerHits = 0;

		for (const sig of SELLER_SIGNALS) {
			if (norm.includes(sig)) sellerHits++;
		}
		for (const sig of BUYER_SIGNALS) {
			if (norm.includes(sig)) buyerHits++;
		}

		const current = scores[msg.sender] ?? 0;
		scores[msg.sender] = current + sellerHits * 2 - buyerHits * 2;
	}

	const sorted = [...participants].sort(
		(a, b) => (scores[b] ?? 0) - (scores[a] ?? 0),
	);

	const meCandidate = sorted[0] ?? participants[0] ?? "Business";
	const leadCandidate =
		sorted.find((p) => p !== meCandidate) ?? participants[1] ?? "Lead";

	const scoreDiff = (scores[meCandidate] ?? 0) - (scores[leadCandidate] ?? 0);
	const confidence = Math.min(
		0.98,
		Math.max(0.65, 0.7 + Math.tanh(Math.max(0, scoreDiff) / 4) * 0.28),
	);

	return {
		me: meCandidate,
		lead: leadCandidate,
		confidence: Number(confidence.toFixed(2)),
		autoDetected: true,
	};
}

export function mapToCrmDealStage(
	suggestion: string | null | undefined,
	hasDemo = false,
	hasProposal = false,
): DealStage {
	if (!suggestion) {
		if (hasProposal) return DealStage.CONTRACT_SENT;
		if (hasDemo) return DealStage.DEMO_BOOKED;
		return DealStage.QUALIFIED_TO_BUY;
	}

	const clean = suggestion.toUpperCase().replace(/[\s-]+/g, "_");
	if (Object.values(DealStage).includes(clean as DealStage)) {
		return clean as DealStage;
	}

	const lower = suggestion.toLowerCase();

	if (
		lower.includes("demo") ||
		lower.includes("visit") ||
		lower.includes("diagnostic") ||
		lower.includes("meeting") ||
		hasDemo
	) {
		return DealStage.DEMO_BOOKED;
	}

	if (
		lower.includes("proposal") ||
		lower.includes("contract") ||
		lower.includes("quote") ||
		lower.includes("quotation") ||
		hasProposal
	) {
		return DealStage.CONTRACT_SENT;
	}

	if (
		lower.includes("decision") ||
		lower.includes("bought_in") ||
		lower.includes("stakeholder")
	) {
		return DealStage.DECISION_MAKER_BOUGHT_IN;
	}

	if (
		lower.includes("won") ||
		lower.includes("enrolled") ||
		lower.includes("closed_won")
	) {
		return DealStage.CLOSED_WON;
	}

	if (lower.includes("lost") || lower.includes("closed_lost")) {
		return DealStage.CLOSED_LOST;
	}

	if (lower.includes("unqualified")) {
		return DealStage.UNQUALIFIED_TO_BUY;
	}

	return DealStage.QUALIFIED_TO_BUY;
}

export function resolveRelativeTimeline(
	text: string | null | undefined,
	refDate: Date,
): string | null {
	if (!text) return null;
	const norm = normalize(text);

	const numberMap: Record<string, number> = {
		one: 1,
		two: 2,
		three: 3,
		four: 4,
		five: 5,
		six: 6,
		seven: 7,
		eight: 8,
		nine: 9,
		ten: 10,
	};

	if (norm.includes("kal") || norm.includes("tomorrow")) {
		const target = new Date(refDate.getTime());
		target.setDate(target.getDate() + 1);
		return target.toISOString().slice(0, 10);
	}

	if (
		norm.includes("next week") ||
		norm.includes("agle hafte") ||
		norm.includes("agle week")
	) {
		const target = new Date(refDate.getTime());
		target.setDate(target.getDate() + 7);
		return target.toISOString().slice(0, 10);
	}

	if (norm.includes("today") || norm.includes("aaj")) {
		return refDate.toISOString().slice(0, 10);
	}

	const relMatch = norm.match(
		/(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+(day|week|month)s?/,
	);
	if (relMatch?.[1] && relMatch[2]) {
		const rawNum = relMatch[1];
		const num = numberMap[rawNum] ?? parseInt(rawNum, 10);
		const unit = relMatch[2];

		const target = new Date(refDate.getTime());
		if (unit === "day") {
			target.setDate(target.getDate() + num);
		} else if (unit === "week") {
			target.setDate(target.getDate() + num * 7);
		} else if (unit === "month") {
			target.setMonth(target.getMonth() + num);
		}
		return target.toISOString().slice(0, 10);
	}

	const weekdays = [
		"sunday",
		"monday",
		"tuesday",
		"wednesday",
		"thursday",
		"friday",
		"saturday",
	];
	for (let i = 0; i < weekdays.length; i++) {
		const dayName = weekdays[i] ?? "";
		if (norm.includes(dayName)) {
			const target = new Date(refDate.getTime());
			let diff = i - target.getDay();
			if (diff <= 0) diff += 7;
			target.setDate(target.getDate() + diff);
			return target.toISOString().slice(0, 10);
		}
	}

	const months = [
		"january",
		"february",
		"march",
		"april",
		"may",
		"june",
		"july",
		"august",
		"september",
		"october",
		"november",
		"december",
	];
	const shortMonths = [
		"jan",
		"feb",
		"mar",
		"apr",
		"may",
		"jun",
		"jul",
		"aug",
		"sep",
		"oct",
		"nov",
		"dec",
	];

	for (let m = 0; m < 12; m++) {
		const mName = months[m] ?? "";
		const sName = shortMonths[m] ?? "";

		const pattern = new RegExp(
			`(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?(?:${mName}|${sName})|(?:${mName}|${sName})\\s+(\\d{1,2})(?:st|nd|rd|th)?`,
			"i",
		);
		const match = norm.match(pattern);
		if (match) {
			const dayStr = match[1] || match[2] || "1";
			const day = parseInt(dayStr, 10);
			let year = refDate.getFullYear();
			if (m < refDate.getMonth()) year += 1;

			const monthStr = String(m + 1).padStart(2, "0");
			const dStr = String(day).padStart(2, "0");
			return `${year}-${monthStr}-${dStr}`;
		}
	}

	return null;
}

export function resolveDueAt(
	text: string | null | undefined,
	refDate: Date,
): string | null {
	if (!text) return null;
	const norm = normalize(text);

	const numberMap: Record<string, number> = {
		ek: 1,
		do: 2,
		teen: 3,
		char: 4,
		one: 1,
		two: 2,
		three: 3,
		four: 4,
	};

	const hourMatch = norm.match(
		/(\d+|ek|do|teen|char|one|two|three|four)\s*(?:hour|ghante|ghanta|hr)s?\s*(?:me|mein|within|in)?/,
	);
	if (hourMatch?.[1]) {
		const raw = hourMatch[1];
		const hours = numberMap[raw] ?? parseInt(raw, 10);
		const target = new Date(refDate.getTime() + hours * 3600 * 1000);
		return target.toISOString();
	}

	const datePart = resolveRelativeTimeline(text, refDate);
	if (!datePart) return null;

	const timeMatch = norm.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i);
	if (timeMatch?.[1]) {
		let h = parseInt(timeMatch[1], 10);
		const m = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
		const ampm = timeMatch[3]?.toLowerCase();

		if (ampm === "pm" && h < 12) h += 12;
		if (ampm === "am" && h === 12) h = 0;

		const hStr = String(h).padStart(2, "0");
		const mStr = String(m).padStart(2, "0");
		return new Date(`${datePart}T${hStr}:${mStr}:00+05:30`).toISOString();
	}

	return new Date(`${datePart}T09:00:00+05:30`).toISOString();
}

function findQuoteInMessages(
	quote: string,
	messages: WhatsAppMessageItem[],
): { lineNos: number[]; speakerSender?: string } | null {
	const normQuote = normalize(quote);
	if (!normQuote) return null;

	for (const msg of messages) {
		const normMsg = normalize(msg.text);
		const normSender = normalize(msg.sender);
		if (normMsg.includes(normQuote) || normSender.includes(normQuote)) {
			return { lineNos: [msg.lineNo], speakerSender: msg.sender };
		}
	}

	for (let w = 2; w <= 4; w++) {
		for (let i = 0; i <= messages.length - w; i++) {
			const slice = messages.slice(i, i + w);
			const joined = normalize(slice.map((m) => m.text).join(" "));
			if (joined.includes(normQuote)) {
				return {
					lineNos: slice.map((m) => m.lineNo),
					speakerSender: slice[0]?.sender,
				};
			}
		}
	}

	const quoteWords = normQuote.split(" ");
	if (quoteWords.length >= 4) {
		for (const msg of messages) {
			const normMsg = normalize(msg.text);
			let matches = 0;
			for (const word of quoteWords) {
				if (normMsg.includes(word)) matches++;
			}
			if (matches / quoteWords.length >= 0.8) {
				return { lineNos: [msg.lineNo], speakerSender: msg.sender };
			}
		}
	}

	return null;
}

export function validateAndEnrichFacts(
	facts: ExtractedLeadFacts,
	messages: WhatsAppMessageItem[],
	me: string,
	lead: string,
	refDate: Date,
): ValidationSummary {
	const summary: ValidationSummary = {
		verified: 0,
		fixed: 0,
		downgraded: 0,
		details: [],
	};

	const senderOfLine = (lineNo: number): string | undefined => {
		return messages.find((m) => m.lineNo === lineNo)?.sender;
	};

	const deriveSpeakerFromLines = (
		lineNos: number[] | undefined,
		fallback: EvidenceSpeaker,
	): EvidenceSpeaker => {
		if (!lineNos || lineNos.length === 0) return fallback;
		for (const lineNo of lineNos) {
			const sender = messages.find((m) => m.lineNo === lineNo)?.sender;
			if (sender) {
				return sender === me ? "us" : "lead";
			}
		}
		return fallback;
	};

	const validateItem = (
		fieldName: string,
		evidence: EvidenceRef | null,
		isInferenceField: boolean,
		defaultSpeaker: EvidenceSpeaker,
	): EvidenceRef | null => {
		if (!evidence) return null;

		if (isInferenceField) {
			evidence.sourceKind = "agent.inference";
			const found = findQuoteInMessages(evidence.quote, messages);
			if (found) {
				evidence.lineNos = found.lineNos;
				const firstLine = found.lineNos[0] ?? 0;
				const actualSender = senderOfLine(firstLine) ?? found.speakerSender;
				evidence.speaker = actualSender === me ? "us" : "lead";
			} else {
				evidence.speaker = deriveSpeakerFromLines(
					evidence.lineNos,
					defaultSpeaker,
				);
			}
			summary.verified++;
			summary.details.push({ field: fieldName, status: "verified" });
			return evidence;
		}

		if (
			evidence.sourceKind === "whatsapp.message" ||
			evidence.sourceKind === "voice.transcript"
		) {
			const found = findQuoteInMessages(evidence.quote, messages);

			if (found) {
				const existingLineNos = evidence.lineNos ?? [];
				const linesMatch =
					existingLineNos.length === found.lineNos.length &&
					existingLineNos.every((l, idx) => l === found.lineNos[idx]);

				evidence.lineNos = found.lineNos;
				const firstLine = found.lineNos[0] ?? 0;
				const actualSender = senderOfLine(firstLine) ?? found.speakerSender;
				evidence.speaker = actualSender === me ? "us" : "lead";

				if (!linesMatch) {
					summary.fixed++;
					summary.details.push({
						field: fieldName,
						status: "fixed",
						reason: `Adjusted lines to [${found.lineNos.join(", ")}]`,
					});
				} else {
					summary.verified++;
					summary.details.push({ field: fieldName, status: "verified" });
				}
			} else {
				evidence.sourceKind = "agent.inference";
				evidence.downgraded = true;
				evidence.flag = "quote_not_found";
				evidence.speaker = deriveSpeakerFromLines(
					evidence.lineNos,
					defaultSpeaker,
				);
				summary.downgraded++;
				summary.details.push({
					field: fieldName,
					status: "downgraded",
					reason: "Quote not found in messages",
				});
			}
		}

		return evidence;
	};

	if (facts.contact.name.value === me) {
		facts.contact.name.value = lead;
		const firstLeadMsg = messages.find((m) => m.sender === lead);
		if (firstLeadMsg) {
			facts.contact.name.evidence = {
				sourceKind: "whatsapp.message",
				speaker: "lead",
				quote: firstLeadMsg.text.slice(0, 100),
				lineNos: [firstLeadMsg.lineNo],
			};
		}
	}

	const isPhoneNumber = /^\+?[\d\s-]{8,20}$/.test(lead.trim());
	if (isPhoneNumber && !facts.contact.phone.value) {
		const clean = lead.replace(/[\s-]/g, "");
		const firstLeadMsg = messages.find((m) => m.sender === lead);
		facts.contact.phone = {
			value: clean,
			evidence: {
				sourceKind: "whatsapp.message",
				speaker: "lead",
				quote: lead,
				lineNos: firstLeadMsg ? [firstLeadMsg.lineNo] : [1],
			},
		};
	}

	facts.contact.name.evidence = validateItem(
		"contact.name",
		facts.contact.name.evidence,
		false,
		"lead",
	);
	facts.contact.phone.evidence = validateItem(
		"contact.phone",
		facts.contact.phone.evidence,
		false,
		"lead",
	);
	facts.contact.role.evidence = validateItem(
		"contact.role",
		facts.contact.role.evidence,
		false,
		"lead",
	);

	facts.company.name.evidence = validateItem(
		"company.name",
		facts.company.name.evidence,
		false,
		"lead",
	);
	facts.company.city.evidence = validateItem(
		"company.city",
		facts.company.city.evidence,
		false,
		"lead",
	);

	facts.deal.need.evidence = validateItem(
		"deal.need",
		facts.deal.need.evidence,
		false,
		"lead",
	);
	facts.deal.quantity.evidence = validateItem(
		"deal.quantity",
		facts.deal.quantity.evidence,
		false,
		"lead",
	);

	facts.deal.leadBudget.evidence = validateItem(
		"deal.leadBudget",
		facts.deal.leadBudget.evidence,
		false,
		"lead",
	);

	facts.deal.quotedValue.evidence = validateItem(
		"deal.quotedValue",
		facts.deal.quotedValue.evidence,
		false,
		"us",
	);

	facts.deal.currency.evidence = validateItem(
		"deal.currency",
		facts.deal.currency.evidence,
		false,
		facts.deal.quotedValue.value ? "us" : "lead",
	);

	facts.deal.timeline.evidence = validateItem(
		"deal.timeline",
		facts.deal.timeline.evidence,
		false,
		"lead",
	);

	facts.deal.timelineResolved = resolveRelativeTimeline(
		facts.deal.timeline.value,
		refDate,
	);

	const hasDemo = Boolean(
		facts.nextStep.value &&
			normalize(facts.nextStep.value).match(/demo|visit|centre|test/),
	);
	const hasProposal = Boolean(
		facts.nextStep.value &&
			normalize(facts.nextStep.value).match(/quote|quotation|proposal/),
	);
	const mappedStage = mapToCrmDealStage(
		facts.deal.stageSuggestion.value as string,
		hasDemo,
		hasProposal,
	);
	facts.deal.stageSuggestion.value = mappedStage;
	facts.deal.stageSuggestion.evidence = validateItem(
		"deal.stageSuggestion",
		facts.deal.stageSuggestion.evidence,
		true,
		"us",
	);

	facts.languagePreference.evidence = validateItem(
		"languagePreference",
		facts.languagePreference.evidence,
		true,
		"lead",
	);

	facts.sentiment.evidence = validateItem(
		"sentiment",
		facts.sentiment.evidence,
		true,
		"lead",
	);

	if (facts.nextStep.value || facts.nextStep.evidence?.quote) {
		const combined =
			`${facts.nextStep.value ?? ""} ${facts.nextStep.evidence?.quote ?? ""}`.trim();
		const nextStepNorm = normalize(combined);
		if (!facts.nextStep.owner) {
			if (
				nextStepNorm.includes("bhej") ||
				nextStepNorm.includes("send") ||
				nextStepNorm.includes("quotation") ||
				nextStepNorm.includes("quote")
			) {
				facts.nextStep.owner = "us";
			} else {
				facts.nextStep.owner = "lead";
			}
		}

		facts.nextStep.dueAt = resolveDueAt(combined, refDate);
		facts.nextStep.evidence = validateItem(
			"nextStep",
			facts.nextStep.evidence,
			false,
			facts.nextStep.owner ?? "us",
		);
	}

	for (let i = 0; i < facts.objections.length; i++) {
		const obj = facts.objections[i];
		if (!obj) continue;
		obj.evidence = validateItem(
			`objections[${i}]`,
			obj.evidence,
			false,
			"lead",
		) as EvidenceRef;
	}

	return summary;
}

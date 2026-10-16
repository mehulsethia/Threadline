import { DealStage } from "@crm/db";
import {
	detectParticipants,
	type WhatsAppMessageItem,
} from "@crm/validation/whatsapp-parser";
import type {
	EvidenceRef,
	EvidenceSourceKind,
	EvidenceSpeaker,
	ExtractedLeadFacts,
} from "./extraction";

export { detectParticipants };

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

function normalize(text: string): string {
	return text
		.toLowerCase()
		.replace(/[\u200E\u200F\uFEFF]/g, "")
		.replace(/\s+/g, " ")
		.trim();
}

export function isBusinessSideOrganization(
	companyName: string | null | undefined,
	messages: WhatsAppMessageItem[],
	me: string,
	workspaceName?: string,
): boolean {
	if (!companyName) return false;
	const normCompany = normalize(companyName);
	if (!normCompany) return false;

	if (workspaceName) {
		const normWorkspace = normalize(workspaceName);
		if (
			normWorkspace &&
			(normCompany === normWorkspace ||
				normCompany.includes(normWorkspace) ||
				normWorkspace.includes(normCompany))
		) {
			return true;
		}
	}

	const meMessages = messages.filter((m) => m.sender === me);
	for (const msg of meMessages) {
		const normText = normalize(msg.text);
		if (normText.includes(normCompany)) {
			if (
				normText.includes("swagat hai") ||
				normText.includes("swagat") ||
				normText.includes("welcome") ||
				normText.includes("here at") ||
				normText.includes("we at") ||
				normText.includes("team at") ||
				normText.includes("our branch") ||
				normText.includes("branch me") ||
				normText.includes("our centre") ||
				normText.includes("centre par") ||
				normText.includes("our office") ||
				normText.includes("hamara") ||
				normText.includes("hamare")
			) {
				return true;
			}
		}
	}

	return false;
}

export function parseDeterministicAmount(
	text: string | null | undefined,
): number | null {
	if (!text) return null;
	const norm = text.replace(/[\u200E\u200F\uFEFF]/g, "").trim();

	const lakhMatch = norm.match(/(\d+(?:\.\d+)?)\s*(?:lakh|lakhs|lac|lacs)/i);
	if (lakhMatch?.[1]) {
		const val = parseFloat(lakhMatch[1]);
		return Math.round(val * 100000);
	}

	const croreMatch = norm.match(/(\d+(?:\.\d+)?)\s*(?:crore|crores|cr)/i);
	if (croreMatch?.[1]) {
		const val = parseFloat(croreMatch[1]);
		return Math.round(val * 10000000);
	}

	const kMatch = norm.match(
		/(?:[$€£₹]|inr|usd|eur|gbp)?\s*(\d+(?:\.\d+)?)\s*k\b/i,
	);
	if (kMatch?.[1]) {
		const val = parseFloat(kMatch[1]);
		return Math.round(val * 1000);
	}

	const commaFormatted = norm.match(
		/(?:[$€£₹]|inr|usd|eur|gbp|fee|fees|budget|price|angebot|total)?\s*(\d{1,3}(?:,\d{2,3})+)(?:\s*(?:inr|usd|eur|gbp|rs\.?|euro|euros|dollars|pounds))?/i,
	);
	if (commaFormatted?.[1]) {
		const raw = commaFormatted[1].replace(/,/g, "");
		const num = parseInt(raw, 10);
		if (!Number.isNaN(num) && num > 0) return num;
	}

	const deDotFormatted = norm.match(
		/(?:[$€£₹]|eur|angebot|budget)?\s*(\d{1,3}(?:\.\d{3})+)(?:\s*(?:eur|euro|euros))?/i,
	);
	if (deDotFormatted?.[1]) {
		const raw = deDotFormatted[1].replace(/\./g, "");
		const num = parseInt(raw, 10);
		if (!Number.isNaN(num) && num > 0) return num;
	}

	const plainCurrency =
		norm.match(/(?:[$€£₹]|inr|usd|eur|gbp)\s*(\d{3,9})(?:\.00)?/i) ||
		norm.match(/(\d{3,9})\s*(?:inr|usd|eur|gbp)/i);
	if (plainCurrency?.[1]) {
		const num = parseInt(plainCurrency[1], 10);
		if (!Number.isNaN(num) && num > 0) return num;
	}

	return null;
}

export interface InferredStageResult {
	stage: DealStage;
	evidence: {
		sourceKind: EvidenceSourceKind;
		speaker: "lead" | "us";
		quote: string;
		lineNos?: number[];
	};
	reason: string;
}

export function inferDealStageWithEvidence(
	facts: ExtractedLeadFacts,
	messages: WhatsAppMessageItem[],
	_me?: string,
	lead?: string,
): InferredStageResult {
	const nextStepCombined =
		`${facts.nextStep.value ?? ""} ${facts.nextStep.evidence?.quote ?? ""}`.toLowerCase();
	const nextStepIsDemo =
		/\b(demo|meeting|visit|centre|diagnostic|call)\b/i.test(nextStepCombined);
	const nextStepIsSendProposal =
		/\b(send|create|email|provide|prepare|draft|bhej).*(quotation|quote|proposal|offer|contract|angebot)\b/i.test(
			nextStepCombined,
		) ||
		/\b(quotation|quote|proposal|offer|angebot).*(bhej|send|email)\b/i.test(
			nextStepCombined,
		);

	const wonRegex =
		/\b(contract signed|signed the contract|signed the agreement|payment received|fee paid|issued the po|po issued|purchase order issued|deal is closed|deal closed)\b/i;
	for (const msg of messages) {
		if (wonRegex.test(msg.text)) {
			return {
				stage: DealStage.CLOSED_WON,
				evidence: {
					sourceKind: "agent.inference",
					speaker: msg.sender === lead ? "lead" : "us",
					quote: msg.text,
					lineNos: [msg.lineNo],
				},
				reason: "Explicit won confirmation found in conversation",
			};
		}
	}

	const lostRegex =
		/\b(went with competitor|chose another vendor|cancelling the project|cannot proceed with this|no longer interested)\b/i;
	for (const msg of messages) {
		if (lostRegex.test(msg.text)) {
			return {
				stage: DealStage.CLOSED_LOST,
				evidence: {
					sourceKind: "agent.inference",
					speaker: "lead",
					quote: msg.text,
					lineNos: [msg.lineNo],
				},
				reason: "Explicit lost confirmation found in conversation",
			};
		}
	}

	if (!nextStepIsDemo && !nextStepIsSendProposal) {
		const sentProposalRegex =
			/\b(proposal sent|send(ing|t)? over the (enterprise |formal )?proposal|received (your|the) proposal|reviewing the proposal|attached.*proposal|contract pack|emailed the (formal )?proposal)\b/i;
		const negotiatingRegex =
			/\b(redline|negotiat|sla schedule|discount|payment terms.*acceptable|terms of payment)\b/i;
		const sentProposalMsg = messages.find((m) =>
			sentProposalRegex.test(m.text),
		);
		const negotiatingMsg = messages.find((m) => negotiatingRegex.test(m.text));

		if (sentProposalMsg && negotiatingMsg) {
			return {
				stage: DealStage.DECISION_MAKER_BOUGHT_IN,
				evidence: {
					sourceKind: "agent.inference",
					speaker: negotiatingMsg.sender === lead ? "lead" : "us",
					quote: negotiatingMsg.text,
					lineNos: [negotiatingMsg.lineNo],
				},
				reason:
					"Buyer is negotiating price, terms or redlines on a sent proposal",
			};
		}
	}

	if (!nextStepIsDemo && !nextStepIsSendProposal) {
		const sentProposalRegex =
			/\b(proposal sent|send(ing|t)? (the|over the) (formal |enterprise )?(proposal|quotation|offer)|emailed the (formal |enterprise )?proposal|here is our quotation pdf|attached is the (formal )?offer|contract pack)\b/i;
		const sentMsg = messages.find((m) => sentProposalRegex.test(m.text));
		if (sentMsg) {
			return {
				stage: DealStage.CONTRACT_SENT,
				evidence: {
					sourceKind: "agent.inference",
					speaker: sentMsg.sender === lead ? "lead" : "us",
					quote: sentMsg.text,
					lineNos: [sentMsg.lineNo],
				},
				reason: "Quote or proposal sent to buyer",
			};
		}
	}

	const demoRegex =
		/\b(schedule a (product )?demo|calendar invite for|demo (tomorrow|session|at|on)|meeting (tomorrow|at|on|scheduled)|centre par aaiye|demo session conduct|centre par pahunch jayenge|visit.*centre)\b/i;
	const demoMsg = messages.find((m) => demoRegex.test(m.text));
	if (demoMsg || nextStepIsDemo) {
		const quote =
			demoMsg?.text ??
			facts.nextStep.evidence?.quote ??
			facts.nextStep.value ??
			"Demo booked";
		const lineNos = demoMsg
			? [demoMsg.lineNo]
			: facts.nextStep.evidence?.lineNos;
		const speaker = demoMsg
			? demoMsg.sender === lead
				? "lead"
				: "us"
			: (facts.nextStep.evidence?.speaker ?? "us");
		return {
			stage: DealStage.DEMO_BOOKED,
			evidence: {
				sourceKind: "agent.inference",
				speaker,
				quote,
				lineNos,
			},
			reason: "Meeting or demo booked or held",
		};
	}

	const hasNeed = Boolean(
		facts.deal.need.value && facts.deal.need.evidence?.quote,
	);
	const budgetQuote =
		facts.deal.leadBudget.evidence?.quote ??
		facts.deal.quotedValue.evidence?.quote;
	const hasBudget = Boolean(
		(facts.deal.leadBudget.value !== null ||
			facts.deal.quotedValue.value !== null) &&
			budgetQuote,
	);
	const timelineQuote = facts.deal.timeline.evidence?.quote;
	const hasTimeline = Boolean(facts.deal.timeline.value && timelineQuote);

	if (hasNeed && (hasBudget || hasTimeline)) {
		const chosenQuote =
			budgetQuote ?? timelineQuote ?? facts.deal.need.evidence?.quote ?? "";
		const speaker =
			facts.deal.leadBudget.evidence?.speaker ??
			(facts.deal.quotedValue.evidence ? "us" : "lead");
		return {
			stage: DealStage.QUALIFIED_TO_BUY,
			evidence: {
				sourceKind: "agent.inference",
				speaker: speaker === "us" ? "us" : "lead",
				quote: chosenQuote,
				lineNos:
					facts.deal.leadBudget.evidence?.lineNos ??
					facts.deal.quotedValue.evidence?.lineNos ??
					facts.deal.timeline.evidence?.lineNos,
			},
			reason: "Need plus budget or timeline confirmed",
		};
	}

	const firstLeadMsg = messages.find((m) => m.sender === lead) ?? messages[0];
	return {
		stage: DealStage.UNQUALIFIED_TO_BUY,
		evidence: {
			sourceKind: "agent.inference",
			speaker: "lead",
			quote: firstLeadMsg ? firstLeadMsg.text : "Inquiry only",
			lineNos: firstLeadMsg ? [firstLeadMsg.lineNo] : undefined,
		},
		reason: "Inquiry only (unqualified lead)",
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
		if (
			hasDemo &&
			(clean === DealStage.DECISION_MAKER_BOUGHT_IN ||
				clean === DealStage.CONTRACT_SENT)
		) {
			return DealStage.DEMO_BOOKED;
		}
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
		!hasDemo &&
		(lower.includes("decision") ||
			lower.includes("bought_in") ||
			lower.includes("stakeholder") ||
			lower.includes("negotiat"))
	) {
		return DealStage.DECISION_MAKER_BOUGHT_IN;
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
		lower.includes("won") ||
		lower.includes("enrolled") ||
		lower.includes("closed_won")
	) {
		return DealStage.CLOSED_WON;
	}

	if (lower.includes("lost") || lower.includes("closed_lost")) {
		return DealStage.CLOSED_LOST;
	}

	if (
		lower.includes("lead") ||
		lower.includes("inbound") ||
		lower.includes("unqualified")
	) {
		return DealStage.UNQUALIFIED_TO_BUY;
	}

	if (lower.includes("qualif")) {
		return DealStage.QUALIFIED_TO_BUY;
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
		ein: 1,
		zwei: 2,
		drei: 3,
		vier: 4,
		uno: 1,
		dos: 2,
		tres: 3,
		cuatro: 4,
	};

	if (
		norm.includes("kal") ||
		norm.includes("tomorrow") ||
		norm.includes("morgen") ||
		norm.includes("manana") ||
		norm.includes("mañana")
	) {
		const target = new Date(refDate.getTime());
		target.setDate(target.getDate() + 1);
		return target.toISOString().slice(0, 10);
	}

	if (
		norm.includes("next week") ||
		norm.includes("naechste woche") ||
		norm.includes("nächste woche") ||
		norm.includes("proxima semana") ||
		norm.includes("próxima semana") ||
		norm.includes("agle hafte") ||
		norm.includes("agle week")
	) {
		const target = new Date(refDate.getTime());
		target.setDate(target.getDate() + 7);
		return target.toISOString().slice(0, 10);
	}

	if (
		norm.includes("today") ||
		norm.includes("aaj") ||
		norm.includes("heute") ||
		norm.includes("hoy")
	) {
		return refDate.toISOString().slice(0, 10);
	}

	const relMatch = norm.match(
		/(\d+|one|two|three|four|five|six|seven|eight|nine|ten|ein|zwei|drei|vier|uno|dos|tres|cuatro)\s+(day|week|month|tag|tage|woche|wochen|monat|monate|dia|dias|día|días|semana|semanas|mes|meses)s?/,
	);
	if (relMatch?.[1] && relMatch[2]) {
		const rawNum = relMatch[1];
		const num = numberMap[rawNum] ?? parseInt(rawNum, 10);
		const rawUnit = relMatch[2];

		const target = new Date(refDate.getTime());
		if (
			rawUnit.startsWith("day") ||
			rawUnit.startsWith("tag") ||
			rawUnit.startsWith("dia") ||
			rawUnit.startsWith("día")
		) {
			target.setDate(target.getDate() + num);
		} else if (
			rawUnit.startsWith("week") ||
			rawUnit.startsWith("woch") ||
			rawUnit.startsWith("seman")
		) {
			target.setDate(target.getDate() + num * 7);
		} else if (
			rawUnit.startsWith("month") ||
			rawUnit.startsWith("monat") ||
			rawUnit.startsWith("mes")
		) {
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
	timezoneOffset = "Z",
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
		ein: 1,
		zwei: 2,
		drei: 3,
		vier: 4,
		uno: 1,
		dos: 2,
		tres: 3,
		cuatro: 4,
	};

	const hourMatch = norm.match(
		/(\d+|ek|do|teen|char|one|two|three|four|ein|zwei|drei|vier|uno|dos|tres|cuatro)\s*(?:hour|ghante|ghanta|hr|stunde|stunden|hora|horas)s?\s*(?:me|mein|within|in)?/,
	);
	if (hourMatch?.[1]) {
		const raw = hourMatch[1];
		const hours = numberMap[raw] ?? parseInt(raw, 10);
		const target = new Date(refDate.getTime() + hours * 3600 * 1000);
		return target.toISOString();
	}

	const datePart = resolveRelativeTimeline(text, refDate);
	if (!datePart) return null;

	const tz = timezoneOffset === "Z" || !timezoneOffset ? "Z" : timezoneOffset;

	const timeMatch = norm.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i);
	if (timeMatch?.[1]) {
		let h = parseInt(timeMatch[1], 10);
		const m = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
		const ampm = timeMatch[3]?.toLowerCase();

		if (ampm === "pm" && h < 12) h += 12;
		if (ampm === "am" && h === 12) h = 0;

		const hStr = String(h).padStart(2, "0");
		const mStr = String(m).padStart(2, "0");
		return new Date(`${datePart}T${hStr}:${mStr}:00${tz}`).toISOString();
	}

	return new Date(`${datePart}T09:00:00${tz}`).toISOString();
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
	timezoneOffset = "Z",
	workspaceName?: string,
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

	function validateContactAndCompany(): void {
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

		if (facts.company.name.value) {
			const isBusinessOrg = isBusinessSideOrganization(
				facts.company.name.value,
				messages,
				me,
				workspaceName,
			);
			const leadMessages = messages.filter((m) => m.sender === lead);
			const leadMentioned = leadMessages.some((m) =>
				normalize(m.text).includes(normalize(facts.company.name.value || "")),
			);
			const spokenByUs = facts.company.name.evidence?.speaker === "us";

			if (isBusinessOrg || (spokenByUs && !leadMentioned)) {
				facts.company.name = { value: null, evidence: null };
				summary.fixed++;
				summary.details.push({
					field: "company.name",
					status: "fixed",
					reason:
						"Cleared business-side participant organisation from lead company",
				});
			}
		}

		facts.company.city.evidence = validateItem(
			"company.city",
			facts.company.city.evidence,
			false,
			"lead",
		);
	}

	function validateDealAmounts(): void {
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

		if (facts.deal.quotedValue.evidence?.quote) {
			const parsedAmount = parseDeterministicAmount(
				facts.deal.quotedValue.evidence.quote,
			);
			if (
				parsedAmount !== null &&
				parsedAmount !== facts.deal.quotedValue.value
			) {
				facts.deal.quotedValue.value = parsedAmount;
				summary.fixed++;
				summary.details.push({
					field: "deal.quotedValue",
					status: "fixed",
					reason: `Deterministically extracted amount ${parsedAmount} from quote`,
				});
			}
		}

		if (facts.deal.leadBudget.evidence?.quote) {
			const parsedAmount = parseDeterministicAmount(
				facts.deal.leadBudget.evidence.quote,
			);
			if (
				parsedAmount !== null &&
				parsedAmount !== facts.deal.leadBudget.value
			) {
				facts.deal.leadBudget.value = parsedAmount;
				summary.fixed++;
				summary.details.push({
					field: "deal.leadBudget",
					status: "fixed",
					reason: `Deterministically extracted amount ${parsedAmount} from quote`,
				});
			}
		}

		if (facts.deal.leadBudget.value !== null) {
			if (facts.deal.leadBudget.evidence?.speaker === "us") {
				if (!facts.deal.quotedValue.value) {
					facts.deal.quotedValue = {
						value: facts.deal.leadBudget.value,
						evidence: facts.deal.leadBudget.evidence,
					};
				}
				facts.deal.leadBudget = { value: null, evidence: null };
			} else if (
				facts.deal.quotedValue.value !== null &&
				facts.deal.leadBudget.value === facts.deal.quotedValue.value
			) {
				const quote = facts.deal.leadBudget.evidence?.quote ?? "";
				const hasNumericBudget = /\b(\d+|lakh|crore|thousand|k)\b/i.test(quote);
				if (!hasNumericBudget) {
					facts.deal.leadBudget = { value: null, evidence: null };
				}
			}
		}

		if (
			facts.deal.quotedValue.value === null &&
			facts.deal.leadBudget.value === null
		) {
			for (const msg of messages) {
				if (msg.sender === me) {
					const amt = parseDeterministicAmount(msg.text);
					if (amt !== null) {
						facts.deal.quotedValue = {
							value: amt,
							evidence: {
								sourceKind: "whatsapp.message",
								speaker: "us",
								quote: msg.text,
								lineNos: [msg.lineNo],
							},
						};
						summary.fixed++;
						summary.details.push({
							field: "deal.quotedValue",
							status: "fixed",
							reason: `Extracted quoted amount ${amt} from seller message`,
						});
						break;
					}
				}
			}
		}

		facts.deal.currency.evidence = validateItem(
			"deal.currency",
			facts.deal.currency.evidence,
			false,
			facts.deal.quotedValue.value ? "us" : "lead",
		);
	}

	function validateTimelineAndNextSteps(): void {
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

		const inferred = inferDealStageWithEvidence(facts, messages, me, lead);
		facts.deal.stageSuggestion.value = inferred.stage;
		facts.deal.stageSuggestion.evidence = {
			sourceKind: inferred.evidence.sourceKind,
			speaker: inferred.evidence.speaker,
			quote: inferred.evidence.quote,
			lineNos: inferred.evidence.lineNos,
		};
		summary.details.push({
			field: "deal.stageSuggestion",
			status: "verified",
			reason: `Inferred stage ${inferred.stage}: "${inferred.evidence.quote}" (${inferred.reason})`,
		});

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
				`${facts.nextStep.value ?? ""} ${facts.nextStep.dueAt ?? ""} ${facts.nextStep.evidence?.quote ?? ""}`.trim();
			const nextStepNorm = normalize(combined);
			if (!facts.nextStep.owner) {
				facts.nextStep.owner =
					nextStepNorm.includes("bhej") ||
					nextStepNorm.includes("send") ||
					nextStepNorm.includes("quotation") ||
					nextStepNorm.includes("quote")
						? "us"
						: "lead";
			}

			let resolved =
				resolveDueAt(facts.nextStep.dueAt, refDate, timezoneOffset) ||
				resolveDueAt(combined, refDate, timezoneOffset);
			if (!resolved) {
				const dueMsg = messages.find((m) =>
					/saturday|tomorrow|kal|morgen|mañana|hour|ghante|stunde|hora|week|demo|centre|test|meeting|termin/i.test(
						m.text,
					),
				);
				if (dueMsg) {
					resolved = resolveDueAt(dueMsg.text, refDate, timezoneOffset);
				}
			}
			if (resolved) {
				facts.nextStep.dueAt = resolved;
			}
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
	}

	validateContactAndCompany();
	validateDealAmounts();
	validateTimelineAndNextSteps();

	return summary;
}

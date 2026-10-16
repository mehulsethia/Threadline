import { createHash, randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import {
	ActivityType,
	DealStage,
	db,
	EmailDirection,
	IntakeJobStatus,
	Prisma,
} from "@crm/db";
import { downloadFile } from "@crm/db/blob";
import {
	type ParsedWhatsAppExport,
	parseWhatsAppExport,
	type WhatsAppMessageItem,
} from "@crm/validation/whatsapp-parser";
import { FunctionTool } from "@google/adk";
import { z } from "zod";
import type { EvidenceKind } from "../../agent/lib/evidence";
import { type FactField, recordFact } from "../../agent/lib/facts";
import {
	extractLeadFacts as runExtractLeadFacts,
	transcribeAudio as runTranscribeAudio,
} from "../extraction";

export async function emitIntakeEvent(
	jobId: string,
	tool: string,
	message: string,
	contactId?: string | null,
	details?: Record<string, unknown>,
) {
	try {
		await db.agentEvent.create({
			data: {
				id: randomUUID(),
				sessionId: jobId,
				contactId: contactId ?? null,
				type: "intake.step",
				data: {
					tool,
					message,
					timestamp: new Date().toISOString(),
					...(details ?? {}),
				},
				emittedAt: new Date(),
			},
		});
	} catch {}
}

export async function readFileBytes(fileUrl: string): Promise<Buffer> {
	if (existsSync(fileUrl)) {
		return readFileSync(fileUrl);
	}

	if (fileUrl.startsWith("http://") || fileUrl.startsWith("https://")) {
		try {
			const res = await fetch(fileUrl);
			if (res.ok) {
				const arrayBuf = await res.arrayBuffer();
				return Buffer.from(arrayBuf);
			}
		} catch {}
	}

	let destination = fileUrl;
	if (fileUrl.includes("googleapis.com/")) {
		try {
			const url = new URL(fileUrl);
			const parts = url.pathname.split("/").filter(Boolean);
			destination = parts.slice(1).join("/");
		} catch {}
	}

	for (let attempt = 0; attempt < 3; attempt++) {
		try {
			return await downloadFile(destination);
		} catch (err) {
			if (attempt === 2) throw err;
			await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
		}
	}
	return await downloadFile(destination);
}

export async function loadIntakeJob(input: { jobId: string }) {
	const job = await db.intakeJob.findUnique({
		where: { id: input.jobId },
	});
	if (!job) {
		throw new Error(`Intake job ${input.jobId} not found.`);
	}
	await emitIntakeEvent(
		input.jobId,
		"load_intake_job",
		`Loaded intake job ${input.jobId} (source: ${job.sourceType})`,
	);
	return {
		id: job.id,
		status: job.status,
		sourceType: job.sourceType,
		fileUrl: job.fileUrl,
		summary: job.summary,
	};
}

export async function parseWhatsAppExportFile(input: {
	jobId: string;
	fileUrl: string;
}): Promise<ParsedWhatsAppExport & { messageCount: number }> {
	const bytes = await readFileBytes(input.fileUrl);
	const parsed = parseWhatsAppExport(bytes);
	await emitIntakeEvent(
		input.jobId,
		"parse_whatsapp_export",
		`Parsed ${parsed.messages.length} messages with participants: ${parsed.participants.join(", ")}`,
		null,
		{ messageCount: parsed.messages.length, participants: parsed.participants },
	);
	return {
		...parsed,
		messageCount: parsed.messages.length,
	};
}

export async function transcribeAudioFile(input: {
	jobId: string;
	fileUrl: string;
}) {
	const bytes = await readFileBytes(input.fileUrl);
	const result = await runTranscribeAudio({
		buffer: bytes,
		filename: input.fileUrl,
	});
	await emitIntakeEvent(
		input.jobId,
		"transcribe_audio",
		`Transcribed audio file (${result.segments.length} segments, language: ${result.language})`,
		null,
		{ language: result.language, segmentsCount: result.segments.length },
	);
	return {
		language: result.language,
		transcript: result.fullTranscript,
		segments: result.segments,
	};
}

export async function extractLeadFactsFromInput(input: {
	jobId: string;
	messages?: WhatsAppMessageItem[];
	transcript?: string;
	me?: string;
}) {
	const extraction = await runExtractLeadFacts({
		messages: input.messages,
		transcript: input.transcript,
		me: input.me,
	});
	const leadName = extraction.facts.contact.name.value ?? "Unknown";
	await emitIntakeEvent(
		input.jobId,
		"extract_lead_facts",
		`Extracted facts for lead "${leadName}" (us: "${extraction.facts.participants.me}", lead: "${extraction.facts.participants.lead}"). Validated ${extraction.validationSummary.verified} facts.`,
		null,
		{
			lead: leadName,
			participants: extraction.facts.participants,
			verifiedCount: extraction.validationSummary.verified,
		},
	);
	return extraction;
}

export async function findMatchingContact(input: {
	jobId: string;
	phone?: string;
	name?: string;
	companyName?: string;
}) {
	if (input.phone) {
		const cleanPhone = input.phone.replace(/[\s-]/g, "");
		const phoneMatch = await db.contact.findFirst({
			where: {
				phone: {
					contains: cleanPhone.slice(-10),
				},
			},
			select: { id: true, firstName: true, lastName: true },
		});
		if (phoneMatch) {
			await emitIntakeEvent(
				input.jobId,
				"find_matching_contact",
				`Found existing contact by phone: ${phoneMatch.firstName} ${phoneMatch.lastName || ""} (${phoneMatch.id})`,
				phoneMatch.id,
			);
			return { contactId: phoneMatch.id, matchedBy: "phone" };
		}
	}

	if (input.name) {
		const parts = input.name.trim().split(/\s+/);
		const firstName = parts[0] || input.name;
		const nameCandidates = await db.contact.findMany({
			where: {
				firstName: {
					equals: firstName,
					mode: "insensitive",
				},
			},
			include: { company: true },
		});

		for (const cand of nameCandidates) {
			if (
				input.companyName &&
				cand.company?.name
					?.toLowerCase()
					.includes(input.companyName.toLowerCase())
			) {
				await emitIntakeEvent(
					input.jobId,
					"find_matching_contact",
					`Found existing contact by name and company: ${cand.firstName} ${cand.lastName || ""} (${cand.id})`,
					cand.id,
				);
				return { contactId: cand.id, matchedBy: "name_and_company" };
			}
		}

		if (nameCandidates.length >= 1 && nameCandidates[0]) {
			const single = nameCandidates[0];
			const fullName = `${single.firstName} ${single.lastName || ""}`.trim();
			await emitIntakeEvent(
				input.jobId,
				"find_matching_contact",
				`Name match without company found: ${fullName} (${single.id}). Creating new contact and proposing duplicate suggestion.`,
				single.id,
			);
			return {
				contactId: null,
				matchedBy: null,
				possibleDuplicateContactId: single.id,
				possibleDuplicateName: fullName,
			};
		}
	}

	await emitIntakeEvent(
		input.jobId,
		"find_matching_contact",
		"No existing contact matched. Will create a new contact.",
	);
	return { contactId: null, matchedBy: null };
}

export async function upsertCompany(input: {
	jobId: string;
	name: string;
	city?: string;
}) {
	const cleanName = input.name.trim();
	const existing = await db.company.findFirst({
		where: {
			name: {
				equals: cleanName,
				mode: "insensitive",
			},
		},
	});

	if (existing) {
		if (input.city && !existing.city) {
			await db.company.update({
				where: { id: existing.id },
				data: { city: input.city },
			});
		}
		await emitIntakeEvent(
			input.jobId,
			"upsert_company",
			`Found existing company: "${existing.name}" (${existing.id})`,
		);
		return { companyId: existing.id, created: false };
	}

	const defaultUser = await db.user.findFirst({ select: { id: true } });
	const created = await db.company.create({
		data: {
			name: cleanName,
			city: input.city || null,
			ownerId: defaultUser?.id,
		},
	});

	await emitIntakeEvent(
		input.jobId,
		"upsert_company",
		`Created company: "${created.name}" (${created.id})`,
	);
	return { companyId: created.id, created: true };
}

export async function upsertContact(input: {
	jobId: string;
	contactId?: string;
	name: string;
	phone?: string;
	role?: string;
	companyId?: string;
}) {
	const parts = input.name.trim().split(/\s+/);
	const firstName = parts[0] || input.name;
	const lastName = parts.length > 1 ? parts.slice(1).join(" ") : null;

	if (input.contactId) {
		const existing = await db.contact.findUnique({
			where: { id: input.contactId },
		});
		if (existing) {
			const updateData: Record<string, unknown> = {};
			if (input.phone && !existing.phone) updateData.phone = input.phone;
			if (input.role && !existing.title) updateData.title = input.role;
			if (input.companyId && !existing.companyId)
				updateData.companyId = input.companyId;

			if (Object.keys(updateData).length > 0) {
				await db.contact.update({
					where: { id: input.contactId },
					data: updateData,
				});
			}

			await emitIntakeEvent(
				input.jobId,
				"upsert_contact",
				`Updated contact: ${existing.firstName} ${existing.lastName || ""} (${input.contactId})`,
				input.contactId,
			);
			return { contactId: input.contactId, created: false };
		}
	}

	const defaultUser = await db.user.findFirst({ select: { id: true } });
	const created = await db.contact.create({
		data: {
			firstName,
			lastName,
			phone: input.phone || null,
			title: input.role || null,
			companyId: input.companyId || null,
			ownerId: defaultUser?.id,
		},
	});

	await emitIntakeEvent(
		input.jobId,
		"upsert_contact",
		`Created contact: ${created.firstName} ${created.lastName || ""} (${created.id})`,
		created.id,
	);
	return { contactId: created.id, created: true };
}

export async function upsertDeal(input: {
	jobId: string;
	dealId?: string;
	name: string;
	stage: string;
	value?: number;
	currency?: string;
	targetDate?: string;
	companyId?: string;
	contactId?: string;
}) {
	const stageEnum = (
		Object.values(DealStage).includes(input.stage as DealStage)
			? input.stage
			: DealStage.QUALIFIED_TO_BUY
	) as DealStage;

	const finalCompanyId = input.companyId || null;

	const defaultUser = await db.user.findFirst({ select: { id: true } });
	const ownerId = defaultUser?.id || "system";

	if (input.dealId) {
		const updated = await db.deal.update({
			where: { id: input.dealId },
			data: {
				stage: stageEnum,
				amount:
					input.value !== undefined
						? new Prisma.Decimal(input.value)
						: undefined,
				currency: input.currency || "INR",
				expectedCloseDate: input.targetDate
					? new Date(input.targetDate)
					: undefined,
			},
		});
		await emitIntakeEvent(
			input.jobId,
			"upsert_deal",
			`Updated deal: "${updated.name}" (${updated.id}) in stage ${stageEnum}`,
			input.contactId,
		);
		return { dealId: updated.id, created: false };
	}

	if (input.contactId) {
		const existingDealContact = await db.dealContact.findFirst({
			where: {
				contactId: input.contactId,
				deal: {
					stage: {
						notIn: [DealStage.CLOSED_WON, DealStage.CLOSED_LOST],
					},
				},
			},
			include: { deal: true },
		});

		if (existingDealContact?.deal) {
			const updated = await db.deal.update({
				where: { id: existingDealContact.deal.id },
				data: {
					stage: stageEnum,
					amount:
						input.value !== undefined
							? new Prisma.Decimal(input.value)
							: existingDealContact.deal.amount,
					expectedCloseDate: input.targetDate
						? new Date(input.targetDate)
						: existingDealContact.deal.expectedCloseDate,
				},
			});
			await emitIntakeEvent(
				input.jobId,
				"upsert_deal",
				`Updated existing active deal: "${updated.name}" (${updated.id}) in stage ${stageEnum}`,
				input.contactId,
			);
			return { dealId: updated.id, created: false };
		}
	}

	const created = await db.deal.create({
		data: {
			name: input.name,
			stage: stageEnum,
			amount:
				input.value !== undefined ? new Prisma.Decimal(input.value) : null,
			currency: input.currency || "INR",
			expectedCloseDate: input.targetDate ? new Date(input.targetDate) : null,
			companyId: finalCompanyId,
			ownerId,
		},
	});

	if (input.contactId) {
		await db.dealContact.create({
			data: {
				dealId: created.id,
				contactId: input.contactId,
			},
		});
	}

	await emitIntakeEvent(
		input.jobId,
		"upsert_deal",
		`Created deal: "${created.name}" (${created.id}) for ${input.value ?? 0} ${input.currency || "INR"} (stage: ${stageEnum})`,
		input.contactId,
	);
	return { dealId: created.id, created: true };
}

export async function recordFactAction(input: {
	jobId: string;
	contactId?: string;
	dealId?: string;
	field: string;
	value: string;
	sourceKind: string;
	quote?: string;
	lineNos?: number[];
	speaker?: string;
}) {
	const effectiveSourceKind = [
		"stage",
		"language",
		"sentiment",
		"possibleDuplicate",
	].includes(input.field)
		? "agent.inference"
		: input.sourceKind;

	const detail = input.quote
		? `"${input.quote}" (speaker: ${input.speaker || "lead"})`
		: input.value;
	const result = await recordFact({
		contactId: input.contactId,
		dealId: input.dealId,
		field: input.field as FactField,
		value: input.value,
		evidence: [
			{
				kind: effectiveSourceKind as EvidenceKind,
				detail,
			},
		],
		method: "adk.intake",
	});

	const statusLabel = result.applied ? "APPLIED" : "PROPOSED";
	await emitIntakeEvent(
		input.jobId,
		"record_fact",
		`Recorded fact "${input.field} = ${input.value}" as ${statusLabel} (score: ${result.score}, band: ${result.band})`,
		input.contactId,
	);

	return {
		stored: result.stored,
		applied: result.applied,
		band: result.band,
		score: result.score,
		rationale: result.rationale,
	};
}

export async function storeMessagesAction(input: {
	jobId: string;
	contactId?: string;
	dealId?: string;
	me?: string;
	messages: Array<{
		lineNo: number;
		timestamp: string;
		sender: string;
		text: string;
	}>;
}) {
	let storedCount = 0;

	for (const msg of input.messages) {
		const externalId = createHash("sha256")
			.update(`${msg.timestamp}-${msg.sender}-${msg.text}`)
			.digest("hex");

		const direction =
			msg.sender === input.me
				? EmailDirection.OUTBOUND
				: EmailDirection.INBOUND;

		await db.whatsAppMessage.upsert({
			where: { externalId },
			create: {
				externalId,
				contactId: input.contactId || null,
				dealId: input.dealId || null,
				senderPhone: msg.sender,
				senderName: msg.sender,
				direction,
				body: msg.text,
				timestamp: new Date(msg.timestamp),
				evidenceRef: `line:${msg.lineNo}`,
			},
			update: {
				contactId: input.contactId || undefined,
				dealId: input.dealId || undefined,
			},
		});
		storedCount++;
	}

	await emitIntakeEvent(
		input.jobId,
		"store_messages",
		`Stored ${storedCount} WhatsApp messages (idempotent content hash deduplication)`,
		input.contactId,
	);

	return { storedCount };
}

export async function logActivityAction(input: {
	jobId: string;
	type: "WHATSAPP" | "VOICE_NOTE";
	contactId?: string;
	dealId?: string;
	companyId?: string;
	subject?: string;
	body?: string;
	occurredAt?: string;
}) {
	const existing = await db.activity.findFirst({
		where: {
			type: input.type as ActivityType,
			contactId: input.contactId || null,
			dealId: input.dealId || null,
		},
	});
	if (existing) {
		await emitIntakeEvent(
			input.jobId,
			"log_activity",
			`Reused existing ${input.type} activity (${existing.id})`,
			input.contactId,
		);
		return { activityId: existing.id };
	}

	const defaultUser = await db.user.findFirst({ select: { id: true } });
	const created = await db.activity.create({
		data: {
			type: input.type as ActivityType,
			subject: input.subject || `${input.type} conversation imported`,
			body: input.body || null,
			occurredAt: input.occurredAt ? new Date(input.occurredAt) : new Date(),
			contactId: input.contactId || null,
			dealId: input.dealId || null,
			companyId: input.companyId || null,
			createdById: defaultUser?.id || "system",
		},
	});

	await emitIntakeEvent(
		input.jobId,
		"log_activity",
		`Logged ${input.type} activity on timeline (${created.id})`,
		input.contactId,
	);

	return { activityId: created.id };
}

export async function createTaskAction(input: {
	jobId: string;
	subject: string;
	dueAt?: string;
	contactId?: string;
	dealId?: string;
	companyId?: string;
}) {
	const existing = await db.activity.findFirst({
		where: {
			type: ActivityType.TASK,
			subject: input.subject,
			contactId: input.contactId || null,
			dealId: input.dealId || null,
		},
	});
	if (existing) {
		await emitIntakeEvent(
			input.jobId,
			"create_task",
			`Reused existing follow-up task: "${input.subject}" (${existing.id})`,
			input.contactId,
		);
		return { taskId: existing.id };
	}

	const defaultUser = await db.user.findFirst({ select: { id: true } });
	const created = await db.activity.create({
		data: {
			type: ActivityType.TASK,
			subject: input.subject,
			dueAt: input.dueAt ? new Date(input.dueAt) : null,
			contactId: input.contactId || null,
			dealId: input.dealId || null,
			companyId: input.companyId || null,
			createdById: defaultUser?.id || "system",
		},
	});

	await emitIntakeEvent(
		input.jobId,
		"create_task",
		`Created follow-up task: "${input.subject}" (due: ${input.dueAt || "no deadline"})`,
		input.contactId,
	);

	return { taskId: created.id };
}

export async function finishJobAction(input: {
	jobId: string;
	summary: Record<string, unknown>;
	contactIds: string[];
	dealIds: string[];
}) {
	await db.intakeJob.update({
		where: { id: input.jobId },
		data: {
			status: IntakeJobStatus.DONE,
			summary: input.summary as Prisma.InputJsonValue,
			createdContactIds: input.contactIds,
			createdDealIds: input.dealIds,
		},
	});

	await emitIntakeEvent(
		input.jobId,
		"finish_job",
		`Intake job finished successfully. Linked contacts: ${input.contactIds.length}, deals: ${input.dealIds.length}.`,
		input.contactIds[0],
	);

	return { finished: true };
}

export const loadIntakeJobTool = new FunctionTool({
	name: "load_intake_job",
	description: "Loads an intake job from the database by its ID.",
	parameters: z.object({
		jobId: z.string().describe("The ID of the intake job to load."),
	}),
	execute: loadIntakeJob,
});

export const parseWhatsAppExportTool = new FunctionTool({
	name: "parse_whatsapp_export",
	description:
		"Parses a WhatsApp chat export (.txt or .zip), returning message count, participants, and parsed messages.",
	parameters: z.object({
		jobId: z.string().describe("The intake job ID."),
		fileUrl: z
			.string()
			.describe("Path or URL to the WhatsApp export .txt or .zip file."),
	}),
	execute: parseWhatsAppExportFile,
});

export const transcribeAudioTool = new FunctionTool({
	name: "transcribe_audio",
	description:
		"Transcribes an audio recording or voice note file using Gemini audio transcription.",
	parameters: z.object({
		jobId: z.string().describe("The intake job ID."),
		fileUrl: z.string().describe("Path or URL to the audio recording file."),
	}),
	execute: transcribeAudioFile,
});

export const extractLeadFactsTool = new FunctionTool({
	name: "extract_lead_facts",
	description:
		"Extracts structured lead facts, participant attribution, money fields, timeline, and objections with verification.",
	parameters: z.object({
		jobId: z.string().describe("The intake job ID."),
		text: z.string().describe("The chat text or transcript to analyze."),
		me: z
			.string()
			.optional()
			.describe(
				"Optional explicit participant name or phone representing 'us' (the business user).",
			),
	}),
	execute: async ({ jobId, text, me }) => {
		const extraction = await runExtractLeadFacts({
			transcript: text,
			me,
		});
		const leadName = extraction.facts.contact.name.value ?? "Unknown";
		await emitIntakeEvent(
			jobId,
			"extract_lead_facts",
			`Extracted facts for lead "${leadName}" (us: "${extraction.facts.participants.me}", lead: "${extraction.facts.participants.lead}"). Validated ${extraction.validationSummary.verified} facts.`,
			null,
			{
				lead: leadName,
				participants: extraction.facts.participants,
				verifiedCount: extraction.validationSummary.verified,
			},
		);
		return extraction;
	},
});

export const findMatchingContactTool = new FunctionTool({
	name: "find_matching_contact",
	description:
		"Deduplicates contact records: checks by phone number first, then by name and company.",
	parameters: z.object({
		jobId: z.string().describe("The intake job ID."),
		phone: z.string().optional().describe("Contact phone number."),
		name: z.string().optional().describe("Contact name."),
		companyName: z.string().optional().describe("Associated company name."),
	}),
	execute: findMatchingContact,
});

export const upsertCompanyTool = new FunctionTool({
	name: "upsert_company",
	description:
		"Finds an existing company by name or creates a new company record.",
	parameters: z.object({
		jobId: z.string().describe("The intake job ID."),
		name: z.string().describe("Company name."),
		city: z.string().optional().describe("Company city."),
	}),
	execute: upsertCompany,
});

export const upsertContactTool = new FunctionTool({
	name: "upsert_contact",
	description:
		"Creates or updates a contact record. Never creates the business user as a contact.",
	parameters: z.object({
		jobId: z.string().describe("The intake job ID."),
		contactId: z
			.string()
			.optional()
			.describe("Existing contact ID if already found."),
		name: z.string().describe("Full name of the contact."),
		phone: z.string().optional().describe("Phone number of the contact."),
		role: z.string().optional().describe("Role or job title of the contact."),
		companyId: z.string().optional().describe("Associated company ID."),
	}),
	execute: upsertContact,
});

export const upsertDealTool = new FunctionTool({
	name: "upsert_deal",
	description:
		"Creates or updates a deal in the CRM pipeline with stage, value, and timeline.",
	parameters: z.object({
		jobId: z.string().describe("The intake job ID."),
		dealId: z.string().optional().describe("Existing deal ID if updating."),
		name: z.string().describe("Deal name or requirement summary."),
		stage: z
			.string()
			.describe(
				"Deal pipeline stage enum value (e.g. DEMO_BOOKED, QUALIFIED_TO_BUY, CONTRACT_SENT).",
			),
		value: z.number().optional().describe("Deal value or budget."),
		currency: z.string().optional().describe("Currency code, e.g. INR."),
		targetDate: z
			.string()
			.optional()
			.describe("Target delivery or close date (ISO string)."),
		companyId: z.string().optional().describe("Associated company ID."),
		contactId: z.string().optional().describe("Primary contact ID."),
	}),
	execute: upsertDeal,
});

export const recordFactTool = new FunctionTool({
	name: "record_fact",
	description:
		"Records an extracted fact through the evidence ledger. Literal facts write directly; weak/inference evidence becomes PROPOSED.",
	parameters: z.object({
		jobId: z.string().describe("The intake job ID."),
		contactId: z.string().optional().describe("Contact ID."),
		dealId: z.string().optional().describe("Deal ID."),
		field: z.string().describe("Fact field name."),
		value: z.string().describe("Fact value string."),
		sourceKind: z
			.string()
			.describe(
				"Evidence source kind: whatsapp.message, voice.transcript, or agent.inference.",
			),
		quote: z.string().optional().describe("Supporting quote text."),
		lineNos: z
			.array(z.number())
			.optional()
			.describe("Line numbers where quote appears."),
		speaker: z.string().optional().describe("Speaker: lead or us."),
	}),
	execute: recordFactAction,
});

export const storeMessagesTool = new FunctionTool({
	name: "store_messages",
	description:
		"Idempotently stores WhatsApp messages linked to the contact and deal using content hash deduplication.",
	parameters: z.object({
		jobId: z.string().describe("The intake job ID."),
		contactId: z.string().optional().describe("Contact ID."),
		dealId: z.string().optional().describe("Deal ID."),
		me: z.string().optional().describe("Name/phone of the business user."),
		messages: z
			.array(
				z.object({
					lineNo: z.number(),
					timestamp: z.string(),
					sender: z.string(),
					text: z.string(),
				}),
			)
			.describe("List of parsed messages to store."),
	}),
	execute: storeMessagesAction,
});

export const logActivityTool = new FunctionTool({
	name: "log_activity",
	description: "Logs a WHATSAPP or VOICE_NOTE activity record on the timeline.",
	parameters: z.object({
		jobId: z.string().describe("The intake job ID."),
		type: z.enum(["WHATSAPP", "VOICE_NOTE"]).describe("Activity type."),
		contactId: z.string().optional().describe("Contact ID."),
		dealId: z.string().optional().describe("Deal ID."),
		companyId: z.string().optional().describe("Company ID."),
		subject: z.string().optional().describe("Activity subject."),
		body: z.string().optional().describe("Activity body text."),
		occurredAt: z.string().optional().describe("When activity occurred."),
	}),
	execute: logActivityAction,
});

export const createTaskTool = new FunctionTool({
	name: "create_task",
	description: "Creates a follow-up task activity when nextStep owner is 'us'.",
	parameters: z.object({
		jobId: z.string().describe("The intake job ID."),
		subject: z.string().describe("Task description/action item."),
		dueAt: z
			.string()
			.optional()
			.describe("Due timestamp in ISO format if stated."),
		contactId: z.string().optional().describe("Contact ID."),
		dealId: z.string().optional().describe("Deal ID."),
		companyId: z.string().optional().describe("Company ID."),
	}),
	execute: createTaskAction,
});

export const finishJobTool = new FunctionTool({
	name: "finish_job",
	description:
		"Marks an intake job as completed, storing the summary and created IDs.",
	parameters: z.object({
		jobId: z.string().describe("The intake job ID."),
		summary: z
			.record(z.string(), z.unknown())
			.describe("Execution summary JSON."),
		contactIds: z
			.array(z.string())
			.describe("List of created/updated contact IDs."),
		dealIds: z.array(z.string()).describe("List of created/updated deal IDs."),
	}),
	execute: finishJobAction,
});

export const INTAKE_TOOLS = [
	loadIntakeJobTool,
	parseWhatsAppExportTool,
	transcribeAudioTool,
	extractLeadFactsTool,
	findMatchingContactTool,
	upsertCompanyTool,
	upsertContactTool,
	upsertDealTool,
	recordFactTool,
	storeMessagesTool,
	logActivityTool,
	createTaskTool,
	finishJobTool,
];

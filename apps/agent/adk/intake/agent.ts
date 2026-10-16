import { db, IntakeJobStatus } from "@crm/db";
import { Gemini, InMemoryRunner, LlmAgent } from "@google/adk";
import { completeTask, type LeasedTask } from "../../agent/lib/tasks";
import {
	createTaskAction,
	emitIntakeEvent,
	extractLeadFactsFromInput,
	findMatchingContact,
	finishJobAction,
	INTAKE_TOOLS,
	loadIntakeJob,
	logActivityAction,
	parseWhatsAppExportFile,
	recordFactAction,
	storeMessagesAction,
	transcribeAudioFile,
	upsertCompany,
	upsertContact,
	upsertDeal,
} from "./tools";

const gemini = new Gemini({
	model: process.env.GEMINI_SMART_MODEL || "gemini-4-argon",
	vertexai: true,
	project: process.env.GOOGLE_CLOUD_PROJECT,
	location: process.env.GEMINI_SMART_LOCATION || "global",
});

export const intakeAgent = new LlmAgent({
	name: "threadline_intake_agent",
	model: gemini,
	instruction: `You are the Threadline Autonomous Intake Agent.
Your responsibility is to ingest WhatsApp exports and audio recordings, extract sales intelligence, and populate the CRM database accurately.

Follow these strict rules:
1. Always load the job details using load_intake_job.
2. If WhatsApp export, parse the file with parse_whatsapp_export. If audio note, transcribe with transcribe_audio.
3. Extract lead facts with extract_lead_facts.
4. Deduplicate contacts using find_matching_contact. Never create the business-side participant as a contact.
5. Upsert company using upsert_company if company name is known.
6. Upsert the lead contact using upsert_contact. Never invent missing details.
7. Upsert the deal using upsert_deal with the correct CRM DealStage enum, budget or quoted price, and target closing date.
8. Record every extracted fact using record_fact so facts are recorded in the evidence ledger.
9. Store messages idempotently using store_messages.
10. Log the activity using log_activity (WHATSAPP or VOICE_NOTE).
11. If nextStep owner is "us", create a follow-up task with create_task. If nextStep owner is "lead" and has a dueAt, create a task for us: "Check: <lead's next step>" due 2 hours after it.
12. Finalize the job with finish_job.

Never invent values. Skip null fields. Explain each decision in one concise line.`,
	tools: INTAKE_TOOLS,
});

export async function runDeterministicIntakePipeline(
	jobId: string,
	meOverride?: string,
): Promise<{ contactId: string; dealId: string }> {
	const job = await loadIntakeJob({ jobId });

	let parsedMessages: Array<{
		lineNo: number;
		timestamp: Date;
		sender: string;
		text: string;
	}> = [];
	let transcriptText = "";

	if (job.sourceType === "WHATSAPP_EXPORT") {
		const parsed = await parseWhatsAppExportFile({
			jobId,
			fileUrl: job.fileUrl,
		});
		parsedMessages = parsed.messages;
	} else {
		const transcribed = await transcribeAudioFile({
			jobId,
			fileUrl: job.fileUrl,
		});
		transcriptText = transcribed.transcript;
	}

	const extraction = await extractLeadFactsFromInput({
		jobId,
		messages: parsedMessages.length > 0 ? parsedMessages : undefined,
		transcript: transcriptText || undefined,
		me: meOverride,
	});

	const { facts } = extraction;
	const leadName = facts.contact.name.value || facts.participants.lead;
	const leadPhone = facts.contact.phone.value || undefined;
	const companyName = facts.company.name.value || undefined;

	const matchResult = await findMatchingContact({
		jobId,
		phone: leadPhone,
		name: leadName,
		companyName,
	});

	let companyId: string | undefined;
	if (companyName) {
		const compResult = await upsertCompany({
			jobId,
			name: companyName,
			city: facts.company.city.value || undefined,
		});
		companyId = compResult.companyId;
	}

	const contactResult = await upsertContact({
		jobId,
		contactId: matchResult.contactId || undefined,
		name: leadName,
		phone: leadPhone,
		role: facts.contact.role.value || undefined,
		companyId,
	});
	const contactId = contactResult.contactId;

	const dealValue =
		facts.deal.quotedValue.value ?? facts.deal.leadBudget.value ?? undefined;
	const dealName = facts.deal.need.value || `Enquiry from ${leadName}`;

	const dealResult = await upsertDeal({
		jobId,
		name: dealName,
		stage: facts.deal.stageSuggestion.value || "QUALIFIED_TO_BUY",
		value: dealValue,
		currency: facts.deal.currency.value || "INR",
		targetDate: facts.deal.timelineResolved || undefined,
		companyId,
		contactId,
	});
	const dealId = dealResult.dealId;

	if (matchResult.possibleDuplicateName) {
		await recordFactAction({
			jobId,
			contactId,
			field: "possibleDuplicate",
			value: `possible duplicate of ${matchResult.possibleDuplicateName}`,
			sourceKind: "agent.inference",
			quote: `Name match with existing contact ${matchResult.possibleDuplicateName}`,
			lineNos: [],
			speaker: "us",
		});
	}

	if (facts.deal.need.value && facts.deal.need.evidence) {
		await recordFactAction({
			jobId,
			dealId,
			field: "need",
			value: facts.deal.need.value,
			sourceKind: facts.deal.need.evidence.sourceKind,
			quote: facts.deal.need.evidence.quote,
			lineNos: facts.deal.need.evidence.lineNos,
			speaker: facts.deal.need.evidence.speaker,
		});
	}

	if (facts.deal.leadBudget.value !== null && facts.deal.leadBudget.evidence) {
		await recordFactAction({
			jobId,
			dealId,
			field: "leadBudget",
			value: String(facts.deal.leadBudget.value),
			sourceKind: facts.deal.leadBudget.evidence.sourceKind,
			quote: facts.deal.leadBudget.evidence.quote,
			lineNos: facts.deal.leadBudget.evidence.lineNos,
			speaker: facts.deal.leadBudget.evidence.speaker,
		});
	}

	if (
		facts.deal.quotedValue.value !== null &&
		facts.deal.quotedValue.evidence
	) {
		await recordFactAction({
			jobId,
			dealId,
			field: "quotedValue",
			value: String(facts.deal.quotedValue.value),
			sourceKind: facts.deal.quotedValue.evidence.sourceKind,
			quote: facts.deal.quotedValue.evidence.quote,
			lineNos: facts.deal.quotedValue.evidence.lineNos,
			speaker: facts.deal.quotedValue.evidence.speaker,
		});
	}

	if (facts.deal.timeline.value && facts.deal.timeline.evidence) {
		const timelineVal = facts.deal.timelineResolved
			? `${facts.deal.timeline.value} (${facts.deal.timelineResolved})`
			: facts.deal.timeline.value;
		await recordFactAction({
			jobId,
			dealId,
			field: "timeline",
			value: timelineVal,
			sourceKind: facts.deal.timeline.evidence.sourceKind,
			quote: facts.deal.timeline.evidence.quote,
			lineNos: facts.deal.timeline.evidence.lineNos,
			speaker: facts.deal.timeline.evidence.speaker,
		});
	}

	if (facts.deal.stageSuggestion.value && facts.deal.stageSuggestion.evidence) {
		await recordFactAction({
			jobId,
			dealId,
			field: "stage",
			value: facts.deal.stageSuggestion.value,
			sourceKind: facts.deal.stageSuggestion.evidence.sourceKind,
			quote: facts.deal.stageSuggestion.evidence.quote,
			lineNos: facts.deal.stageSuggestion.evidence.lineNos,
			speaker: facts.deal.stageSuggestion.evidence.speaker,
		});
	}

	if (facts.languagePreference.value && facts.languagePreference.evidence) {
		await recordFactAction({
			jobId,
			contactId,
			field: "language",
			value: facts.languagePreference.value,
			sourceKind: facts.languagePreference.evidence.sourceKind,
			quote: facts.languagePreference.evidence.quote,
			lineNos: facts.languagePreference.evidence.lineNos,
			speaker: facts.languagePreference.evidence.speaker,
		});
	}

	if (facts.sentiment.value && facts.sentiment.evidence) {
		await recordFactAction({
			jobId,
			contactId,
			field: "sentiment",
			value: facts.sentiment.value,
			sourceKind: facts.sentiment.evidence.sourceKind,
			quote: facts.sentiment.evidence.quote,
			lineNos: facts.sentiment.evidence.lineNos,
			speaker: facts.sentiment.evidence.speaker,
		});
	}

	for (const obj of facts.objections) {
		if (obj.evidence) {
			await recordFactAction({
				jobId,
				dealId,
				field: "objections",
				value: obj.objection,
				sourceKind: obj.evidence.sourceKind,
				quote: obj.evidence.quote,
				lineNos: obj.evidence.lineNos,
				speaker: obj.evidence.speaker,
			});
		}
	}

	if (parsedMessages.length > 0) {
		await storeMessagesAction({
			jobId,
			contactId,
			dealId,
			me: facts.participants.me,
			messages: parsedMessages.map((m) => ({
				lineNo: m.lineNo,
				timestamp: m.timestamp.toISOString(),
				sender: m.sender,
				text: m.text,
			})),
		});
	}

	await logActivityAction({
		jobId,
		type: job.sourceType === "WHATSAPP_EXPORT" ? "WHATSAPP" : "VOICE_NOTE",
		contactId,
		dealId,
		companyId,
		subject: `Imported ${job.sourceType.toLowerCase().replace("_", " ")}`,
		body: facts.deal.need.value || "Lead intake completed",
	});

	if (facts.nextStep.value) {
		if (facts.nextStep.owner === "us") {
			await createTaskAction({
				jobId,
				subject: facts.nextStep.value,
				dueAt: facts.nextStep.dueAt || undefined,
				contactId,
				dealId,
				companyId,
			});
		} else if (facts.nextStep.owner === "lead" && facts.nextStep.dueAt) {
			const leadDue = new Date(facts.nextStep.dueAt);
			const checkDue = !Number.isNaN(leadDue.getTime())
				? new Date(leadDue.getTime() + 2 * 3600 * 1000).toISOString()
				: undefined;
			await createTaskAction({
				jobId,
				subject: `Check: ${facts.nextStep.value}`,
				dueAt: checkDue,
				contactId,
				dealId,
				companyId,
			});
		}
	}

	await finishJobAction({
		jobId,
		summary: {
			lead: leadName,
			company: companyName,
			dealNeed: facts.deal.need.value,
			dealValue,
			stage: facts.deal.stageSuggestion.value,
			timeline: facts.deal.timelineResolved,
			participants: facts.participants,
		},
		contactIds: [contactId],
		dealIds: [dealId],
	});

	return { contactId, dealId };
}

export async function runAdkIntakeTask(task: LeasedTask): Promise<string> {
	const payload = (
		task.payload && typeof task.payload === "object" ? task.payload : {}
	) as Record<string, unknown>;
	const jobId = (payload.jobId as string | undefined) || task.contactId;
	if (!jobId) {
		return "Missing jobId for intake task.";
	}

	const meOverride = payload.me as string | undefined;

	await db.intakeJob.update({
		where: { id: jobId },
		data: { status: IntakeJobStatus.PROCESSING },
	});

	await emitIntakeEvent(
		jobId,
		"intake_agent",
		`Starting Threadline autonomous intake agent for job ${jobId}`,
	);

	try {
		const runner = new InMemoryRunner({ agent: intakeAgent });
		const prompt = `Process intake job "${jobId}" with me="${meOverride || ""}"`;

		for await (const event of runner.runEphemeral({
			userId: "system",
			newMessage: { parts: [{ text: prompt }] },
		})) {
			if (!event.content?.parts) continue;
			for (const part of event.content.parts) {
				if ("text" in part && part.text) {
					await emitIntakeEvent(
						jobId,
						"agent_thinking",
						part.text.slice(0, 300),
					);
				}
			}
		}
	} catch (error) {
		await emitIntakeEvent(
			jobId,
			"agent_warning",
			`Agent step execution notice: ${(error as Error).message}. Ensuring complete pipeline.`,
		);
	}

	const jobAfter = await db.intakeJob.findUnique({
		where: { id: jobId },
	});

	let outcome: string;
	if (jobAfter?.status !== IntakeJobStatus.DONE) {
		const res = await runDeterministicIntakePipeline(jobId, meOverride);
		outcome = `Intake job ${jobId} completed. Contact: ${res.contactId}, Deal: ${res.dealId}`;
	} else {
		await ensureNextStepTask(jobId, meOverride);
		outcome = `Intake job ${jobId} finished successfully.`;
	}

	await completeTask(task.id, outcome, jobId);
	return outcome;
}

async function ensureNextStepTask(jobId: string, meOverride?: string) {
	const job = await loadIntakeJob({ jobId });
	let parsedMessages: Array<{
		lineNo: number;
		timestamp: Date;
		sender: string;
		text: string;
	}> = [];
	if (job.sourceType === "WHATSAPP_EXPORT") {
		const parsed = await parseWhatsAppExportFile({
			jobId,
			fileUrl: job.fileUrl,
		});
		parsedMessages = parsed.messages;
	}
	const extraction = await extractLeadFactsFromInput({
		jobId,
		messages: parsedMessages,
		me: meOverride,
	});
	const facts = extraction.facts;
	if (!facts.nextStep.value) return;

	const taskSubject =
		facts.nextStep.owner === "lead"
			? `Check: ${facts.nextStep.value}`
			: facts.nextStep.value;

	const existing = await db.activity.findFirst({
		where: { type: "TASK", subject: taskSubject },
	});
	if (existing) return;

	let dueAt = facts.nextStep.dueAt || undefined;
	if (facts.nextStep.owner === "lead" && dueAt) {
		const leadDue = new Date(dueAt);
		if (!Number.isNaN(leadDue.getTime())) {
			dueAt = new Date(leadDue.getTime() + 2 * 3600 * 1000).toISOString();
		}
	}

	const leadName = facts.contact.name.value || "Lead";
	const firstName = leadName.split(" ")[0] || leadName;
	const contact = await db.contact.findFirst({
		where: {
			OR: [
				{ firstName: { contains: firstName, mode: "insensitive" } },
				...(facts.contact.phone.value
					? [{ phone: { contains: facts.contact.phone.value } }]
					: []),
			],
		},
		select: { id: true, companyId: true },
	});

	if (contact) {
		await createTaskAction({
			jobId,
			subject: taskSubject,
			dueAt,
			contactId: contact.id,
			companyId: contact.companyId || undefined,
		});
	}
}

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { db } from "../packages/db/src";
import { runAdkIntakeTask } from "../apps/agent/adk/intake/agent";
import { AgentTriggerService } from "../apps/api/src/agent/agent-trigger.service";
import { IntakeService } from "../apps/api/src/intake/intake.service";

async function findTaskForJob(jobId: string) {
	const tasks = await db.agentTask.findMany({
		where: {
			kind: "intake",
			finishedAt: null,
		},
		orderBy: { createdAt: "desc" },
	});
	return tasks.find(
		(t) =>
			t.payload &&
			typeof t.payload === "object" &&
			(t.payload as Record<string, unknown>).jobId === jobId,
	);
}

type IngestResult = {
	jobId: string;
	contactName: string;
	phone?: string | null;
	companyName?: string | null;
	dealName?: string | null;
	dealStage?: string | null;
	dealAmount?: string | number | null;
	dealCurrency?: string | null;
	tasksCount: number;
	tasks: Array<{ subject: string; dueAt?: string | null }>;
	factsCount: number;
	appliedFacts: number;
	proposedFacts: number;
};

async function main() {
	console.log("=== THREADLINE AUTONOMOUS MULTILINGUAL INTAKE PIPELINE TEST ===\n");

	await db.agentTask.updateMany({
		where: { kind: "intake", finishedAt: null },
		data: { finishedAt: new Date(), outcome: "Cleaned up prior test run" },
	});

	const testFirstNames = [
		"Vikram",
		"Sunita",
		"Sarah",
		"Alex",
		"Heinrich",
		"Oliver",
	];
	const existingTestContacts = await db.contact.findMany({
		where: { firstName: { in: testFirstNames } },
		select: { id: true },
	});
	const contactIds = existingTestContacts.map((c) => c.id);

	if (contactIds.length > 0) {
		await db.whatsAppMessage.deleteMany({
			where: { contactId: { in: contactIds } },
		});
		await db.contactFact.deleteMany({
			where: { contactId: { in: contactIds } },
		});
		await db.activity.deleteMany({
			where: { contactId: { in: contactIds } },
		});
		await db.dealContact.deleteMany({
			where: { contactId: { in: contactIds } },
		});
		await db.contact.deleteMany({
			where: { id: { in: contactIds } },
		});
	}

	const existingTestDeals = await db.deal.findMany({
		where: {
			OR: [
				{ name: { contains: "valves", mode: "insensitive" } },
				{ name: { contains: "JEE", mode: "insensitive" } },
				{ name: { contains: "security", mode: "insensitive" } },
				{ name: { contains: "Kubernetes", mode: "insensitive" } },
				{ name: { contains: "Fertigungsstraße", mode: "insensitive" } },
				{ name: { contains: "telematics", mode: "insensitive" } },
				{ name: { contains: "Fleet", mode: "insensitive" } },
				{ name: { contains: "Datacore", mode: "insensitive" } },
				{ name: { contains: "Weber", mode: "insensitive" } },
			],
		},
		select: { id: true },
	});
	const dealIds = existingTestDeals.map((d) => d.id);
	if (dealIds.length > 0) {
		await db.whatsAppMessage.deleteMany({
			where: { dealId: { in: dealIds } },
		});
		await db.contactFact.deleteMany({
			where: { dealId: { in: dealIds } },
		});
		await db.activity.deleteMany({
			where: { dealId: { in: dealIds } },
		});
		await db.dealContact.deleteMany({
			where: { dealId: { in: dealIds } },
		});
		await db.deal.deleteMany({
			where: { id: { in: dealIds } },
		});
	}

	await db.company.deleteMany({
		where: {
			name: {
				in: [
					"Apex IIT Academy",
					"Direct Customers",
					"Apex Flow Controls",
					"Datacore Cloud",
					"Weber Maschinenbau GmbH",
					"Apex Fleet Logistics",
				],
			},
		},
	});

	const agentTrigger = new AgentTriggerService(db);
	const intakeService = new IntakeService(db, agentTrigger);

	const fixtures = [
		{
			file: "valves-enquiry.txt",
			desc: "Valves Manufacturing Enquiry (India/B2B)",
			expectedLead: "Vikram",
		},
		{
			file: "coaching-institute.txt",
			desc: "Education Course Enquiry (India/SMB)",
			expectedLead: "Sunita",
		},
		{
			file: "saas-pipeline-us.txt",
			desc: "English B2B SaaS Enterprise Deal (US)",
			expectedLead: "Sarah",
		},
		{
			file: "manufacturing-de-whatsapp.txt",
			desc: "German Manufacturing Enquiry (EU/Germany)",
			expectedLead: "Heinrich",
		},
		{
			file: "call-recording-uk.txt",
			desc: "English Call-Recording Style Transcript (UK)",
			expectedLead: "Oliver",
		},
	];

	const results: Record<string, IngestResult> = {};

	for (let i = 0; i < fixtures.length; i++) {
		const fixture = fixtures[i]!;
		console.log(`\n==================================================`);
		console.log(`TEST ${i + 1}: Ingesting ${fixture.desc} (${fixture.file})`);
		console.log(`==================================================`);

		const filePath = resolve("fixtures", fixture.file);
		const fileBytes = readFileSync(filePath);

		const upload = await intakeService.uploadAndCreateJob(
			{
				originalname: fixture.file,
				buffer: fileBytes,
				mimetype: "text/plain",
				size: fileBytes.length,
			},
			{ autoStart: false },
		);

		console.log(`Job Created: ${upload.jobId} (Source: ${upload.sourceType})`);

		const preview = await intakeService.previewParticipants({
			jobId: upload.jobId,
		});
		console.log(`Participant Preview: autoDetected=${preview.autoDetected}, me="${preview.me}", lead="${preview.lead}", confidence=${preview.confidence}`);

		await intakeService.start({
			jobId: upload.jobId,
			me: preview.me,
		});

		const task = await findTaskForJob(upload.jobId);
		if (!task) {
			throw new Error(`No pending intake AgentTask found for Job ${upload.jobId}`);
		}

		console.log(`Executing AgentTask ${task.id} for Job ${upload.jobId}...`);
		const taskResult = await runAdkIntakeTask(task as any);
		console.log(`AgentTask Result: ${taskResult}`);

		const status = await intakeService.status(upload.jobId);
		console.log(`Timeline Steps: ${status.timeline.length}`);
		for (const step of status.timeline) {
			console.log(`  - [${step.tool}]: ${step.message}`);
		}

		const contactId =
			status.createdContactIds[0] ||
			(
				await db.contact.findFirst({
					where: { firstName: { contains: fixture.expectedLead } },
					select: { id: true },
				})
			)?.id;

		const dealId = status.createdDealIds[0];

		if (!contactId) {
			throw new Error(`No contact created for ${fixture.file}`);
		}

		const contact = await db.contact.findUnique({
			where: { id: contactId },
			include: { company: true },
		});
		const deal = dealId
			? await db.deal.findUnique({
					where: { id: dealId },
				})
			: null;
		const facts = await db.contactFact.findMany({
			where: {
				OR: [
					{ contactId },
					...(dealId ? [{ dealId }] : []),
				],
			},
			orderBy: { observedAt: "asc" },
		});
		const tasks = await db.activity.findMany({
			where: {
				OR: [
					{ contactId },
					...(dealId ? [{ dealId }] : []),
				],
				type: "TASK",
			},
		});

		const appliedCount = facts.filter((f) => f.status === "APPLIED").length;
		const proposedCount = facts.filter((f) => f.status === "PROPOSED").length;

		console.log(`\nCreated Records:`);
		console.log(`  Contact: ${contact?.firstName} ${contact?.lastName || ""} (${contact?.phone || "No phone"}) | Company: ${contact?.company?.name || "None"}`);
		console.log(`  Deal: "${deal?.name}" | Stage: ${deal?.stage} | Amount: ${deal?.amount} ${deal?.currency}`);
		console.log(`  Facts: ${facts.length} total (${appliedCount} APPLIED, ${proposedCount} PROPOSED)`);
		console.log(`  Tasks Created: ${tasks.length}`);
		for (const t of tasks) {
			console.log(`    * Task: "${t.subject}" | due: ${t.dueAt?.toISOString()}`);
		}

		results[fixture.file] = {
			jobId: upload.jobId,
			contactName: `${contact?.firstName} ${contact?.lastName || ""}`.trim(),
			phone: contact?.phone,
			companyName: contact?.company?.name,
			dealName: deal?.name,
			dealStage: deal?.stage,
			dealAmount: deal?.amount ? Number(deal.amount) : null,
			dealCurrency: deal?.currency,
			tasksCount: tasks.length,
			tasks: tasks.map((t) => ({ subject: t.subject, dueAt: t.dueAt?.toISOString() })),
			factsCount: facts.length,
			appliedFacts: appliedCount,
			proposedFacts: proposedCount,
		};
	}

	console.log("\n==================================================");
	await new Promise((r) => setTimeout(r, 4000));

	const saasFixtureBytes = readFileSync(resolve("fixtures/saas-pipeline-us.txt"));
	const messagesBefore = await db.whatsAppMessage.count();
	const contactsBefore = await db.contact.count({
		where: { firstName: { contains: "Sarah" } },
	});
	const tasksBefore = await db.activity.count({
		where: { type: "TASK" },
	});

	const uploadReimport = await intakeService.uploadAndCreateJob(
		{
			originalname: "saas-pipeline-us.txt",
			buffer: saasFixtureBytes,
			mimetype: "text/plain",
			size: saasFixtureBytes.length,
		},
		{ autoStart: false },
	);

	const previewReimport = await intakeService.previewParticipants({
		jobId: uploadReimport.jobId,
	});

	await intakeService.start({
		jobId: uploadReimport.jobId,
		me: previewReimport.me,
	});

	const taskReimport = await findTaskForJob(uploadReimport.jobId);
	if (taskReimport) {
		await runAdkIntakeTask(taskReimport as any);
	}

	const messagesAfter = await db.whatsAppMessage.count();
	const contactsAfter = await db.contact.count({
		where: { firstName: { contains: "Sarah" } },
	});
	const tasksAfter = await db.activity.count({
		where: { type: "TASK" },
	});

	console.log(`Re-import Diff:
  - Messages diff: ${messagesAfter - messagesBefore} (must be 0)
  - Contacts diff: ${contactsAfter - contactsBefore} (must be 0)
  - Tasks diff: ${tasksAfter - tasksBefore} (must be 0)`);

	if (messagesAfter !== messagesBefore || contactsAfter !== contactsBefore || tasksAfter !== tasksBefore) {
		throw new Error("Idempotency verification failed on re-import.");
	}

	console.log("\nIDEMPOTENCY VERIFIED: 0 duplicate messages, contacts, or tasks created.");
	console.log("\n=== ALL 5 FIXTURES AND IDEMPOTENCY VERIFIED ===");

	await db.$disconnect();
}

main().catch((err) => {
	console.error("Test failed with error:", err);
	process.exit(1);
});

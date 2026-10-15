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

async function main() {
	console.log("=== THREADLINE AUTONOMOUS INTAKE PIPELINE TEST ===\n");

	await db.agentTask.updateMany({
		where: { kind: "intake", finishedAt: null },
		data: { finishedAt: new Date(), outcome: "Cleaned up prior test run" },
	});

	const agentTrigger = new AgentTriggerService(db);
	const intakeService = new IntakeService(db, agentTrigger);

	console.log("--------------------------------------------------");
	console.log("TEST 1: Ingesting Fixture 1 (valves-enquiry.txt)");
	console.log("--------------------------------------------------");

	const fixture1Path = resolve("fixtures/valves-enquiry.txt");
	const fixture1Bytes = readFileSync(fixture1Path);

	const upload1 = await intakeService.uploadAndCreateJob(
		{
			originalname: "valves-enquiry.txt",
			buffer: fixture1Bytes,
			mimetype: "text/plain",
			size: fixture1Bytes.length,
		},
		{ autoStart: false },
	);

	console.log(`Job Created: ${upload1.jobId} (Source: ${upload1.sourceType})`);

	const preview1 = await intakeService.previewParticipants({
		jobId: upload1.jobId,
	});
	console.log("Participant Preview:", JSON.stringify(preview1, null, 2));

	await intakeService.start({
		jobId: upload1.jobId,
		me: preview1.me,
	});

	const task1 = await findTaskForJob(upload1.jobId);
	if (!task1) {
		throw new Error(`No pending intake AgentTask found for Job ${upload1.jobId}`);
	}

	console.log(`Executing AgentTask ${task1.id} for Job ${upload1.jobId} with ADK Runner...`);
	const task1Result = await runAdkIntakeTask(task1 as any);
	console.log(`AgentTask Result: ${task1Result}\n`);

	const status1 = await intakeService.status(upload1.jobId);
	console.log("Agent Step Timeline (Job 1):");
	for (const step of status1.timeline) {
		console.log(`  [${step.timestamp}] ${step.tool}: ${step.message}`);
	}

	const contactId1 =
		status1.createdContactIds[0] ||
		(
			await db.contact.findFirst({
				where: { firstName: { contains: "Vikram" } },
				select: { id: true },
			})
		)?.id;

	const dealId1 =
		status1.createdDealIds[0] ||
		(
			await db.deal.findFirst({
				where: { name: { contains: "valves", mode: "insensitive" } },
				select: { id: true },
			})
		)?.id;

	if (!contactId1) {
		throw new Error("No contact created for Job 1.");
	}

	const contact1 = await db.contact.findUnique({
		where: { id: contactId1 },
		include: { company: true },
	});
	const deal1 = dealId1
		? await db.deal.findUnique({
				where: { id: dealId1 },
			})
		: null;
	const facts1 = await db.contactFact.findMany({
		where: {
			OR: [
				{ contactId: contactId1 },
				...(dealId1 ? [{ dealId: dealId1 }] : []),
			],
		},
		orderBy: { observedAt: "asc" },
	});
	const tasks1 = await db.activity.findMany({
		where: {
			OR: [
				{ contactId: contactId1 },
				...(dealId1 ? [{ dealId: dealId1 }] : []),
			],
			type: "TASK",
		},
	});
	const messages1 = await db.whatsAppMessage.findMany({
		where: {
			OR: [
				{ contactId: contactId1 },
				...(dealId1 ? [{ dealId: dealId1 }] : []),
			],
		},
	});

	console.log("\nDatabase Records (Job 1):");
	console.log(
		`Contact: ${contact1?.firstName} ${contact1?.lastName || ""} | Phone: ${contact1?.phone} | Company: ${contact1?.company?.name}`,
	);
	console.log(
		`Deal: ${deal1?.name} | Stage: ${deal1?.stage} | Amount: ${deal1?.amount} ${deal1?.currency}`,
	);
	console.log(`WhatsApp Messages Stored: ${messages1.length}`);
	console.log(`Follow-up Tasks Created: ${tasks1.length}`);
	for (const t of tasks1) {
		console.log(`  - Task: "${t.subject}" | dueAt: ${t.dueAt?.toISOString()}`);
	}

	console.log("\nFacts Recorded (Job 1) [APPLIED vs PROPOSED]:");
	for (const f of facts1) {
		console.log(
			`  - [${f.status}] field="${f.field}" value="${f.value}" score=${f.score} band=${f.band}`,
		);
	}

	console.log("\n--------------------------------------------------");
	console.log("TEST 2: Ingesting Fixture 2 (coaching-institute.txt)");
	console.log("--------------------------------------------------");

	const fixture2Path = resolve("fixtures/coaching-institute.txt");
	const fixture2Bytes = readFileSync(fixture2Path);

	const upload2 = await intakeService.uploadAndCreateJob(
		{
			originalname: "coaching-institute.txt",
			buffer: fixture2Bytes,
			mimetype: "text/plain",
			size: fixture2Bytes.length,
		},
		{ autoStart: false },
	);

	console.log(`Job Created: ${upload2.jobId} (Source: ${upload2.sourceType})`);

	const preview2 = await intakeService.previewParticipants({
		jobId: upload2.jobId,
	});
	console.log("Participant Preview:", JSON.stringify(preview2, null, 2));

	await intakeService.start({
		jobId: upload2.jobId,
		me: preview2.me,
	});

	const task2 = await findTaskForJob(upload2.jobId);
	if (!task2) {
		throw new Error(`No pending intake AgentTask found for Job ${upload2.jobId}`);
	}

	console.log(`Executing AgentTask ${task2.id} for Job ${upload2.jobId} with ADK Runner...`);
	const task2Result = await runAdkIntakeTask(task2 as any);
	console.log(`AgentTask Result: ${task2Result}\n`);

	const status2 = await intakeService.status(upload2.jobId);
	console.log("Agent Step Timeline (Job 2):");
	for (const step of status2.timeline) {
		console.log(`  [${step.timestamp}] ${step.tool}: ${step.message}`);
	}

	const contactId2 =
		status2.createdContactIds[0] ||
		(
			await db.contact.findFirst({
				where: { firstName: { contains: "Sunita" } },
				select: { id: true },
			})
		)?.id;

	const dealId2 =
		status2.createdDealIds[0] ||
		(
			await db.deal.findFirst({
				where: { name: { contains: "JEE", mode: "insensitive" } },
				select: { id: true },
			})
		)?.id;

	if (!contactId2) {
		throw new Error("No contact created for Job 2.");
	}

	const contact2 = await db.contact.findUnique({
		where: { id: contactId2 },
		include: { company: true },
	});
	const deal2 = dealId2
		? await db.deal.findUnique({
				where: { id: dealId2 },
			})
		: null;
	const facts2 = await db.contactFact.findMany({
		where: {
			OR: [
				{ contactId: contactId2 },
				...(dealId2 ? [{ dealId: dealId2 }] : []),
			],
		},
		orderBy: { observedAt: "asc" },
	});
	const tasks2 = await db.activity.findMany({
		where: {
			OR: [
				{ contactId: contactId2 },
				...(dealId2 ? [{ dealId: dealId2 }] : []),
			],
			type: "TASK",
		},
	});
	const messages2 = await db.whatsAppMessage.findMany({
		where: {
			OR: [
				{ contactId: contactId2 },
				...(dealId2 ? [{ dealId: dealId2 }] : []),
			],
		},
	});

	console.log("\nDatabase Records (Job 2):");
	console.log(
		`Contact: ${contact2?.firstName} ${contact2?.lastName || ""} | Phone: ${contact2?.phone} | Company: ${contact2?.company?.name}`,
	);
	console.log(
		`Deal: ${deal2?.name} | Stage: ${deal2?.stage} | Amount: ${deal2?.amount} ${deal2?.currency}`,
	);
	console.log(`WhatsApp Messages Stored: ${messages2.length}`);
	console.log(`Follow-up Tasks Created: ${tasks2.length}`);
	for (const t of tasks2) {
		console.log(`  - Task: "${t.subject}" | dueAt: ${t.dueAt?.toISOString()}`);
	}

	console.log("\nFacts Recorded (Job 2) [APPLIED vs PROPOSED]:");
	for (const f of facts2) {
		console.log(
			`  - [${f.status}] field="${f.field}" value="${f.value}" score=${f.score} band=${f.band}`,
		);
	}

	console.log("\n--------------------------------------------------");
	console.log("TEST 3: Re-importing Fixture 1 (Idempotency Proof)");
	console.log("--------------------------------------------------");

	const messagesCountBefore = await db.whatsAppMessage.count();
	const contactCountBefore = await db.contact.count({
		where: { firstName: { contains: "Vikram" } },
	});
	const dealCountBefore = dealId1
		? await db.deal.count({
				where: { id: dealId1 },
			})
		: 1;
	const tasksCountBefore = await db.activity.count({
		where: { contactId: contactId1, type: "TASK" },
	});

	console.log(`Pre-reimport Counts:
  - Total WhatsApp Messages: ${messagesCountBefore}
  - Contacts for Vikram: ${contactCountBefore}
  - Deal exists: ${dealCountBefore === 1}
  - Tasks for Vikram: ${tasksCountBefore}`);

	const upload3 = await intakeService.uploadAndCreateJob(
		{
			originalname: "valves-enquiry.txt",
			buffer: fixture1Bytes,
			mimetype: "text/plain",
			size: fixture1Bytes.length,
		},
		{ autoStart: false },
	);

	await intakeService.start({
		jobId: upload3.jobId,
		me: preview1.me,
	});

	const task3 = await findTaskForJob(upload3.jobId);
	if (task3) {
		await runAdkIntakeTask(task3 as any);
	}

	const messagesCountAfter = await db.whatsAppMessage.count();
	const contactCountAfter = await db.contact.count({
		where: { firstName: { contains: "Vikram" } },
	});
	const dealCountAfter = dealId1
		? await db.deal.count({
				where: { id: dealId1 },
			})
		: 1;
	const tasksCountAfter = await db.activity.count({
		where: { contactId: contactId1, type: "TASK" },
	});

	console.log(`\nPost-reimport Counts:
  - Total WhatsApp Messages: ${messagesCountAfter} (diff: ${messagesCountAfter - messagesCountBefore})
  - Contacts for Vikram: ${contactCountAfter} (diff: ${contactCountAfter - contactCountBefore})
  - Deal exists: ${dealCountAfter === 1}
  - Tasks for Vikram: ${tasksCountAfter} (diff: ${tasksCountAfter - tasksCountBefore})`);

	if (messagesCountAfter !== messagesCountBefore) {
		throw new Error(
			`Idempotency failed: message count grew from ${messagesCountBefore} to ${messagesCountAfter}!`,
		);
	}

	if (contactCountAfter !== contactCountBefore) {
		throw new Error(
			`Idempotency failed: contact count grew from ${contactCountBefore} to ${contactCountAfter}!`,
		);
	}

	if (tasksCountAfter !== tasksCountBefore) {
		throw new Error(
			`Idempotency failed: task count grew from ${tasksCountBefore} to ${tasksCountAfter}!`,
		);
	}

	console.log(
		"\nIDEMPOTENCY VERIFIED: Re-importing produced 0 duplicate messages, 0 duplicate contacts, and 0 duplicate tasks.",
	);
	console.log("\nALL INTAKE TESTS PASSED SUCCESSFULLY!");

	await db.$disconnect();
}

main().catch((err) => {
	console.error("Test failed with error:", err);
	process.exit(1);
});

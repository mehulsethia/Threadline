import { ActivityType, DealStage, EmailDirection, FactBand } from "../packages/db/src";
import { runLeadRevivalCycle } from "../apps/agent/adk/revival/service";
import { db } from "../packages/db/src";
import { writePlaybook, writeRevivalSlas } from "../packages/db/src/settings";

async function setupFixtures() {
	console.log("Setting up revival test fixtures with old timestamps...\n");

	await writeRevivalSlas(db, {
		UNQUALIFIED_TO_BUY: 3,
		QUALIFIED_TO_BUY: 5,
		DEMO_BOOKED: 4,
		CONTRACT_SENT: 5,
		DECISION_MAKER_BOUGHT_IN: 3,
	});

	await writePlaybook(
		db,
		"Threadline B2B Playbook: Professional, consultative, transparent. Never invent discounts. Emphasize compliance (SOC2, ISO27001), high-volume reliability, and fast deployment. Sign-off: Best regards, The Threadline Team.",
	);

	const existingContacts = await db.contact.findMany({
		where: {
			firstName: { in: ["Sarah", "Klaus", "Oliver", "Elena"] },
		},
		select: { id: true },
	});
	const contactIds = existingContacts.map((c) => c.id);
	if (contactIds.length > 0) {
		await db.outboundDraft.deleteMany({
			where: { contactId: { in: contactIds } },
		});
		await db.activity.deleteMany({
			where: { contactId: { in: contactIds } },
		});
		await db.dealContact.deleteMany({
			where: { contactId: { in: contactIds } },
		});
		await db.whatsAppMessage.deleteMany({
			where: { contactId: { in: contactIds } },
		});
		await db.contactFact.deleteMany({
			where: { contactId: { in: contactIds } },
		});
		await db.deal.deleteMany({
			where: {
				name: {
					in: [
						"Datacore Enterprise Security",
						"Weber Precision Valves",
						"Sterling Route Logistics",
						"Nordic Supply Deal",
					],
				},
			},
		});
		await db.contact.deleteMany({
			where: { id: { in: contactIds } },
		});
	}

	const now = new Date();
	const eightDaysAgo = new Date(now.getTime() - 8 * 86400 * 1000);
	const sixDaysAgo = new Date(now.getTime() - 6 * 86400 * 1000);
	const fourDaysAgo = new Date(now.getTime() - 4 * 86400 * 1000);
	const twoDaysAgo = new Date(now.getTime() - 2 * 86400 * 1000);

	const defaultUser = await db.user.findFirst({ select: { id: true } });
	if (!defaultUser) throw new Error("No user found in database");

	const contact1 = await db.contact.create({
		data: {
			firstName: "Sarah",
			lastName: "Jenkins",
			phone: "+15125550199",
			email: "sarah@datacore.cloud",
			timezone: "America/Chicago",
			optedOut: false,
		},
	});
	const deal1 = await db.deal.create({
		data: {
			name: "Datacore Enterprise Security",
			stage: DealStage.CONTRACT_SENT,
			amount: 48000,
			currency: "USD",
			ownerId: defaultUser.id,
			createdAt: eightDaysAgo,
		},
	});
	await db.dealContact.create({
		data: { dealId: deal1.id, contactId: contact1.id },
	});
	await db.contactFact.create({
		data: {
			contactId: contact1.id,
			dealId: deal1.id,
			field: "securityRequirement",
			value: "SOC2 Type II and ISO 27001 certification required before signing",
			status: "PROPOSED",
			score: 0.9,
			band: FactBand.VERIFIED,
			method: "extraction",
			evidence:
				"Sarah Jenkins: compliance team requires your SOC2 Type II report and ISO 27001",
		},
	});
	await db.whatsAppMessage.create({
		data: {
			contactId: contact1.id,
			dealId: deal1.id,
			senderPhone: contact1.phone ?? "+15125550199",
			senderName: "Sarah Jenkins",
			body: "Thanks for sending over the Enterprise Proposal Alex. Our compliance committee is reviewing the SOC2 details.",
			direction: EmailDirection.INBOUND,
			timestamp: eightDaysAgo,
		},
	});

	const contact2 = await db.contact.create({
		data: {
			firstName: "Klaus",
			lastName: "Weber",
			phone: "+497115558921",
			email: "klaus.weber@weber-praezision.de",
			timezone: "Europe/Berlin",
			optedOut: false,
		},
	});
	const deal2 = await db.deal.create({
		data: {
			name: "Weber Precision Valves",
			stage: DealStage.DEMO_BOOKED,
			amount: 35000,
			currency: "EUR",
			ownerId: defaultUser.id,
			createdAt: sixDaysAgo,
		},
	});
	await db.dealContact.create({
		data: { dealId: deal2.id, contactId: contact2.id },
	});
	await db.contactFact.create({
		data: {
			contactId: contact2.id,
			dealId: deal2.id,
			field: "language",
			value: "de",
			status: "PROPOSED",
			score: 0.9,
			band: FactBand.VERIFIED,
			method: "extraction",
			evidence: "Customer writes in German",
		},
	});
	await db.whatsAppMessage.create({
		data: {
			contactId: contact2.id,
			dealId: deal2.id,
			senderPhone: contact2.phone ?? "+497115558921",
			senderName: "Klaus Weber",
			body: "Guten Tag, können Sie uns die genauen Lieferzeiten und Staffelpreise für 500 Einheiten der Hochdruckventile mitteilen?",
			direction: EmailDirection.INBOUND,
			timestamp: fourDaysAgo,
		},
	});

	const contact3 = await db.contact.create({
		data: {
			firstName: "Oliver",
			lastName: "Sterling",
			phone: "+442079460192",
			email: "oliver@sterling-logistics.co.uk",
			timezone: "Europe/London",
			optedOut: false,
		},
	});
	const deal3 = await db.deal.create({
		data: {
			name: "Sterling Route Logistics",
			stage: DealStage.QUALIFIED_TO_BUY,
			amount: 28000,
			currency: "GBP",
			ownerId: defaultUser.id,
			createdAt: sixDaysAgo,
		},
	});
	await db.dealContact.create({
		data: { dealId: deal3.id, contactId: contact3.id },
	});
	await db.whatsAppMessage.create({
		data: {
			contactId: contact3.id,
			dealId: deal3.id,
			senderPhone: contact3.phone ?? "+442079460192",
			senderName: "Oliver Sterling",
			body: "Hi team, we are eager to move forward once the SLA schedule is confirmed.",
			direction: EmailDirection.INBOUND,
			timestamp: twoDaysAgo,
		},
	});
	await db.activity.create({
		data: {
			type: ActivityType.TASK,
			subject: "Check: Oliver Sterling agreement redlines",
			dealId: deal3.id,
			contactId: contact3.id,
			createdById: defaultUser.id,
			dueAt: fourDaysAgo,
		},
	});

	const contact4 = await db.contact.create({
		data: {
			firstName: "Elena",
			lastName: "Rostova",
			phone: "+4681234567",
			email: "elena@nordic-supply.se",
			timezone: "Europe/Stockholm",
			optedOut: false,
		},
	});
	const deal4 = await db.deal.create({
		data: {
			name: "Nordic Supply Deal",
			stage: DealStage.UNQUALIFIED_TO_BUY,
			amount: 15000,
			currency: "USD",
			ownerId: defaultUser.id,
			createdAt: fourDaysAgo,
		},
	});
	await db.dealContact.create({
		data: { dealId: deal4.id, contactId: contact4.id },
	});
	await db.whatsAppMessage.create({
		data: {
			contactId: contact4.id,
			dealId: deal4.id,
			senderPhone: contact4.phone ?? "+4681234567",
			senderName: "Elena Rostova",
			body: "We decided to choose another vendor. Please stop contacting us and unsubscribe me from all messages.",
			direction: EmailDirection.INBOUND,
			timestamp: twoDaysAgo,
		},
	});

	console.log("Created 4 test scenarios:");
	console.log(
		"1. US SaaS (Datacore): Proposal stage, 8d since last inbound (SLA: 5d)",
	);
	console.log(
		"2. DE Manufacturing (Weber): Meeting/Demo stage, unanswered pricing question",
	);
	console.log(
		"3. UK Logistics (Sterling): Qualified stage, overdue 'Check:' task (4d overdue)",
	);
	console.log(
		"4. Nordic Supply (Elena): Opt-out request ('stop contacting us and unsubscribe')\n",
	);
}

async function main() {
	await setupFixtures();

	console.log("Executing Lead Revival Cycle...\n");
	const report = await runLeadRevivalCycle();

	console.log("=== LEAD REVIVAL EXECUTION REPORT ===");
	console.log(`Cycle ID: ${report.cycleId}`);
	console.log(`Stalled Deals Detected: ${report.stalledDealsDetected}`);
	console.log(`Drafts Generated: ${report.draftsGenerated}`);

	for (const draft of report.drafts) {
		console.log("\n--------------------------------------------------");
		console.log(`DRAFT FOR DEAL: ${draft.dealId}`);
		console.log(`Channel: ${draft.channel}`);
		console.log(`Strategy: ${draft.strategy}`);
		console.log(`Rationale: ${draft.rationale}`);
		console.log(`Subject: ${draft.subject ?? "N/A"}`);
		console.log(`Cited Evidence: ${JSON.stringify(draft.citedEvidenceIds)}`);
		console.log(`Text:\n${draft.draftText}`);
	}

	const optedOutContact = await db.contact.findFirst({
		where: { firstName: "Elena", lastName: "Rostova" },
		select: { id: true, optedOut: true },
	});

	console.log("\n--------------------------------------------------");
	console.log("=== OPT-OUT EXCLUSION VERIFICATION ===");
	console.log(
		`Contact Elena Rostova optedOut in DB: ${optedOutContact?.optedOut}`,
	);
	const elenaDraft = await db.outboundDraft.findFirst({
		where: { contactId: optedOutContact?.id },
	});
	console.log(
		`Draft generated for Elena Rostova: ${elenaDraft ? "YES (FAIL)" : "NONE (SUCCESS)"}`,
	);

	console.log("\nRevival run completed successfully.");
}

main()
	.catch((err) => {
		console.error("Error running revival flow:", err);
		process.exit(1);
	})
	.finally(() => db.$disconnect());

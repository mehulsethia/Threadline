import { ActivityType, DealStage, EmailDirection, FactBand } from "../packages/db/src";
import { runLeadRevivalCycle } from "../apps/agent/adk/revival/service";
import { db } from "../packages/db/src";
import { writePlaybook, writeRevivalSlas } from "../packages/db/src/settings";

async function setupFixtures() {
	console.log("Setting up revival test fixtures with stalled timestamps...\n");

	await writeRevivalSlas(db, {
		UNQUALIFIED_TO_BUY: 3,
		QUALIFIED_TO_BUY: 5,
		DEMO_BOOKED: 4,
		CONTRACT_SENT: 5,
		DECISION_MAKER_BOUGHT_IN: 3,
	});

	await writePlaybook(
		db,
		"Global B2B Sales Playbook: Professional, consultative, transparent. Never invent discounts, timelines, or unconfirmed meetings. Address compliance (SOC2, ISO 27001) only when grounded in evidence. Sign-off as the owning representative with your company name.",
	);

	await db.outboundDraft.deleteMany({});

	const seededDeals = await db.deal.findMany({
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
		select: { id: true, contacts: { select: { contactId: true } } },
	});
	const seededDealIds = seededDeals.map((d) => d.id);
	const seededContactIds = seededDeals.flatMap((d) =>
		d.contacts.map((c) => c.contactId),
	);

	const elena = await db.contact.findFirst({
		where: { firstName: "Elena", lastName: "Rostova" },
		select: { id: true },
	});
	if (elena) seededContactIds.push(elena.id);

	if (seededDealIds.length > 0) {
		await db.activity.deleteMany({
			where: { dealId: { in: seededDealIds } },
		});
		await db.whatsAppMessage.deleteMany({
			where: { dealId: { in: seededDealIds } },
		});
		await db.contactFact.deleteMany({
			where: { dealId: { in: seededDealIds } },
		});
		await db.dealContact.deleteMany({
			where: { dealId: { in: seededDealIds } },
		});
		await db.deal.deleteMany({
			where: { id: { in: seededDealIds } },
		});
	}
	if (seededContactIds.length > 0) {
		await db.contact.deleteMany({
			where: { id: { in: seededContactIds } },
		});
	}

	const now = new Date();
	const eightDaysAgo = new Date(now.getTime() - 8 * 86400 * 1000);
	const sixDaysAgo = new Date(now.getTime() - 6 * 86400 * 1000);
	const fourDaysAgo = new Date(now.getTime() - 4 * 86400 * 1000);
	const twoDaysAgo = new Date(now.getTime() - 2 * 86400 * 1000);

	const defaultUser = await db.user.findFirst({ select: { id: true, name: true } });
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
			score: 0.95,
			band: FactBand.VERIFIED,
			method: "extraction",
			evidence: "Buyer states SOC2 Type II and ISO 27001 required before signing proposal",
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
			email: "klaus.weber@weber-fertigung.de",
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

	const fixtureDeals = await db.deal.findMany({
		where: {
			name: {
				in: [
					"SS316 Industrial Ball Valves (Class 150) - 2 inch and 3 inch",
					"Industrial ball valves (2 inch and 3 inch SS316 Class 150) for chemical plant project",
					"Class 11 & 12 JEE (Advanced) Two-Year Classroom Coaching Program",
					"JEE Advanced 2027 2-year classroom coaching program",
					"industrielle Durchflusssensoren und Druckventile für unsere automatisierte Fertigungsstraße",
					"Enterprise Security Monitoring Software for Kubernetes Clusters",
					"Enterprise security monitoring software for Kubernetes clusters",
					"Upgrade telematics and dispatch management system",
				],
			},
		},
		select: { id: true, name: true },
	});

	for (const d of fixtureDeals) {
		await db.deal.update({
			where: { id: d.id },
			data: { createdAt: eightDaysAgo },
		});
		await db.whatsAppMessage.updateMany({
			where: { dealId: d.id },
			data: { timestamp: sixDaysAgo },
		});
	}

	console.log("Test scenarios initialized:");
	console.log("1. US SaaS (Sarah Jenkins): Contract sent, 8d since inbound (SLA: 5d)");
	console.log("2. DE Manufacturing (Klaus Weber): Meeting/Demo stage, unanswered question");
	console.log("3. UK Logistics (Oliver Sterling): Qualified stage, overdue Check task (4d)");
	console.log("4. Nordic Supply (Elena Rostova): Opt-out request ('stop contacting us and unsubscribe')");
	console.log(`5. Imported Fixture Deals: ${fixtureDeals.length} deals aged past SLA\n`);
}

async function main() {
	await setupFixtures();

	console.log("Executing Lead Revival Cycle...\n");
	const report = await runLeadRevivalCycle();

	console.log("=== LEAD REVIVAL EXECUTION REPORT ===");
	console.log(`Cycle ID: ${report.cycleId}`);
	console.log(`Stalled Deals Detected: ${report.stalledDealsDetected}`);
	console.log(`Drafts Generated: ${report.draftsGenerated}`);

	let index = 1;
	for (const draft of report.drafts) {
		const deal = await db.deal.findUnique({
			where: { id: draft.dealId },
			select: { name: true, stage: true, owner: { select: { name: true } } },
		});
		const contact = await db.contact.findUnique({
			where: { id: draft.contactId },
			select: { firstName: true, lastName: true, company: { select: { name: true } } },
		});

		console.log("\n--------------------------------------------------");
		console.log(`DRAFT #${index}: ${contact?.firstName} ${contact?.lastName || ""} (${deal?.name})`);
		console.log(`Company: ${contact?.company?.name || "None"} | Stage: ${deal?.stage} | Owning Rep: ${deal?.owner?.name || "Alex Morgan"}`);
		console.log(`Channel: ${draft.channel}`);
		console.log(`Strategy: ${draft.strategy}`);
		console.log(`Rationale: ${draft.rationale}`);
		console.log(`Subject: ${draft.subject ?? "N/A"}`);
		console.log(`Cited Evidence: ${JSON.stringify(draft.citedEvidence)}`);
		console.log(`Draft Text:\n${draft.draftText}`);
		index++;
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

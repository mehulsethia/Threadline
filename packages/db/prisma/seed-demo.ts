import { db, rootDb } from "../src/client";
import { Prisma } from "../src/generated/prisma/client";
import {
	ActivityType,
	DealStage,
	EmailDirection,
	FactBand,
	FactStatus,
	OutboundDraftStatus,
} from "../src/generated/prisma/enums";
import { SETTINGS_ID, writePlaybook, writeRevivalSlas } from "../src/settings";
import { formatDealStage } from "../src/stage";
import { isSingleSchema, runInWorkspace } from "../src/tenancy";
import { provisionWorkspaceSchema } from "../src/workspaces";
import {
	DEMO_ORG_ID,
	DEMO_ORG_NAME,
	DEMO_ORG_SLUG,
	DEMO_REP_EMAIL,
	DEMO_REP_ID,
	DEMO_REP_NAME,
	DEMO_USER_EMAIL,
	DEMO_USER_ID,
	resetDemoOrg,
} from "./reset-demo";
import { seedAgentWork } from "./seed-demo-agents";

const NOW = Date.now();
const DAY_MS = 24 * 60 * 60 * 1000;

function daysAgo(days: number): Date {
	return new Date(NOW - days * DAY_MS);
}

const SIGNATURE = `${DEMO_REP_NAME}\n${DEMO_ORG_NAME}`;

async function upsertDemoUser(id: string, name: string, email: string) {
	const user = await rootDb.user.upsert({
		where: { id },
		create: {
			id,
			name,
			email,
			emailVerified: true,
			createdAt: daysAgo(30),
			updatedAt: daysAgo(1),
		},
		update: { name, email },
	});
	await rootDb.member.upsert({
		where: {
			organizationId_userId: { organizationId: DEMO_ORG_ID, userId: id },
		},
		create: {
			id: `member-${id}`,
			organizationId: DEMO_ORG_ID,
			userId: id,
			role: "member",
			createdAt: daysAgo(30),
		},
		update: {},
	});
	return user;
}

export async function seedDemoOrg(): Promise<void> {
	if (!isSingleSchema()) await provisionWorkspaceSchema(DEMO_ORG_ID);
	await runInWorkspace(DEMO_ORG_ID, async () => {
		await seedDemoWorkspace();
	});
}

async function seedDemoWorkspace(): Promise<void> {
	await resetDemoOrg();

	console.log(
		`\nSeeding ${DEMO_ORG_NAME} demo workspace (${DEMO_ORG_SLUG})...`,
	);

	const onboarded = JSON.stringify({ onboardedAt: daysAgo(30).toISOString() });
	await rootDb.organization.upsert({
		where: { id: DEMO_ORG_ID },
		create: {
			id: DEMO_ORG_ID,
			name: DEMO_ORG_NAME,
			slug: DEMO_ORG_SLUG,
			createdAt: daysAgo(30),
			website: "https://northwind.example",
			metadata: onboarded,
		},
		update: {
			name: DEMO_ORG_NAME,
			slug: DEMO_ORG_SLUG,
			website: "https://northwind.example",
		},
	});

	const user = await upsertDemoUser(
		DEMO_USER_ID,
		DEMO_REP_NAME,
		DEMO_USER_EMAIL,
	);
	await upsertDemoUser(DEMO_REP_ID, "Sam Rivera", DEMO_REP_EMAIL);

	// The legacy Context.dev research step is replaced by Gemini grounded
	// search; mark it skipped (never overwriting a real key) so the app does
	// not send the judge through that onboarding step.
	const settings = await db.appSetting.findUnique({
		where: { id: SETTINGS_ID },
		select: { contextDevApiKey: true },
	});
	if (!settings?.contextDevApiKey) {
		await db.appSetting.upsert({
			where: { id: SETTINGS_ID },
			create: { id: SETTINGS_ID, contextDevApiKey: "skipped" },
			update: { contextDevApiKey: "skipped" },
		});
	}

	await writeRevivalSlas(db, {
		UNQUALIFIED_TO_BUY: 3,
		QUALIFIED_TO_BUY: 5,
		DEMO_BOOKED: 4,
		CONTRACT_SENT: 5,
		DECISION_MAKER_BOUGHT_IN: 3,
	});

	await writePlaybook(
		db,
		"Global B2B Sales Playbook: Professional, consultative, transparent. Never invent discounts, timelines, or unconfirmed meetings. Address compliance (SOC2, ISO 27001, GDPR) only when grounded in evidence. Sign-off as the owning representative with your company name Northwind Systems.",
	);

	const dealsData = [
		{
			id: "demo-deal-1-acme",
			name: "Acme Cloud Infrastructure",
			stage: DealStage.QUALIFIED_TO_BUY,
			amount: 180000,
			currency: "USD",
			country: "United States",
			city: "San Francisco",
			countryCode: "US",
			companyName: "Acme Cloud Inc",
			domain: "acmecloud.example",
			contactFirst: "David",
			contactLast: "Miller",
			contactPhone: "+1 415 555 0192",
			contactEmail: "david.miller@acmecloud.example",
			timezone: "America/Los_Angeles",
			language: "en",
			optedOut: false,
			messages: [
				{
					direction: EmailDirection.INBOUND,
					daysAgo: 4,
					body: "Hi Northwind team, we are scaling our enterprise telemetry pipeline and need a platform that supports SOC2 and high throughput. Our board approved the $180k budget for Q4 rollout.",
				},
				{
					direction: EmailDirection.OUTBOUND,
					daysAgo: 3,
					body: "Thanks David, we specialize in high-throughput enterprise infrastructure with SOC2 compliance. Let's review the technical specification.",
				},
			],
			facts: [
				{
					field: "qualification.need",
					value: "Scaling enterprise telemetry pipeline with SOC2",
					quote:
						"we are scaling our enterprise telemetry pipeline and need a platform that supports SOC2 and high throughput.",
				},
				{
					field: "qualification.budget",
					value: "$180,000 approved for Q4 rollout",
					quote: "Our board approved the $180k budget for Q4 rollout.",
				},
				{
					field: "language",
					value: "en",
					quote: "Hi Northwind team",
				},
			],
			task: {
				subject: "Send technical architecture whitepaper",
				dueDaysAgo: 2,
			},
		},
		{
			id: "demo-deal-2-fintech",
			name: "FinTech Scale Corp",
			stage: DealStage.DEMO_BOOKED,
			amount: 250000,
			currency: "USD",
			country: "United States",
			city: "New York",
			countryCode: "US",
			companyName: "FinTech Scale Corp",
			domain: "fintechscale.example",
			contactFirst: "Sarah",
			contactLast: "Jenkins",
			contactPhone: "+1 212 555 8391",
			contactEmail: "s.jenkins@fintechscale.example",
			timezone: "America/New_York",
			language: "en",
			optedOut: false,
			messages: [
				{
					direction: EmailDirection.INBOUND,
					daysAgo: 2,
					body: "We have finalized our discovery and want to book the executive demo for our leadership team this Thursday at 2 PM EST.",
				},
				{
					direction: EmailDirection.OUTBOUND,
					daysAgo: 1,
					body: "Confirmed for Thursday 2 PM EST. Sending calendar invite.",
				},
			],
			facts: [
				{
					field: "meeting.demo",
					value: "Demo booked for Thursday 2 PM EST",
					quote:
						"book the executive demo for our leadership team this Thursday at 2 PM EST.",
				},
				{
					field: "qualification.timeline",
					value: "Executive review this Thursday",
					quote:
						"executive demo for our leadership team this Thursday at 2 PM EST",
				},
			],
			task: {
				subject: "Prepare executive slide deck for Thursday demo",
				dueDaysAgo: -1,
			},
		},
		{
			id: "demo-deal-3-kestrel",
			name: "Kestrel Payments Ltd",
			stage: DealStage.CONTRACT_SENT,
			amount: 95000,
			currency: "GBP",
			country: "United Kingdom",
			city: "London",
			countryCode: "GB",
			companyName: "Kestrel Payments Ltd",
			domain: "kestrelpayments.example",
			contactFirst: "Alistair",
			contactLast: "Hughes",
			contactPhone: "+44 20 7946 0912",
			contactEmail: "a.hughes@kestrelpayments.example",
			timezone: "Europe/London",
			language: "en",
			optedOut: false,
			messages: [
				{
					direction: EmailDirection.OUTBOUND,
					daysAgo: 7,
					body: "Hi Alistair, please find our enterprise proposal attached with the annual SLA schedule at £95k.",
				},
				{
					direction: EmailDirection.INBOUND,
					daysAgo: 6,
					body: "Thanks. Could you clarify if multi-region data failover is included in the £95k annual tier or billed separately?",
				},
			],
			facts: [
				{
					field: "proposal.quote",
					value: "Enterprise proposal sent at £95,000 annual",
					quote: "enterprise proposal attached with the annual SLA schedule",
				},
				{
					field: "pricing.question",
					value: "Multi-region failover inclusion inquiry",
					quote:
						"Could you clarify if multi-region data failover is included in the £95k annual tier",
				},
			],
			stalled: {
				reason:
					"Unanswered pricing question from the lead (Proposal stage, SLA 5 days)",
				strategy: "answer_or_route",
				draftText: `Subject: Multi-region failover in the £95k annual tier\n\nHello Alistair,\n\nThank you for your question on whether multi-region data failover is included in the £95k annual tier or billed separately. I am confirming the exact answer with our solutions team and will come back to you in writing, so the agreement schedule reflects it correctly.\n\nWould a short call this week help to walk through the SLA schedule together?\n\nBest regards,\n${SIGNATURE}`,
			},
		},
		{
			id: "demo-deal-4-cambridge",
			name: "Cambridge AI Diagnostics",
			stage: DealStage.DECISION_MAKER_BOUGHT_IN,
			amount: 140000,
			currency: "GBP",
			country: "United Kingdom",
			city: "Cambridge",
			countryCode: "GB",
			companyName: "Cambridge AI Diagnostics",
			domain: "cambridge-ai.example",
			contactFirst: "Fiona",
			contactLast: "Gallagher",
			contactPhone: "+44 1223 555 019",
			contactEmail: "fiona@cambridge-ai.example",
			timezone: "Europe/London",
			language: "en",
			optedOut: false,
			messages: [
				{
					direction: EmailDirection.INBOUND,
					daysAgo: 1,
					body: "Our steering committee approved the selection of Northwind. We are forwarding the agreement to our legal team for standard redlines.",
				},
			],
			facts: [
				{
					field: "decision.bought_in",
					value: "Steering committee approved selection",
					quote: "Our steering committee approved the selection of Northwind.",
				},
			],
			task: {
				subject: "Review legal redlines on Cambridge AI agreement",
				dueDaysAgo: 0,
			},
		},
		{
			id: "demo-deal-5-klaus",
			name: "Klaus & Weber Industrietechnik",
			stage: DealStage.UNQUALIFIED_TO_BUY,
			amount: 160000,
			currency: "EUR",
			country: "Germany",
			city: "Munich",
			countryCode: "DE",
			companyName: "Klaus & Weber Industrietechnik GmbH",
			domain: "klausweber-industrie.example",
			contactFirst: "Klaus",
			contactLast: "Weber",
			contactPhone: "+49 89 2441 5501",
			contactEmail: "k.weber@klausweber-industrie.example",
			timezone: "Europe/Berlin",
			language: "de",
			optedOut: false,
			messages: [
				{
					direction: EmailDirection.INBOUND,
					daysAgo: 5,
					body: "Guten Tag, können Sie uns die Konditionen für 500 Einheiten und die Zertifizierungen nach ISO 27001 mitteilen?",
				},
				{
					direction: EmailDirection.OUTBOUND,
					daysAgo: 4,
					body: "Guten Tag Herr Weber, vielen Dank für Ihre Anfrage. Wir prüfen die Spezifikationen und melden uns kurzfristig.",
				},
			],
			facts: [
				{
					field: "language",
					value: "de",
					quote: "Guten Tag, können Sie uns die Konditionen mitteilen",
				},
				{
					field: "qualification.need",
					value: "Konditionen für 500 Einheiten und ISO 27001",
					quote:
						"können Sie uns die Konditionen für 500 Einheiten und die Zertifizierungen nach ISO 27001 mitteilen?",
				},
			],
			stalled: {
				reason: "No reply for 4 days in the Lead stage (SLA 3 days)",
				strategy: "confirm_next_step",
				draftText:
					"Betreff: Spezifikationen und nächste Schritte\n\nGuten Tag Herr Weber,\n\nich wollte kurz nachfragen, ob Sie Zeit für ein kurzes Telefonat zu den Konditionen und unseren Zertifizierungen haben.\n\nMit freundlichen Grüßen,\nAlex Morgan\nNorthwind Systems",
			},
		},
		{
			id: "demo-deal-6-vossberg",
			name: "Vossberg Mobility AG",
			stage: DealStage.CLOSED_WON,
			amount: 320000,
			currency: "EUR",
			country: "Germany",
			city: "Munich",
			countryCode: "DE",
			companyName: "Vossberg Mobility AG",
			domain: "vossberg-mobility.example",
			contactFirst: "Stefan",
			contactLast: "Meier",
			contactPhone: "+49 30 8392 4110",
			contactEmail: "stefan.meier@vossberg-mobility.example",
			timezone: "Europe/Berlin",
			language: "de",
			optedOut: false,
			messages: [
				{
					direction: EmailDirection.INBOUND,
					daysAgo: 3,
					body: "Wir haben den Vertrag gezeichnet und die erste Tranche von 320.000 € freigegeben. Willkommen als offizieller Partner.",
				},
			],
			facts: [
				{
					field: "contract.signed",
					value: "Vertrag gezeichnet, 320.000 € freigegeben",
					quote:
						"Wir haben den Vertrag gezeichnet und die erste Tranche von 320.000 € freigegeben.",
				},
			],
			task: {
				subject: "Kickoff deployment call with Vossberg project lead",
				dueDaysAgo: -2,
			},
		},
		{
			id: "demo-deal-7-veloce",
			name: "Veloce Logistique SAS",
			stage: DealStage.QUALIFIED_TO_BUY,
			amount: 110000,
			currency: "EUR",
			country: "France",
			city: "Paris",
			countryCode: "FR",
			companyName: "Veloce Logistique SAS",
			domain: "veloce-logistique.example",
			contactFirst: "Camille",
			contactLast: "Laurent",
			contactPhone: "+33 1 42 68 55 00",
			contactEmail: "c.laurent@veloce-logistique.example",
			timezone: "Europe/Paris",
			language: "fr",
			optedOut: false,
			messages: [
				{
					direction: EmailDirection.INBOUND,
					daysAgo: 6,
					body: "Bonjour, notre direction a validé le budget de 110 000 € pour la refonte de nos flux logistiques. Pouvez-vous nous confirmer la conformité RGPD ?",
				},
			],
			facts: [
				{
					field: "language",
					value: "fr",
					quote: "Bonjour, notre direction a validé",
				},
				{
					field: "qualification.budget",
					value: "Budget de 110 000 € validé",
					quote: "notre direction a validé le budget de 110 000 €",
				},
			],
			task: {
				subject: "Send French GDPR data processing addendum",
				dueDaysAgo: 3,
			},
		},
		{
			id: "demo-deal-8-lumiere",
			name: "Lumière Systèmes Partenaires",
			stage: DealStage.CONTRACT_SENT,
			amount: 210000,
			currency: "EUR",
			country: "France",
			city: "Paris",
			countryCode: "FR",
			companyName: "Lumière Systèmes Partenaires",
			domain: "lumiere-systemes.example",
			contactFirst: "Marc",
			contactLast: "Dupont",
			contactPhone: "+33 1 53 10 22 00",
			contactEmail: "m.dupont@lumiere-systemes.example",
			timezone: "Europe/Paris",
			language: "fr",
			optedOut: false,
			messages: [
				{
					direction: EmailDirection.OUTBOUND,
					daysAgo: 7,
					body: "Bonjour Marc, voici notre proposition tarifaire de 210 000 € pour le déploiement annuel.",
				},
			],
			facts: [
				{
					field: "proposal.quote",
					value: "Proposition de 210 000 € envoyée",
					quote:
						"proposition tarifaire de 210 000 € pour le déploiement annuel",
				},
			],
			stalled: {
				reason: "No reply for 7 days in the Proposal stage (SLA 5 days)",
				strategy: "confirm_next_step",
				draftText:
					"Objet: Suivi de notre proposition tarifaire\n\nBonjour Marc,\n\nJe voulais faire un suivi concernant notre proposition transmise la semaine dernière. Êtes-vous disponible pour un court échange afin de répondre à vos questions ?\n\nCordialement,\nAlex Morgan\nNorthwind Systems",
			},
		},
		{
			id: "demo-deal-9-alnoor",
			name: "Al-Noor Logistics Tech",
			stage: DealStage.DECISION_MAKER_BOUGHT_IN,
			amount: 450000,
			currency: "AED",
			country: "United Arab Emirates",
			city: "Dubai",
			countryCode: "AE",
			companyName: "Al-Noor Logistics Tech",
			domain: "alnoor-logistics.example",
			contactFirst: "Tariq",
			contactLast: "Mansoor",
			contactPhone: "+971 4 208 5555",
			contactEmail: "t.mansoor@alnoor-logistics.example",
			timezone: "Asia/Dubai",
			language: "en",
			optedOut: false,
			messages: [
				{
					direction: EmailDirection.INBOUND,
					daysAgo: 2,
					body: "The VP of Technology approved our 450,000 AED deployment budget. We require in-region UAE data hosting.",
				},
			],
			facts: [
				{
					field: "decision.bought_in",
					value: "VP of Technology approved deployment",
					quote:
						"The VP of Technology approved our 450,000 AED deployment budget.",
				},
				{
					field: "data_residency",
					value: "In-region UAE data hosting required",
					quote: "We require in-region UAE data hosting.",
				},
			],
			task: {
				subject: "Verify UAE Azure/GCP data residency zone",
				dueDaysAgo: 0,
			},
		},
		{
			id: "demo-deal-10-emirates",
			name: "Emirates Retail Solutions",
			stage: DealStage.UNQUALIFIED_TO_BUY,
			amount: 320000,
			currency: "AED",
			country: "United Arab Emirates",
			city: "Abu Dhabi",
			countryCode: "AE",
			companyName: "Emirates Retail Solutions",
			domain: "emiratesretail.example",
			contactFirst: "Aisha",
			contactLast: "Al-Hashemi",
			contactPhone: "+971 2 444 8900",
			contactEmail: "aisha@emiratesretail.example",
			timezone: "Asia/Dubai",
			language: "en",
			optedOut: true,
			messages: [
				{
					direction: EmailDirection.INBOUND,
					daysAgo: 8,
					body: "We have decided not to proceed. Please stop contacting us and remove our company from your database.",
				},
			],
			facts: [
				{
					field: "opt_out",
					value: "Requested stop and unsubscribe",
					quote:
						"Please stop contacting us and remove our company from your database.",
				},
			],
		},
		{
			id: "demo-deal-11-merlion",
			name: "Merlion Pay Digital",
			stage: DealStage.DEMO_BOOKED,
			amount: 175000,
			currency: "SGD",
			country: "Singapore",
			city: "Singapore",
			countryCode: "SG",
			companyName: "Merlion Pay Digital Pte Ltd",
			domain: "merlionpay.example",
			contactFirst: "Kenneth",
			contactLast: "Tan",
			contactPhone: "+65 6789 0123",
			contactEmail: "kenneth.tan@merlionpay.example",
			timezone: "Asia/Singapore",
			language: "en",
			optedOut: false,
			messages: [
				{
					direction: EmailDirection.INBOUND,
					daysAgo: 3,
					body: "We would like to book a hands-on technical architecture session for our Singapore and Jakarta engineering leads.",
				},
			],
			facts: [
				{
					field: "meeting.demo",
					value: "Technical architecture session booked",
					quote:
						"book a hands-on technical architecture session for our Singapore and Jakarta engineering leads.",
				},
			],
			task: {
				subject: "Send technical demo sandbox credentials to Kenneth Tan",
				dueDaysAgo: -1,
			},
		},
		{
			id: "demo-deal-12-apex",
			name: "Apex Cloud Enterprise",
			stage: DealStage.CLOSED_LOST,
			amount: 8500000,
			currency: "INR",
			country: "India",
			city: "Mumbai",
			countryCode: "IN",
			companyName: "Apex Cloud Enterprise India Ltd",
			domain: "apexcloud.example",
			contactFirst: "Rajesh",
			contactLast: "Sharma",
			contactPhone: "+91 98200 12345",
			contactEmail: "rsharma@apexcloud.example",
			timezone: "Asia/Kolkata",
			language: "en",
			optedOut: false,
			messages: [
				{
					direction: EmailDirection.INBOUND,
					daysAgo: 10,
					body: "After internal review, our leadership decided to build the workflow in-house using open-source tools. We will not be moving forward.",
				},
			],
			facts: [
				{
					field: "closed_reason",
					value: "In-house build decision",
					quote:
						"leadership decided to build the workflow in-house using open-source tools.",
				},
			],
		},
	];

	for (const data of dealsData) {
		const company = await db.company.create({
			data: {
				id: `demo-company-${data.id}`,
				name: data.companyName,
				domain: data.domain,
				industry: "Enterprise Software & Cloud",
				city: data.city,
				country: data.country,
				countryCode: data.countryCode,
				createdAt: daysAgo(20),
			},
		});

		const contact = await db.contact.create({
			data: {
				id: `demo-contact-${data.id}`,
				firstName: data.contactFirst,
				lastName: data.contactLast,
				email: data.contactEmail,
				phone: data.contactPhone,
				companyId: company.id,
				timezone: data.timezone,
				optedOut: data.optedOut,
				createdAt: daysAgo(20),
			},
		});

		const deal = await db.deal.create({
			data: {
				id: data.id,
				name: data.name,
				stage: data.stage,
				amount: new Prisma.Decimal(data.amount),
				currency: data.currency,
				companyId: company.id,
				ownerId: user.id,
				stageChangedAt: daysAgo(5),
				createdAt: daysAgo(15),
				contacts: {
					create: {
						contactId: contact.id,
						role: "Primary Contact",
					},
				},
			},
		});

		for (const msg of data.messages) {
			await db.whatsAppMessage.create({
				data: {
					dealId: deal.id,
					contactId: contact.id,
					direction: msg.direction,
					senderPhone:
						msg.direction === EmailDirection.INBOUND
							? data.contactPhone
							: "+1 800 555 0100",
					senderName:
						msg.direction === EmailDirection.INBOUND
							? `${data.contactFirst} ${data.contactLast}`
							: "Northwind Systems",
					body: msg.body,
					timestamp: daysAgo(msg.daysAgo),
				},
			});
		}

		const factIds: string[] = [];
		for (const fact of data.facts) {
			const created = await db.contactFact.create({
				data: {
					dealId: deal.id,
					contactId: contact.id,
					field: fact.field,
					value: fact.value,
					score: 0.95,
					band: FactBand.VERIFIED,
					status: FactStatus.APPLIED,
					// Seeded, not extracted: the ledger says so.
					method: "demo-seed",
					evidence: [
						{
							kind: "whatsapp.message",
							detail: `"${fact.quote}" (speaker: lead)`,
						},
					],
				},
			});
			factIds.push(created.id);
		}

		if ("task" in data && data.task) {
			await db.activity.create({
				data: {
					dealId: deal.id,
					type: ActivityType.TASK,
					subject: data.task.subject,
					dueAt: daysAgo(data.task.dueDaysAgo),
					createdById: user.id,
					createdAt: daysAgo(5),
				},
			});
		}

		if ("stalled" in data && data.stalled) {
			await db.outboundDraft.create({
				data: {
					dealId: deal.id,
					contactId: contact.id,
					channel: "EMAIL",
					language: data.language,
					status: OutboundDraftStatus.PENDING_APPROVAL,
					stalledReason: data.stalled.reason,
					strategy: data.stalled.strategy,
					contextRationale: `Deal inactive in the ${formatDealStage(data.stage)} stage beyond its SLA.`,
					draftText: data.stalled.draftText,
					confidence: 0.92,
					priorityScore: 78,
					citedEvidence: data.facts.slice(0, 2).map((fact, i) => ({
						evidenceId: factIds[i],
						kind: "fact",
						quote: `${fact.field}: ${fact.value}`,
					})),
				},
			});
		}
	}

	await seedAgentWork(user.id, DEMO_USER_EMAIL);

	console.log(
		`Seeded ${DEMO_ORG_NAME} with ${dealsData.length} global deals across US, UK, DE, FR, UAE, SG, IN, and the agent work around them.`,
	);
}

if (import.meta.main) {
	seedDemoOrg()
		.then(() => process.exit(0))
		.catch((err) => {
			console.error("Demo seed failed:", err);
			process.exit(1);
		});
}

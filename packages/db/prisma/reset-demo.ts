import { db } from "../src/client";

export const DEMO_ORG_ID = "org-northwind-systems";
export const DEMO_ORG_SLUG = "northwind-systems";
export const DEMO_USER_ID = "user-demo-judge";
export const DEMO_USER_EMAIL = "judge@northwind.io";

export async function resetDemoOrg(): Promise<void> {
	console.log(`Resetting demo org "${DEMO_ORG_SLUG}"...`);

	const demoDeals = await db.deal.findMany({
		where: { ownerId: DEMO_USER_ID },
		select: { id: true, companyId: true },
	});

	const dealIds = demoDeals.map((d) => d.id);
	const companyIds = demoDeals
		.map((d) => d.companyId)
		.filter((id): id is string => Boolean(id));

	if (dealIds.length > 0) {
		await db.outboundDraft.deleteMany({ where: { dealId: { in: dealIds } } });
		await db.contactFact.deleteMany({ where: { dealId: { in: dealIds } } });
		await db.whatsAppMessage.deleteMany({ where: { dealId: { in: dealIds } } });
		await db.activity.deleteMany({ where: { dealId: { in: dealIds } } });
		await db.dealContact.deleteMany({ where: { dealId: { in: dealIds } } });
		await db.deal.deleteMany({ where: { id: { in: dealIds } } });
	}

	if (companyIds.length > 0) {
		const contacts = await db.contact.findMany({
			where: { companyId: { in: companyIds } },
			select: { id: true },
		});
		const contactIds = contacts.map((c) => c.id);

		if (contactIds.length > 0) {
			await db.contactFact.deleteMany({
				where: { contactId: { in: contactIds } },
			});
			await db.whatsAppMessage.deleteMany({
				where: { contactId: { in: contactIds } },
			});
			await db.contact.deleteMany({ where: { id: { in: contactIds } } });
		}

		await db.company.deleteMany({ where: { id: { in: companyIds } } });
	}

	await db.member.deleteMany({ where: { organizationId: DEMO_ORG_ID } });
	await db.slackInstallation.deleteMany({
		where: { organizationId: DEMO_ORG_ID },
	});
	await db.session.deleteMany({ where: { userId: DEMO_USER_ID } });
	await db.account.deleteMany({ where: { userId: DEMO_USER_ID } });
	await db.user.deleteMany({ where: { id: DEMO_USER_ID } });
	await db.organization.deleteMany({ where: { id: DEMO_ORG_ID } });

	console.log(`Demo org "${DEMO_ORG_SLUG}" reset complete.`);
}

if (import.meta.main) {
	resetDemoOrg()
		.then(() => process.exit(0))
		.catch((err) => {
			console.error("Demo reset failed:", err);
			process.exit(1);
		});
}

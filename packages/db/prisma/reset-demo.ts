import { db } from "../src/client";
import { DEMO_USER_ID } from "../src/demo";
import { WORKSPACE_ID } from "../src/workspace";

export { DEMO_USER_ID };

// The CRM is one workspace per deployment (every CRM table is workspace-wide),
// so the demo is that workspace, named Northwind Systems, not a second org.
export const DEMO_ORG_ID = WORKSPACE_ID;
export const DEMO_ORG_SLUG = "northwind-systems";
export const DEMO_ORG_NAME = "Northwind Systems";
export const DEMO_USER_EMAIL = "judge@northwind.example";
export const DEMO_REP_ID = "user-demo-rep";
export const DEMO_REP_NAME = "Alex Morgan";
export const DEMO_REP_EMAIL = "alex.morgan@northwind.example";

const DEMO_PREFIX = "demo-";

const DEMO_USERS = [DEMO_USER_ID, DEMO_REP_ID];

/**
 * Removes the seeded demo records and whatever the judge account imported.
 * Only rows the demo seed created (ids prefixed `demo-`) or that the demo
 * users own are touched; the workspace and its real members are left alone.
 * The demo users themselves stay, so a judge's open session survives.
 */
export async function resetDemoOrg(): Promise<void> {
	console.log(`Resetting demo workspace "${DEMO_ORG_SLUG}"...`);

	const dealIds = (
		await db.deal.findMany({
			where: {
				OR: [
					{ id: { startsWith: DEMO_PREFIX } },
					{ ownerId: { in: DEMO_USERS } },
				],
			},
			select: { id: true },
		})
	).map((d) => d.id);

	if (dealIds.length > 0) {
		await db.outboundDraft.deleteMany({ where: { dealId: { in: dealIds } } });
		await db.contactFact.deleteMany({ where: { dealId: { in: dealIds } } });
		await db.whatsAppMessage.deleteMany({ where: { dealId: { in: dealIds } } });
		await db.activity.deleteMany({ where: { dealId: { in: dealIds } } });
		await db.dealContact.deleteMany({ where: { dealId: { in: dealIds } } });
		await db.deal.deleteMany({ where: { id: { in: dealIds } } });
	}
	await db.activity.deleteMany({ where: { createdById: { in: DEMO_USERS } } });

	const contactIds = (
		await db.contact.findMany({
			where: {
				OR: [
					{ id: { startsWith: DEMO_PREFIX } },
					{ ownerId: { in: DEMO_USERS } },
				],
			},
			select: { id: true },
		})
	).map((c) => c.id);

	if (contactIds.length > 0) {
		await db.outboundDraft.deleteMany({
			where: { contactId: { in: contactIds } },
		});
		await db.contactFact.deleteMany({
			where: { contactId: { in: contactIds } },
		});
		await db.whatsAppMessage.deleteMany({
			where: { contactId: { in: contactIds } },
		});
		await db.contact.deleteMany({ where: { id: { in: contactIds } } });
	}

	await db.company.deleteMany({
		where: {
			OR: [
				{ id: { startsWith: DEMO_PREFIX } },
				{ ownerId: { in: DEMO_USERS } },
			],
		},
	});

	console.log(`Demo workspace "${DEMO_ORG_SLUG}" reset complete.`);
}

if (import.meta.main) {
	resetDemoOrg()
		.then(() => process.exit(0))
		.catch((err) => {
			console.error("Demo reset failed:", err);
			process.exit(1);
		});
}

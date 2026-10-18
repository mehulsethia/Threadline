import { afterAll, beforeEach, describe, expect, it } from "bun:test";
import { db } from "@crm/db";
import { ensureWorkspaceMembership, WORKSPACE_ID } from "../src/organization";

const suffix = process.env.TEST_RUN_ID ?? "organization-spec";

const emailOf = (label: string) => `${label}.${suffix}@example.test`;

let firstId: string;
let secondId: string;

const seedUser = async (label: string, createdAt: Date): Promise<string> => {
	const user = await db.user.create({
		data: {
			id: `${suffix}-${label}`,
			name: label,
			email: emailOf(label),
			createdAt,
			updatedAt: createdAt,
		},
		select: { id: true },
	});

	return user.id;
};

const roleOf = async (userId: string): Promise<string | null> => {
	const member = await db.member.findUnique({
		where: { organizationId_userId: { organizationId: WORKSPACE_ID, userId } },
		select: { role: true },
	});

	return member?.role ?? null;
};

const clear = async () => {
	await db.member.deleteMany({
		where: { userId: { startsWith: `${suffix}-` } },
	});
	await db.user.deleteMany({
		where: { email: { endsWith: `.${suffix}@example.test` } },
	});

	const strangers = await db.member.count({
		where: { organizationId: WORKSPACE_ID },
	});

	if (strangers > 0) {
		throw new Error(
			`${strangers} member row(s) this spec did not create are in the workspace, and it needs an empty one to test membership. It will not delete them: that is somebody's access. Point TEST_DATABASE_URL at a database of your own, or find the spec that leaked them.`,
		);
	}
};

beforeEach(async () => {
	await clear();

	firstId = await seedUser("first", new Date("2020-01-01T00:00:00Z"));
	secondId = await seedUser("second", new Date("2021-01-01T00:00:00Z"));
});

afterAll(clear);

const enrol = async (userId: string, role: string) => {
	await db.organization.upsert({
		where: { id: WORKSPACE_ID },
		create: {
			id: WORKSPACE_ID,
			name: "CRM",
			slug: "crm",
			createdAt: new Date(),
		},
		update: {},
	});
	await db.member.create({
		data: {
			id: `${suffix}-${userId}-member`,
			organizationId: WORKSPACE_ID,
			userId,
			role,
			createdAt: new Date(),
		},
	});
};

describe("ensureWorkspaceMembership", () => {
	it("does not put a new sign-up into somebody else's workspace", async () => {
		expect(await ensureWorkspaceMembership(secondId)).toBeUndefined();
		expect(await roleOf(secondId)).toBeNull();
	});

	it("returns the workspace a member already belongs to", async () => {
		await enrol(firstId, "owner");

		expect(await ensureWorkspaceMembership(firstId)).toBe(WORKSPACE_ID);
		expect(await roleOf(firstId)).toBe("owner");
	});

	it("leaves roles alone when a member signs in again", async () => {
		await enrol(secondId, "admin");

		await ensureWorkspaceMembership(secondId);
		await ensureWorkspaceMembership(secondId);

		const rows = await db.member.findMany({
			where: { organizationId: WORKSPACE_ID, userId: secondId },
		});

		expect(rows).toHaveLength(1);
		expect(rows[0]?.role).toBe("admin");
	});
});

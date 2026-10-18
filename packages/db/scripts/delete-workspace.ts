import { pgPool } from "../src/client";
import { schemaForWorkspace } from "../src/tenancy";
import { WORKSPACE_ID } from "../src/workspace";

type Workspace = { id: string; slug: string | null; name: string };

const PROTECTED_SLUGS = new Set(["northwind-systems"]);

const args = process.argv.slice(2);
const flag = (name: string): string | undefined => {
	const index = args.indexOf(`--${name}`);
	return index >= 0 ? args[index + 1] : undefined;
};

const email = flag("email")?.trim().toLowerCase();
const target = flag("workspace")?.trim();
const confirmed = args.includes("--confirm");

if (!email && !target) {
	console.log(
		[
			"Deletes a workspace (its schema and membership rows), or everything for one user.",
			"",
			"  bun packages/db/scripts/delete-workspace.ts --workspace <slug-or-id> [--confirm]",
			"  bun packages/db/scripts/delete-workspace.ts --email <address> [--confirm]",
			"",
			"Without --confirm it only prints what it would delete.",
		].join("\n"),
	);
	process.exit(1);
}

const isProtected = (workspace: Workspace) =>
	workspace.id === WORKSPACE_ID ||
	(workspace.slug !== null && PROTECTED_SLUGS.has(workspace.slug));

async function memberCount(workspaceId: string): Promise<number> {
	const result = await pgPool.query<{ count: string }>(
		`SELECT count(*)::text AS count FROM public."member" WHERE "organizationId" = $1`,
		[workspaceId],
	);
	return Number(result.rows[0]?.count ?? 0);
}

async function workspacesFor(): Promise<{
	userId: string | null;
	workspaces: Workspace[];
}> {
	if (target) {
		const result = await pgPool.query<Workspace>(
			`SELECT id, slug, name FROM public."organization" WHERE id = $1 OR slug = $1`,
			[target],
		);
		return { userId: null, workspaces: result.rows };
	}
	const user = await pgPool.query<{ id: string }>(
		`SELECT id FROM public."user" WHERE lower(email) = $1`,
		[email],
	);
	const userId = user.rows[0]?.id ?? null;
	if (!userId) return { userId: null, workspaces: [] };
	const result = await pgPool.query<Workspace>(
		`SELECT o.id, o.slug, o.name FROM public."member" m
		 JOIN public."organization" o ON o.id = m."organizationId"
		 WHERE m."userId" = $1`,
		[userId],
	);
	return { userId, workspaces: result.rows };
}

const { userId, workspaces } = await workspacesFor();

if (email && !userId) {
	console.log(`No user with the email ${email}.`);
	await pgPool.end();
	process.exit(1);
}

if (target && workspaces.length === 0) {
	console.log(`No workspace with the slug or id ${target}.`);
	await pgPool.end();
	process.exit(1);
}

const plan: { workspace: Workspace; action: "delete" | "leave" | "skip" }[] =
	[];
for (const workspace of workspaces) {
	if (isProtected(workspace)) {
		plan.push({ workspace, action: "skip" });
		continue;
	}
	const members = await memberCount(workspace.id);
	plan.push({
		workspace,
		action: email && members > 1 ? "leave" : "delete",
	});
}

for (const { workspace, action } of plan) {
	const label = `${workspace.name} (${workspace.slug ?? workspace.id})`;
	if (action === "skip")
		console.log(`SKIP    ${label}: protected demo workspace`);
	if (action === "leave")
		console.log(
			`LEAVE   ${label}: other members use it, only ${email} is removed`,
		);
	if (action === "delete")
		console.log(
			`DELETE  ${label}: drops schema ${schemaForWorkspace(workspace.id)} and every record in it`,
		);
}
if (email)
	console.log(
		`DELETE  user ${email}, with sessions, linked accounts and API keys`,
	);

if (!confirmed) {
	console.log("\nDry run. Nothing was deleted. Add --confirm to delete.");
	await pgPool.end();
	process.exit(0);
}

const client = await pgPool.connect();
try {
	await client.query("BEGIN");
	for (const { workspace, action } of plan) {
		if (action === "skip") continue;
		if (action === "leave") {
			await client.query(
				`DELETE FROM public."member" WHERE "organizationId" = $1 AND "userId" = $2`,
				[workspace.id, userId],
			);
			continue;
		}
		const schema = schemaForWorkspace(workspace.id).replace(/"/g, '""');
		await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
		for (const table of ["invitation", "ssoProvider", "member"]) {
			await client.query(
				`DELETE FROM public."${table}" WHERE "organizationId" = $1`,
				[workspace.id],
			);
		}
		await client.query(`DELETE FROM public."organization" WHERE id = $1`, [
			workspace.id,
		]);
	}
	if (userId) {
		await client.query(`DELETE FROM public."member" WHERE "userId" = $1`, [
			userId,
		]);
		await client.query(`DELETE FROM public."apikey" WHERE "referenceId" = $1`, [
			userId,
		]);
		await client.query(`DELETE FROM public."session" WHERE "userId" = $1`, [
			userId,
		]);
		await client.query(`DELETE FROM public."account" WHERE "userId" = $1`, [
			userId,
		]);
		await client.query(`DELETE FROM public."user" WHERE id = $1`, [userId]);
	}
	await client.query("COMMIT");
	console.log("\nDeleted.");
} catch (error) {
	await client.query("ROLLBACK");
	console.error("Nothing was deleted:", error);
	process.exitCode = 1;
} finally {
	client.release();
	await pgPool.end();
}

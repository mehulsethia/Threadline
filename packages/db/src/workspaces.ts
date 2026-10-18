import { readFileSync } from "node:fs";
import { join } from "node:path";
import { findWorkspaceRoot } from "@crm/env";
import { pgPool, rootDb } from "./client";
import {
	DEMO_WORKSPACE_ID,
	GLOBAL_TABLES,
	isSingleSchema,
	runInWorkspace,
	schemaForWorkspace,
} from "./tenancy";

function bootstrapSql(): string {
	const root = findWorkspaceRoot(process.cwd());
	if (!root) throw new Error("Cannot find the repository root.");
	return readFileSync(
		join(root, "packages", "db", "prisma", "tenant-bootstrap.sql"),
		"utf8",
	);
}

const LEGACY_MARKER_TABLE = "contact";

function literal(value: string): string {
	return `'${value.replace(/'/g, "''")}'`;
}

function ident(value: string): string {
	return `"${value.replace(/"/g, '""')}"`;
}

function viewSql(schema: string, workspaceId: string): string[] {
	const org = literal(workspaceId);
	const members = `SELECT "userId" FROM public."member" WHERE "organizationId" = ${org}`;
	const filter = {
		user: `WHERE "id" IN (${members})`,
		session: `WHERE "userId" IN (${members})`,
		account: `WHERE "userId" IN (${members})`,
		verification: "",
		rateLimit: "",
		organization: `WHERE "id" = ${org}`,
		member: `WHERE "organizationId" = ${org}`,
		invitation: `WHERE "organizationId" = ${org}`,
		ssoProvider: `WHERE "organizationId" = ${org}`,
		apikey: `WHERE "referenceId" IN (${members})`,
	} satisfies Record<(typeof GLOBAL_TABLES)[number], string>;
	return GLOBAL_TABLES.flatMap((table) => [
		`DROP TABLE IF EXISTS ${ident(schema)}.${ident(table)} CASCADE`,
		`DROP VIEW IF EXISTS ${ident(schema)}.${ident(table)}`,
		`CREATE VIEW ${ident(schema)}.${ident(table)} AS SELECT * FROM public.${ident(table)} ${filter[table]}`,
	]);
}

async function schemaExists(schema: string): Promise<boolean> {
	const result = await pgPool.query(
		"SELECT 1 FROM information_schema.schemata WHERE schema_name = $1",
		[schema],
	);
	return (result.rowCount ?? 0) > 0;
}

async function publicHasTenantTables(): Promise<boolean> {
	const result = await pgPool.query(
		"SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1",
		[LEGACY_MARKER_TABLE],
	);
	return (result.rowCount ?? 0) > 0;
}

export async function provisionWorkspaceSchema(
	workspaceId: string,
): Promise<boolean> {
	const schema = schemaForWorkspace(workspaceId);
	if (await schemaExists(schema)) return false;

	const bootstrap = bootstrapSql();
	const client = await pgPool.connect();
	try {
		await client.query("BEGIN");
		await client.query(`CREATE SCHEMA ${ident(schema)}`);
		await client.query(`SET LOCAL search_path TO ${ident(schema)}`);
		await client.query(bootstrap);
		for (const statement of viewSql(schema, workspaceId)) {
			await client.query(statement);
		}
		await client.query("COMMIT");
		return true;
	} catch (error) {
		await client.query("ROLLBACK");
		throw error;
	} finally {
		client.release();
	}
}

export async function adoptLegacyWorkspace(
	workspaceId: string,
): Promise<boolean> {
	const schema = schemaForWorkspace(workspaceId);
	if (!(await publicHasTenantTables())) return false;
	if (await schemaExists(schema)) {
		throw new Error(
			`public still holds workspace tables but ${schema} already exists. Resolve by hand.`,
		);
	}

	const globals = new Set<string>(GLOBAL_TABLES);
	const client = await pgPool.connect();
	try {
		await client.query("BEGIN");
		await client.query(`CREATE SCHEMA ${ident(schema)}`);
		const tables = await client.query<{ table_name: string }>(
			"SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'",
		);
		for (const { table_name } of tables.rows) {
			if (globals.has(table_name) || table_name.startsWith("_prisma")) continue;
			await client.query(
				`ALTER TABLE public.${ident(table_name)} SET SCHEMA ${ident(schema)}`,
			);
		}
		const types = await client.query<{ typname: string }>(
			"SELECT t.typname FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE n.nspname = 'public' AND t.typtype = 'e'",
		);
		for (const { typname } of types.rows) {
			await client.query(
				`ALTER TYPE public.${ident(typname)} SET SCHEMA ${ident(schema)}`,
			);
		}
		for (const statement of viewSql(schema, workspaceId)) {
			await client.query(statement);
		}
		await client.query("COMMIT");
		return true;
	} catch (error) {
		await client.query("ROLLBACK");
		throw error;
	} finally {
		client.release();
	}
}

export async function listWorkspaceIds(): Promise<string[]> {
	const organizations = await rootDb.organization.findMany({
		select: { id: true },
		orderBy: { createdAt: "asc" },
	});
	const ids: string[] = [];
	for (const { id } of organizations) {
		if (await schemaExists(schemaForWorkspace(id))) ids.push(id);
	}
	return ids;
}

export async function ensureWorkspaceSchemas(): Promise<string[]> {
	const organizations = await rootDb.organization.findMany({
		select: { id: true },
		orderBy: { createdAt: "asc" },
	});
	const created: string[] = [];
	for (const { id } of organizations) {
		if (await provisionWorkspaceSchema(id)) created.push(id);
	}
	return created;
}

export async function workspaceIdsForUser(userId: string): Promise<string[]> {
	const memberships = await rootDb.member.findMany({
		where: { userId },
		select: { organizationId: true },
		orderBy: { createdAt: "asc" },
	});
	return memberships.map((membership) => membership.organizationId);
}

export async function forEachWorkspace<T>(
	fn: (workspaceId: string) => Promise<T>,
): Promise<{ workspaceId: string; result?: T; error?: string }[]> {
	const results: { workspaceId: string; result?: T; error?: string }[] = [];
	const ids = isSingleSchema() ? [DEMO_WORKSPACE_ID] : await listWorkspaceIds();
	for (const workspaceId of ids) {
		try {
			results.push({
				workspaceId,
				result: await runInWorkspace(workspaceId, () => fn(workspaceId)),
			});
		} catch (error) {
			results.push({
				workspaceId,
				error: error instanceof Error ? error.message : String(error),
			});
		}
	}
	return results;
}

export async function findWorkspace(
	match: (workspaceId: string) => Promise<boolean>,
): Promise<string | null> {
	const ids = isSingleSchema() ? [DEMO_WORKSPACE_ID] : await listWorkspaceIds();
	for (const workspaceId of ids) {
		if (await runInWorkspace(workspaceId, () => match(workspaceId))) {
			return workspaceId;
		}
	}
	return null;
}

import { readdirSync, readFileSync } from "node:fs";
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

function prismaDir(): string {
	const root = findWorkspaceRoot(process.cwd());
	if (!root) throw new Error("Cannot find the repository root.");
	return join(root, "packages", "db", "prisma");
}

function bootstrapSql(): string {
	return readFileSync(join(prismaDir(), "tenant-bootstrap.sql"), "utf8");
}

function migrationNames(): string[] {
	return readdirSync(join(prismaDir(), "migrations"), { withFileTypes: true })
		.filter((entry) => entry.isDirectory())
		.map((entry) => entry.name)
		.sort();
}

const GLOBAL_TABLE_PATTERN = new RegExp(`"(${GLOBAL_TABLES.join("|")})"`);

export function workspaceStatements(sql: string): string[] {
	return sql
		.split(/;\s*(?:\n|$)/)
		.map((statement) =>
			statement
				.split("\n")
				.filter((line) => !line.trim().startsWith("--"))
				.join("\n")
				.trim(),
		)
		.filter(Boolean)
		.filter((statement) => !GLOBAL_TABLE_PATTERN.test(statement));
}

const LEDGER = "_workspace_migrations";

async function markMigrations(
	client: { query: (sql: string, values?: unknown[]) => Promise<unknown> },
	schema: string,
	names: string[],
): Promise<void> {
	await client.query(
		`CREATE TABLE IF NOT EXISTS ${ident(schema)}.${ident(LEDGER)} ("name" TEXT PRIMARY KEY, "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
	);
	for (const name of names) {
		await client.query(
			`INSERT INTO ${ident(schema)}.${ident(LEDGER)} ("name") VALUES ($1) ON CONFLICT DO NOTHING`,
			[name],
		);
	}
}

export async function migrateWorkspaceSchema(
	workspaceId: string,
): Promise<string[]> {
	const schema = schemaForWorkspace(workspaceId);
	const client = await pgPool.connect();
	try {
		await markMigrations(client, schema, []);
		const done = await client.query<{ name: string }>(
			`SELECT "name" FROM ${ident(schema)}.${ident(LEDGER)}`,
		);
		const applied = new Set(done.rows.map((row) => row.name));
		const pending = migrationNames().filter((name) => !applied.has(name));
		for (const name of pending) {
			const sql = readFileSync(
				join(prismaDir(), "migrations", name, "migration.sql"),
				"utf8",
			);
			await client.query("BEGIN");
			try {
				await client.query(`SET LOCAL search_path TO ${ident(schema)}`);
				for (const statement of workspaceStatements(sql)) {
					await client.query(statement);
				}
				await markMigrations(client, schema, [name]);
				await client.query("COMMIT");
			} catch (error) {
				await client.query("ROLLBACK");
				throw new Error(
					`Migration ${name} failed in ${schema}: ${error instanceof Error ? error.message : String(error)}`,
				);
			}
		}
		await client.query("BEGIN");
		for (const statement of viewSql(schema, workspaceId, false)) {
			await client.query(statement);
		}
		await client.query("COMMIT");
		return pending;
	} finally {
		client.release();
	}
}

export async function migrateWorkspaceSchemas(): Promise<
	{ workspaceId: string; applied: string[] }[]
> {
	const results: { workspaceId: string; applied: string[] }[] = [];
	for (const workspaceId of await listWorkspaceIds()) {
		results.push({
			workspaceId,
			applied: await migrateWorkspaceSchema(workspaceId),
		});
	}
	return results;
}

async function createPublicShadow(client: {
	query: (sql: string) => Promise<unknown>;
}): Promise<void> {
	await client.query("SET LOCAL search_path TO public");
	for (const statement of workspaceStatements(bootstrapSql())) {
		await client.query(statement);
	}
}

const LEGACY_MARKER_TABLE = "contact";

function literal(value: string): string {
	return `'${value.replace(/'/g, "''")}'`;
}

function ident(value: string): string {
	return `"${value.replace(/"/g, '""')}"`;
}

function viewSql(
	schema: string,
	workspaceId: string,
	dropTables = true,
): string[] {
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
		...(dropTables
			? [`DROP TABLE IF EXISTS ${ident(schema)}.${ident(table)} CASCADE`]
			: []),
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
		await markMigrations(client, schema, migrationNames());
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
	if (await schemaExists(schema)) return false;
	if (!(await publicHasTenantTables())) return false;

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
		await markMigrations(client, schema, migrationNames());
		await createPublicShadow(client);
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

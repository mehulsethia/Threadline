import "@crm/env/load";

import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { type Prisma, PrismaClient } from "./generated/prisma/client";
import {
	currentWorkspaceId,
	isSingleSchema,
	schemaForWorkspace,
} from "./tenancy";

const connectionString =
	process.env.NODE_ENV === "test" ? testDatabase() : liveDatabase();

function liveDatabase(): string {
	const url = process.env.DATABASE_URL;

	if (!url) {
		throw new Error(
			"DATABASE_URL is not set. Copy .env.example to .env at the root of the repo and fill it in, or set DATABASE_URL in the environment.",
		);
	}

	return url;
}

function testDatabase(): string {
	const url = process.env.TEST_DATABASE_URL;

	if (!url) {
		throw new Error(
			[
				"TEST_DATABASE_URL is not set, and the suite will not fall back to DATABASE_URL.",
				"",
				"These are real integration tests. They delete every workspace member and the",
				"organization row and put them back when the run finishes — so a run that is",
				"interrupted leaves everybody locked out of whatever database it was pointed at.",
				"The pre-push hook runs them, so that is one `git push` away from a database you",
				"care about.",
				"",
				"Make a throwaway one and point TEST_DATABASE_URL at it:",
				"",
				"    bun run db:test",
				"",
			].join("\n"),
		);
	}

	if (!databaseName(url).endsWith("_test")) {
		throw new Error(
			`TEST_DATABASE_URL must name a database ending in _test, so it cannot be one somebody is using. It names "${databaseName(url)}".`,
		);
	}

	return url;
}

function databaseName(url: string): string {
	try {
		return new URL(url).pathname.replace(/^\//, "");
	} catch {
		return url;
	}
}

export interface PrismaLogRecord {
	level: Prisma.LogLevel;
	message: string;
	target: string;
	durationMs?: number;
}

export type PrismaLogSink = (record: PrismaLogRecord) => void;

const consoleSink: PrismaLogSink = ({ level, message, target, durationMs }) => {
	const suffix = durationMs === undefined ? "" : ` (+${durationMs}ms)`;
	const line = `[prisma:${level}] ${message}${suffix} [${target}]`;

	if (level === "error") {
		console.error(line);
	} else if (level === "warn") {
		console.warn(line);
	} else {
		console.log(line);
	}
};

let sink: PrismaLogSink = consoleSink;

export function setPrismaLogSink(next: PrismaLogSink | null): void {
	sink = next ?? consoleSink;
}

const logQueries = process.env.PRISMA_LOG_QUERIES === "true";

const logDefinitions: Prisma.LogDefinition[] = [
	{ level: "warn", emit: "event" },
	{ level: "error", emit: "event" },
	...(logQueries
		? ([
				{ level: "query", emit: "event" },
				{ level: "info", emit: "event" },
			] satisfies Prisma.LogDefinition[])
		: []),
];

const POOL = {
	rootMax: Number(process.env.DATABASE_POOL_MAX ?? 10),
	workspaceMax: Number(process.env.DATABASE_WORKSPACE_POOL_MAX ?? 3),
	idleMs: 10_000,
} as const;

declare global {
	var crmPool: Pool | undefined;
	var crmClients: Map<string, PrismaClient> | undefined;
}

const pool =
	globalThis.crmPool ??
	new Pool({
		connectionString,
		max: POOL.rootMax,
		idleTimeoutMillis: POOL.idleMs,
	});
const clients = globalThis.crmClients ?? new Map<string, PrismaClient>();

if (process.env.NODE_ENV !== "production") {
	globalThis.crmPool = pool;
	globalThis.crmClients = clients;
}

function workspacePool(schema: string): Pool {
	return new Pool({
		connectionString,
		max: POOL.workspaceMax,
		idleTimeoutMillis: POOL.idleMs,
		options: `-c search_path="${schema}",public`,
	});
}

const createPrismaClient = (schema?: string) => {
	const client = new PrismaClient({
		adapter: schema
			? new PrismaPg(workspacePool(schema), { schema })
			: new PrismaPg(pool),
		log: logDefinitions,
	});

	client.$on("error", ({ message, target }) => {
		sink({ level: "error", message, target });
	});
	client.$on("warn", ({ message, target }) => {
		sink({ level: "warn", message, target });
	});
	client.$on("info", ({ message, target }) => {
		sink({ level: "info", message, target });
	});
	client.$on("query", ({ query, duration, target }) => {
		sink({ level: "query", message: query, target, durationMs: duration });
	});

	return client;
};

function clientFor(key: string, schema?: string): PrismaClient {
	let client = clients.get(key);
	if (!client) {
		client = createPrismaClient(schema);
		clients.set(key, client);
	}
	return client;
}

export const rootDb = clientFor("public");

export const pgPool = pool;

export function workspaceDb(workspaceId: string): PrismaClient {
	const schema = schemaForWorkspace(workspaceId);
	return clientFor(schema, schema);
}

function activeClient(): PrismaClient {
	const workspaceId = currentWorkspaceId();
	if (workspaceId && !isSingleSchema()) return workspaceDb(workspaceId);
	return rootDb;
}

export const db: PrismaClient = new Proxy(rootDb, {
	get(_target, property) {
		const client = activeClient();
		const value = Reflect.get(client, property, client);
		return value instanceof Function ? value.bind(client) : value;
	},
});

export type Db = PrismaClient;

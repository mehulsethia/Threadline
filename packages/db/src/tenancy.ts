import { AsyncLocalStorage } from "node:async_hooks";

type WorkspaceContext = { workspaceId: string };

const storage = new AsyncLocalStorage<WorkspaceContext>();

export function runInWorkspace<T>(workspaceId: string, fn: () => T): T {
	return storage.run({ workspaceId }, fn);
}

export function currentWorkspaceId(): string | undefined {
	return storage.getStore()?.workspaceId;
}

export const DEMO_WORKSPACE_ID = "workspace";

export function isSingleSchema(): boolean {
	return (
		process.env.CRM_SINGLE_SCHEMA === "1" || process.env.NODE_ENV === "test"
	);
}

export function requireWorkspaceId(): string {
	const id =
		currentWorkspaceId() ?? (isSingleSchema() ? DEMO_WORKSPACE_ID : undefined);
	if (!id) {
		throw new Error(
			"No workspace in context. Wrap the call in runInWorkspace(workspaceId, ...).",
		);
	}
	return id;
}

export function schemaForWorkspace(workspaceId: string): string {
	const safe = workspaceId.toLowerCase().replace(/[^a-z0-9_]/g, "_");
	return `t_${safe}`;
}

export const GLOBAL_TABLES = [
	"user",
	"session",
	"account",
	"verification",
	"rateLimit",
	"organization",
	"member",
	"invitation",
	"ssoProvider",
	"apikey",
] as const;

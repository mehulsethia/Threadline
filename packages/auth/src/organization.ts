import { randomUUID } from "node:crypto";
import { type Db, db, rootDb } from "@crm/db";
import { WORKSPACE_ID, workspaceId, workspaceSlug } from "@crm/db/workspace";
import {
	provisionWorkspaceSchema,
	workspaceIdsForUser,
} from "@crm/db/workspaces";

export { WORKSPACE_ID, workspaceId };

export const DEFAULT_WORKSPACE_NAME = "CRM";

export const WORKSPACE_ROLES = ["owner", "admin", "member"] as const;

export type WorkspaceRole = (typeof WORKSPACE_ROLES)[number];

export function isWorkspaceRole(value: string): value is WorkspaceRole {
	return (WORKSPACE_ROLES as readonly string[]).includes(value);
}

export function isWorkspaceAdmin(role: WorkspaceRole | null): boolean {
	return role === "owner" || role === "admin";
}

export function canRenameWorkspace(role: WorkspaceRole | null): boolean {
	return isWorkspaceAdmin(role);
}

export function canChangeRole(role: WorkspaceRole | null): boolean {
	return isWorkspaceAdmin(role);
}

export function canManageCurrency(role: WorkspaceRole | null): boolean {
	return isWorkspaceAdmin(role);
}

export function canManageConnections(role: WorkspaceRole | null): boolean {
	return isWorkspaceAdmin(role);
}

export function canManageTracking(role: WorkspaceRole | null): boolean {
	return isWorkspaceAdmin(role);
}

export async function ensureWorkspaceMembership(
	userId: string,
): Promise<string | undefined> {
	const [first] = await workspaceIdsForUser(userId);
	return first;
}

export async function createWorkspace(input: {
	userId: string;
	name: string;
	website?: string | null;
}): Promise<{ id: string; slug: string }> {
	const id = `w${randomUUID().replace(/-/g, "").slice(0, 20)}`;
	const base = workspaceSlug(input.name);
	const taken = await rootDb.organization.findUnique({
		where: { slug: base },
		select: { id: true },
	});
	const slug = taken ? `${base}-${id.slice(1, 7)}` : base;
	await rootDb.$transaction([
		rootDb.organization.create({
			data: {
				id,
				name: input.name,
				slug,
				website: input.website ?? null,
				createdAt: new Date(),
			},
		}),
		rootDb.member.create({
			data: {
				id: randomUUID(),
				organizationId: id,
				userId: input.userId,
				role: "owner",
				createdAt: new Date(),
			},
		}),
	]);
	await provisionWorkspaceSchema(id);
	return { id, slug };
}

export function toWorkspaceRole(value: string): WorkspaceRole {
	return isWorkspaceRole(value) ? value : "member";
}

export type WorkspaceMemberReader = Pick<Db, "member">;

export async function workspaceRoleOf(
	userId: string,
	client: WorkspaceMemberReader = db,
): Promise<WorkspaceRole | null> {
	const member = await client.member.findUnique({
		where: {
			organizationId_userId: { organizationId: workspaceId(), userId },
		},
		select: { role: true },
	});

	return member ? toWorkspaceRole(member.role) : null;
}

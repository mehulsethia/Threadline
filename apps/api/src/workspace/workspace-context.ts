import { auth, type Session } from "@crm/auth";
import { runInWorkspace } from "@crm/db";
import { workspaceIdsForUser } from "@crm/db/workspaces";
import { fromNodeHeaders } from "better-auth/node";
import type { NextFunction, Request, Response } from "express";

export type WorkspaceRequest = Request & {
	crmSession?: Session | null;
	crmWorkspaceId?: string | null;
};

export async function resolveWorkspaceFor(
	session: Session,
): Promise<string | null> {
	const [first] = await workspaceIdsForUser(session.user.id);
	return first ?? null;
}

export async function workspaceContextMiddleware(
	req: WorkspaceRequest,
	_res: Response,
	next: NextFunction,
): Promise<void> {
	const session = await auth.api
		.getSession({ headers: fromNodeHeaders(req.headers) })
		.catch(() => null);
	req.crmSession = session;
	const workspaceId = session ? await resolveWorkspaceFor(session) : null;
	req.crmWorkspaceId = workspaceId;
	if (workspaceId) {
		runInWorkspace(workspaceId, next);
	} else {
		next();
	}
}

import { pgPool } from "../src/client";
import { WORKSPACE_ID } from "../src/workspace";
import {
	adoptLegacyWorkspace,
	ensureWorkspaceSchemas,
} from "../src/workspaces";

const adopted = await adoptLegacyWorkspace(WORKSPACE_ID);
console.log(
	adopted
		? `Moved the existing workspace data into its own schema (${WORKSPACE_ID}).`
		: "No legacy workspace data in public.",
);
const created = await ensureWorkspaceSchemas();
console.log(
	created.length > 0
		? `Provisioned schemas for: ${created.join(", ")}`
		: "Every workspace already has a schema.",
);
await pgPool.end();

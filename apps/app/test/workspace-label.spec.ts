import { describe, expect, it } from "bun:test";
import { DEFAULT_WORKSPACE_NAME } from "@crm/auth";
import { workspaceLabel } from "../lib/workspace-label";

describe("what the header calls this install", () => {
	it("shows the product name before anybody has named the workspace", () => {
		expect(workspaceLabel(DEFAULT_WORKSPACE_NAME)).toBe("Threadline");
	});

	it("shows the product name while the workspace is still loading", () => {
		expect(workspaceLabel(undefined)).toBe("Threadline");
		expect(workspaceLabel("")).toBe("Threadline");
		expect(workspaceLabel("   ")).toBe("Threadline");
	});

	it("names the company once it has one", () => {
		expect(workspaceLabel("Acme")).toBe("Acme");
		expect(workspaceLabel("  Acme  ")).toBe("Acme");
	});

	it("keeps a company name that happens to contain CRM", () => {
		expect(workspaceLabel("Acme CRM")).toBe("Acme CRM");
		expect(workspaceLabel("CRMSoft")).toBe("CRMSoft");
	});
});

const MINUTE_MS = 60_000;

export const FORM_LIMITS = {
	perIpWindowMs: MINUTE_MS,
	perIpPerWindow: 5,
	perWorkspacePerDay: 100,
	maxBodyBytes: 32_000,
} as const;

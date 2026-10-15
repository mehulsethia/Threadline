const TRUTHY = new Set(["1", "true", "yes", "on"]);

export const DISABLE_VARIABLES = ["CRM_TELEMETRY_DISABLED", "DO_NOT_TRACK"];

export function telemetryDisabled(
	_env: Record<string, string | undefined> = process.env,
): boolean {
	return true;
}

function isTruthy(value: string | undefined): boolean {
	return TRUTHY.has((value ?? "").trim().toLowerCase());
}

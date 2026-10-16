const TRUTHY = new Set(["1", "true", "yes", "on"]);

export const DISABLE_VARIABLES = ["CRM_TELEMETRY_DISABLED", "DO_NOT_TRACK"];

/**
 * The upstream project's PostHog belongs to Comp AI, so in Threadline usage
 * telemetry is opt-in: nothing is sent unless CRM_TELEMETRY_ENABLED says yes,
 * and either disable variable still wins.
 */
export const ENABLE_VARIABLE = "CRM_TELEMETRY_ENABLED";

export function telemetryDisabled(
	env: Record<string, string | undefined> = process.env,
): boolean {
	if (env.NODE_ENV === "test") return true;
	if (!isTruthy(env[ENABLE_VARIABLE])) return true;
	return DISABLE_VARIABLES.some((name) => isTruthy(env[name]));
}

function isTruthy(value: string | undefined): boolean {
	return TRUTHY.has((value ?? "").trim().toLowerCase());
}

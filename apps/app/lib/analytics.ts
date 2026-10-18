export const ANALYTICS_HOSTS: readonly string[] = [];

export function analyticsAllowed(hostname: string): boolean {
	return ANALYTICS_HOSTS.includes(hostname.trim().toLowerCase());
}

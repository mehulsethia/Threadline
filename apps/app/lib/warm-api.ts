// The API scales to zero on Cloud Run. A cheap health probe wakes it (and its
// database pool) while the rep is still reading the deal, so the voice
// qualifier's WebSocket does not pay the cold start. Same-origin through the
// app's /api proxy, fire-and-forget, at most once per window.
const WARM_WINDOW_MS = 60_000;

let lastWarmAt = 0;

export function warmApi(): void {
	if (globalThis.window === undefined) return;

	const now = Date.now();
	if (now - lastWarmAt < WARM_WINDOW_MS) return;
	lastWarmAt = now;

	void fetch("/api/health", { cache: "no-store", keepalive: true }).catch(
		() => {
			// A failed probe only means the next real request warms it instead.
			lastWarmAt = 0;
		},
	);
}

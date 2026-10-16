// Server-side target for the /api proxy and server tRPC calls. On Cloud Run the
// API's own URL is set at runtime (API_INTERNAL_URL), while the browser only
// ever talks to this app's origin.
export const API_URL =
	process.env.API_INTERNAL_URL ??
	process.env.NEXT_PUBLIC_API_URL ??
	"http://localhost:3001";

export function isMarketing(): boolean {
	return process.env.IS_MARKETING === "true";
}

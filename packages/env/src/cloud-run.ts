/**
 * Service-to-service auth for Cloud Run. When AGENT_IAM_AUDIENCE is set (the
 * agent's Cloud Run URL), calls to the agent carry a Google-signed ID token
 * for this service's own identity in `X-Serverless-Authorization`. Cloud Run
 * checks it at the edge and passes the request's own Authorization header
 * (the bridge secret or JWT) through untouched. Locally nothing is added.
 */
const METADATA_IDENTITY =
	"http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity";

// Tokens live an hour; refresh well before that.
const REFRESH_MS = 45 * 60 * 1000;

let cached: { audience: string; token: string; fetchedAt: number } | null =
	null;

export async function cloudRunAuthHeaders(): Promise<Record<string, string>> {
	const audience = process.env.AGENT_IAM_AUDIENCE?.trim();
	if (!audience) return {};

	if (
		!cached ||
		cached.audience !== audience ||
		Date.now() - cached.fetchedAt > REFRESH_MS
	) {
		const response = await fetch(
			`${METADATA_IDENTITY}?audience=${encodeURIComponent(audience)}`,
			{ headers: { "Metadata-Flavor": "Google" } },
		);
		if (!response.ok) {
			throw new Error(
				`Metadata server refused an ID token (${response.status}).`,
			);
		}
		cached = { audience, token: await response.text(), fetchedAt: Date.now() };
	}

	return { "X-Serverless-Authorization": `Bearer ${cached.token}` };
}

import ContextDev from "context.dev";
import { APIError } from "context.dev/core/error";
import { z } from "zod";
import { contextDevKey } from "./capabilities";
import { CONTEXT } from "./context-config";

export type JsonSchema = {
	type?:
		| "array"
		| "boolean"
		| "integer"
		| "null"
		| "number"
		| "object"
		| "string";
	description?: string;
	properties?: Record<string, JsonSchema>;
	items?: JsonSchema;
	required?: string[];
	enum?: (string | number | boolean | null)[];
	additionalProperties?: boolean | JsonSchema;
};

export type Brand = {
	domain?: string | null;
	title?: string | null;
	description?: string | null;
	slogan?: string | null;
	email?: string | null;
	phone?: string | null;
	colors?: { hex?: string | null; name?: string | null }[] | null;
	logos?:
		| {
				url?: string | null;
				mode?: string | null;
				type?: string | null;
				colors?: { hex?: string | null; name?: string | null }[] | null;
		  }[]
		| null;
	socials?: { type?: string | null; url?: string | null }[] | null;
	address?: {
		city?: string | null;
		state_code?: string | null;
		country?: string | null;
		country_code?: string | null;
	} | null;
	industries?: {
		eic?: { industry?: string | null; subindustry?: string | null }[] | null;
	} | null;
	links?: {
		pricing?: string | null;
		careers?: string | null;
	} | null;
};

export type LookupResult =
	| { outcome: "found"; brand: Brand; raw: unknown }
	| { outcome: "skipped"; reason: string }
	| { outcome: "failed"; reason: string; retryable: boolean };

export type SearchResult = {
	url: string | null;
	title: string | null;
	description: string | null;
	markdown: string | null;
};

let client: { key: string; api: ContextDev } | null = null;

export async function contextDev(): Promise<ContextDev | null> {
	const key = await contextDevKey();

	if (!key) {
		client = null;
		return null;
	}

	if (client?.key !== key) {
		client = { key, api: new ContextDev({ apiKey: key, maxRetries: 0 }) };
	}

	return client.api;
}

let active = 0;
let lastStartedAt = 0;
const waiting: (() => void)[] = [];

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

async function acquire(): Promise<void> {
	if (active >= CONTEXT.rate.maxConcurrent) {
		await new Promise<void>((resolve) => waiting.push(resolve));
	}
	active += 1;
	const gap = lastStartedAt + CONTEXT.rate.minGapMs - Date.now();
	if (gap > 0) await sleep(gap);
	lastStartedAt = Date.now();
}

function release(): void {
	active -= 1;
	waiting.shift()?.();
}

function rateLimited(error: unknown): error is APIError {
	return error instanceof APIError && error.status === 429;
}

function retryDelayMs(error: APIError, attempt: number): number {
	const header = error.headers?.get?.("retry-after");
	const seconds = header ? Number(header) : Number.NaN;
	const backoff = CONTEXT.rate.backoffMs * 2 ** attempt;
	return Math.min(
		Number.isFinite(seconds) && seconds > 0 ? seconds * 1_000 : backoff,
		CONTEXT.rate.maxBackoffMs,
	);
}

export async function throttled<T>(call: () => Promise<T>): Promise<T> {
	for (let attempt = 0; ; attempt += 1) {
		await acquire();
		let delay = 0;
		try {
			return await call();
		} catch (error) {
			if (!rateLimited(error) || attempt >= CONTEXT.rate.retries) throw error;
			delay = retryDelayMs(error, attempt);
			console.warn(
				`[context.dev] Rate limited; retrying in ${Math.round(delay / 1_000)}s (attempt ${attempt + 1} of ${CONTEXT.rate.retries}).`,
			);
		} finally {
			release();
		}
		await sleep(delay);
	}
}

export async function contextDevEnabled(): Promise<boolean> {
	return (await contextDevKey()) !== null;
}

export type KeyCheck =
	| { outcome: "valid" }
	| { outcome: "invalid"; reason: string }
	| { outcome: "unknown"; reason: string };

/**
 * A free-provider address is refused with a documented 422 before any brand is
 * resolved, and a lookup that resolves nothing is not billed — so this proves
 * the key authenticates without spending a credit.
 */
const PROBE_EMAIL = "key-check@gmail.com";

export async function verifyKey(key: string): Promise<KeyCheck> {
	const api = new ContextDev({ apiKey: key, maxRetries: 0 });

	try {
		await throttled(() =>
			api.brand.retrieve({
				type: "by_email",
				email: PROBE_EMAIL,
				timeoutMS: CONTEXT.verifyTimeoutMs,
			}),
		);

		return { outcome: "valid" };
	} catch (error) {
		return classifyKey(error);
	}
}

export function classifyKey(cause: unknown): KeyCheck {
	if (!(cause instanceof APIError)) {
		return { outcome: "unknown", reason: describe(cause) };
	}

	if (cause.status === undefined) {
		return { outcome: "unknown", reason: describe(cause) };
	}

	if (cause.status === 401 && !recognisedKeyFailure(cause)) {
		return {
			outcome: "invalid",
			reason: "Context did not recognise that API key.",
		};
	}

	return { outcome: "valid" };
}

export async function brandByDomain(
	domain: string,
	maxAgeMs?: number,
): Promise<LookupResult> {
	const params = {
		type: "by_domain",
		domain,
		timeoutMS: CONTEXT.timeoutMs,
	} as const;

	return lookup(maxAgeMs === undefined ? params : { ...params, maxAgeMs });
}

export async function brandByEmail(email: string): Promise<LookupResult> {
	return lookup({ type: "by_email", email, timeoutMS: CONTEXT.timeoutMs });
}

export async function prefetch(domain: string): Promise<void> {
	const api = await contextDev();
	if (!api) return;

	try {
		await throttled(() =>
			api.utility.prefetch({ type: "brand", identifier: { domain } }),
		);
	} catch {}
}

export async function extract(
	url: string,
	schema: JsonSchema,
	instructions: string,
): Promise<
	{ outcome: "found"; data: unknown } | { outcome: "failed"; reason: string }
> {
	const api = await contextDev();
	if (!api) {
		return { outcome: "failed", reason: "Context.dev is not configured." };
	}

	try {
		const response = await throttled(() =>
			api.web.extract({
				url,
				schema,
				instructions,
				maxPages: 8,
				timeoutMS: CONTEXT.timeoutMs,
			}),
		);
		return { outcome: "found", data: response.data };
	} catch (error) {
		return { outcome: "failed", reason: describe(error) };
	}
}

export async function search(
	query: string,
	options: { limit?: number; excludeDomains?: string[] } = {},
): Promise<
	| { outcome: "found"; results: SearchResult[] }
	| { outcome: "failed"; reason: string }
> {
	const api = await contextDev();
	if (!api) {
		return { outcome: "failed", reason: "Context.dev is not configured." };
	}

	const params = {
		query,
		numResults: Math.max(options.limit ?? 10, 10),
		markdownOptions: { enabled: true },
	};

	try {
		const response = await throttled(() =>
			api.web.search(
				options.excludeDomains
					? { ...params, excludeDomains: options.excludeDomains }
					: params,
			),
		);

		const results = (response.results ?? []).map((result) => ({
			url: result.url ?? null,
			title: result.title ?? null,
			description: result.description ?? null,
			markdown:
				result.markdown?.code === "SUCCESS"
					? (result.markdown.markdown ?? null)
					: null,
		}));

		return { outcome: "found", results };
	} catch (error) {
		return { outcome: "failed", reason: describe(error) };
	}
}

let creditTracker = {
	day: new Date().toISOString().slice(0, 10),
	used: 0,
};

function checkAndResetDay(): void {
	const today = new Date().toISOString().slice(0, 10);
	if (creditTracker.day !== today) {
		creditTracker = { day: today, used: 0 };
	}
}

export function getDailyCreditCap(): number {
	const raw = process.env.CONTEXT_DAILY_CREDIT_CAP;
	if (!raw) return 100;
	const parsed = Number.parseInt(raw, 10);
	return Number.isFinite(parsed) && parsed > 0 ? parsed : 100;
}

export function getCreditsUsedToday(): number {
	checkAndResetDay();
	return creditTracker.used;
}

export function canSpendCredits(cost: number): boolean {
	checkAndResetDay();
	return creditTracker.used + cost <= getDailyCreditCap();
}

export function recordCreditUsage(cost: number): void {
	checkAndResetDay();
	creditTracker.used += cost;
}

async function lookup(
	params: Parameters<ContextDev["brand"]["retrieve"]>[0],
): Promise<LookupResult> {
	const api = await contextDev();
	if (!api) {
		return { outcome: "skipped", reason: "Context.dev is not configured." };
	}

	const cap = getDailyCreditCap();
	if (!canSpendCredits(10)) {
		console.log(
			`[context.dev] Daily credit cap of ${cap} reached (${getCreditsUsedToday()}/${cap} used today). Skipping lookup.`,
		);
		return {
			outcome: "skipped",
			reason: "Daily Context.dev credit cap reached.",
		};
	}

	try {
		const response = await throttled(() => api.brand.retrieve(params));
		recordCreditUsage(10);
		console.log(
			`[context.dev] Used 10 credits (${getCreditsUsedToday()}/${cap} today).`,
		);
		const brand = response.brand as Brand | undefined;

		if (!brand) return { outcome: "skipped", reason: "No brand matched." };

		return { outcome: "found", brand, raw: response };
	} catch (error) {
		return classify(error);
	}
}

function classify(cause: unknown): LookupResult {
	if (!(cause instanceof APIError)) {
		return { outcome: "failed", reason: describe(cause), retryable: true };
	}

	const code = errorCode(cause);

	if (cause.status === 400) {
		if (code === "NOT_FOUND" || code === "WEBSITE_ACCESS_ERROR") {
			return {
				outcome: "skipped",
				reason:
					code === "NOT_FOUND"
						? "No brand matched this domain."
						: "The site could not be reached.",
			};
		}
		return { outcome: "failed", reason: describe(cause), retryable: false };
	}

	if (cause.status === 422) {
		return {
			outcome: "skipped",
			reason: "That is a personal or disposable email address.",
		};
	}

	if (cause.status === 401 || cause.status === 403) {
		return { outcome: "failed", reason: describe(cause), retryable: false };
	}

	if (cause.status === 408 || cause.status === 429) {
		return { outcome: "failed", reason: describe(cause), retryable: true };
	}

	return {
		outcome: "failed",
		reason: describe(cause),
		retryable: (cause.status ?? 500) >= 500,
	};
}

const apiErrorBody = z
	.object({
		error_code: z.string().optional().catch(undefined),
		message: z.string().optional().catch(undefined),
	})
	.catch({});

function errorCode(error: APIError): string | undefined {
	return apiErrorBody.parse(error.error).error_code;
}

function recognisedKeyFailure(error: APIError): boolean {
	const body = apiErrorBody.parse(error.error);
	const detail = [body.error_code, body.message, error.message]
		.filter((value) => value !== undefined)
		.join(" ");

	return /(usage|credit|quota|allowance|billing|rate.?limit|limit.?exceeded|insufficient.?permission)/i.test(
		detail,
	);
}

export function describe(cause: unknown): string {
	if (cause instanceof APIError) {
		return `${cause.status ?? "?"} ${errorCode(cause) ?? cause.message}`;
	}
	return cause instanceof Error ? cause.message : String(cause);
}

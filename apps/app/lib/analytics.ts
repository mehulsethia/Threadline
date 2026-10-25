const DEFAULT_GOOGLE_ANALYTICS_ID = "G-RFX7FPVW6Z";

const configuredGoogleAnalyticsId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;

export const GOOGLE_ANALYTICS_ID =
	configuredGoogleAnalyticsId === undefined
		? DEFAULT_GOOGLE_ANALYTICS_ID
		: configuredGoogleAnalyticsId.trim();
export const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY?.trim() ?? "";
export const POSTHOG_HOST =
	process.env.NEXT_PUBLIC_POSTHOG_HOST?.trim() || "https://us.i.posthog.com";

export type AnalyticsEventName =
	| "page_view"
	| "scroll_depth"
	| "user_interaction";

export type AnalyticsEventParameters = {
	page_location: string;
	page_path: string;
	page_referrer: string;
	page_title: string;
	interaction_type?: "change" | "click" | "submit";
	element_type?:
		| "button"
		| "form"
		| "input"
		| "link"
		| "other"
		| "select"
		| "textarea";
	percent_scrolled?: number;
};

export type AnalyticsPageParameters = Pick<
	AnalyticsEventParameters,
	"page_location" | "page_path" | "page_referrer" | "page_title"
>;

export type AnalyticsEvent = {
	name: AnalyticsEventName;
	parameters: Readonly<AnalyticsEventParameters>;
};

export type AnalyticsProvider = {
	name: string;
	capture: (event: AnalyticsEvent) => void;
};

export function captureWithProviders(
	event: AnalyticsEvent,
	providers: readonly AnalyticsProvider[],
): void {
	for (const provider of providers) {
		try {
			provider.capture(event);
		} catch (error) {
			console.error(`Analytics provider "${provider.name}" failed.`, error);
		}
	}
}

const PUBLIC_ROUTES = new Set([
	"f",
	"grant-access",
	"onboarding",
	"privacy",
	"sign-in",
	"terms",
]);

const STATIC_ROUTES = new Set([
	"api-keys",
	"agents",
	"ask",
	"chat",
	"companies",
	"connect",
	"connections",
	"context-dev",
	"contacts",
	"currencies",
	"deals",
	"forms",
	"google",
	"insights",
	"intake",
	"members",
	"microsoft",
	"onboarding",
	"people",
	"profile",
	"recorders",
	"research",
	"revival",
	"settings",
	"slack",
	"sso",
	"tracking",
]);

const APP_ROOT_ROUTES = new Set([
	"agents",
	"ask",
	"chat",
	"companies",
	"contacts",
	"deals",
	"insights",
	"revival",
	"settings",
]);

const DYNAMIC_ROUTE_PARAMETERS: Readonly<Record<string, string>> = {
	agents: ":agent",
	chat: ":chat",
	companies: ":company",
	contacts: ":contact",
	deals: ":deal",
};

export function sanitizeAnalyticsPath(pathname: string): string {
	const cleanPath = pathname.split(/[?#]/, 1)[0] ?? "";
	const segments = cleanPath.split("/").filter(Boolean);

	if (segments.length === 0) return "/";
	if (segments[0] === "f") {
		return segments.length >= 3 ? "/f/:site/:form" : "/f";
	}

	const isAppRoute = APP_ROOT_ROUTES.has(segments[1] ?? "");
	const isPublicRoute = PUBLIC_ROUTES.has(segments[0] ?? "") && !isAppRoute;
	const safeSegments = segments.map((segment, index) => {
		if (index === 0 && !isPublicRoute) return ":workspace";
		if (index === 0) return segment;

		const parameter = DYNAMIC_ROUTE_PARAMETERS[segments[index - 1] ?? ""];
		if (parameter) return parameter;

		return STATIC_ROUTES.has(segment) ? segment : ":page";
	});

	return `/${safeSegments.join("/")}`;
}

export function createAnalyticsPageParameters(
	pathname: string,
	origin: string,
	pageReferrer: string,
): AnalyticsPageParameters {
	const pagePath = sanitizeAnalyticsPath(pathname);

	return {
		page_location: `${origin}${pagePath}`,
		page_path: pagePath,
		page_referrer: pageReferrer,
		page_title: `Threadline | ${pagePath}`,
	};
}

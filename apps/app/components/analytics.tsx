"use client";

import { useMountEffect } from "@crm/ui/hooks/use-mount-effect";
import { usePathname } from "next/navigation";
import Script from "next/script";
import {
	type AnalyticsEvent,
	type AnalyticsEventParameters,
	type AnalyticsPageParameters,
	type AnalyticsProvider,
	captureWithProviders,
	createAnalyticsPageParameters,
	GOOGLE_ANALYTICS_ID,
} from "@/lib/analytics";
import { posthogAnalyticsProvider } from "@/lib/analytics/posthog";

declare global {
	interface Window {
		dataLayer?: unknown[][];
		gtag?: (...args: unknown[]) => void;
		threadlineGoogleAnalyticsInitialized?: boolean;
		threadlineGoogleAnalyticsState?: "failed" | "loading" | "ready";
	}
}

type InteractionParameters = {
	interaction_type: "change" | "click" | "submit";
	element_type:
		| "button"
		| "form"
		| "input"
		| "link"
		| "other"
		| "select"
		| "textarea";
};

const SCROLL_DEPTH_THRESHOLDS = [25, 50, 75, 90] as const;
const seenScrollDepths = new Set<number>();
let activePage: AnalyticsPageParameters | null = null;

function initializeGoogleAnalytics(page: AnalyticsPageParameters): void {
	if (
		!GOOGLE_ANALYTICS_ID ||
		window.threadlineGoogleAnalyticsInitialized ||
		window.threadlineGoogleAnalyticsState === "failed"
	) {
		return;
	}

	window.dataLayer ??= [];
	window.gtag ??= (...args: unknown[]) => {
		window.dataLayer?.push(args);
	};

	window.gtag("consent", "default", {
		ad_personalization: "denied",
		ad_storage: "denied",
		ad_user_data: "denied",
		analytics_storage: "granted",
		security_storage: "granted",
	});
	window.gtag("js", new Date());
	window.gtag("config", GOOGLE_ANALYTICS_ID, {
		allow_ad_personalization_signals: false,
		allow_google_signals: false,
		page_location: page.page_location,
		page_referrer: page.page_referrer,
		page_title: page.page_title,
		send_page_view: false,
	});

	window.threadlineGoogleAnalyticsState ??= "loading";
	window.threadlineGoogleAnalyticsInitialized = true;
}

function initialReferrer(): string {
	try {
		return document.referrer ? new URL(document.referrer).origin : "";
	} catch {
		return "";
	}
}

function getElementType(
	element: Element | null,
): InteractionParameters["element_type"] {
	if (element instanceof HTMLButtonElement) return "button";
	if (element instanceof HTMLAnchorElement) return "link";
	if (element instanceof HTMLInputElement) return "input";
	if (element instanceof HTMLSelectElement) return "select";
	if (element instanceof HTMLTextAreaElement) return "textarea";
	if (element instanceof HTMLFormElement) return "form";

	const role = element?.getAttribute("role");
	if (role === "button") return "button";
	if (role === "link") return "link";
	return "other";
}

const googleAnalyticsProvider: AnalyticsProvider = {
	name: "google-analytics",
	capture(event: AnalyticsEvent): void {
		if (
			process.env.NODE_ENV !== "production" ||
			!GOOGLE_ANALYTICS_ID ||
			window.threadlineGoogleAnalyticsState === "failed"
		) {
			return;
		}

		const page: AnalyticsPageParameters = {
			page_location: event.parameters.page_location,
			page_path: event.parameters.page_path,
			page_referrer: event.parameters.page_referrer,
			page_title: event.parameters.page_title,
		};
		initializeGoogleAnalytics(page);
		window.gtag?.("set", page);
		window.gtag?.("event", event.name, { ...event.parameters });
	},
};

const ANALYTICS_PROVIDERS = [
	googleAnalyticsProvider,
	posthogAnalyticsProvider,
] as const;

function sendEvent(
	name: AnalyticsEvent["name"],
	pathname: string,
	parameters: Partial<
		Pick<
			AnalyticsEventParameters,
			"element_type" | "interaction_type" | "percent_scrolled"
		>
	> = {},
): void {
	if (process.env.NODE_ENV !== "production") return;

	const page =
		name === "page_view" || !activePage
			? createAnalyticsPageParameters(
					pathname,
					window.location.origin,
					activePage?.page_location ?? initialReferrer(),
				)
			: activePage;
	captureWithProviders(
		{ name, parameters: { ...page, ...parameters } },
		ANALYTICS_PROVIDERS,
	);

	if (name === "page_view") {
		activePage = page;
		seenScrollDepths.clear();
	}
}

function ActivityTracker() {
	useMountEffect(() => {
		if (process.env.NODE_ENV !== "production") return;

		const handleClick = (event: MouseEvent) => {
			const target = event.target instanceof Element ? event.target : null;
			sendEvent("user_interaction", window.location.pathname, {
				element_type: getElementType(target),
				interaction_type: "click",
			});
		};

		const handleChange = (event: Event) => {
			const target = event.target;
			if (
				target instanceof HTMLInputElement &&
				["file", "hidden", "password"].includes(target.type)
			) {
				return;
			}
			if (
				!(target instanceof HTMLInputElement) &&
				!(target instanceof HTMLSelectElement) &&
				!(target instanceof HTMLTextAreaElement)
			) {
				return;
			}

			sendEvent("user_interaction", window.location.pathname, {
				element_type: getElementType(target),
				interaction_type: "change",
			});
		};

		const handleSubmit = (event: SubmitEvent) => {
			const target = event.target;
			if (!(target instanceof HTMLFormElement)) return;
			sendEvent("user_interaction", window.location.pathname, {
				element_type: "form",
				interaction_type: "submit",
			});
		};

		const handleScroll = () => {
			const scrollableHeight =
				document.documentElement.scrollHeight - window.innerHeight;
			if (scrollableHeight <= 0) return;

			const percentScrolled = Math.floor(
				(window.scrollY / scrollableHeight) * 100,
			);
			for (const threshold of SCROLL_DEPTH_THRESHOLDS) {
				if (percentScrolled < threshold || seenScrollDepths.has(threshold)) {
					continue;
				}
				seenScrollDepths.add(threshold);
				sendEvent("scroll_depth", window.location.pathname, {
					percent_scrolled: threshold,
				});
			}
		};

		document.addEventListener("click", handleClick, true);
		document.addEventListener("change", handleChange, true);
		document.addEventListener("submit", handleSubmit, true);
		window.addEventListener("scroll", handleScroll, { passive: true });

		return () => {
			document.removeEventListener("click", handleClick, true);
			document.removeEventListener("change", handleChange, true);
			document.removeEventListener("submit", handleSubmit, true);
			window.removeEventListener("scroll", handleScroll);
		};
	});

	return null;
}

function PageView({ pathname }: { pathname: string }) {
	useMountEffect(() => {
		sendEvent("page_view", pathname);
	});

	return null;
}

export function Analytics() {
	const pathname = usePathname();

	if (process.env.NODE_ENV !== "production" || !pathname) return null;

	const handleScriptLoad = () => {
		window.threadlineGoogleAnalyticsState = "ready";
	};

	const handleScriptError = (error: Error) => {
		window.threadlineGoogleAnalyticsState = "failed";
		window.dataLayer = [];
		console.error("Google Analytics failed to load.", error);
	};

	return (
		<>
			{GOOGLE_ANALYTICS_ID && (
				<Script
					onError={handleScriptError}
					onLoad={handleScriptLoad}
					src={`https://www.googletagmanager.com/gtag/js?id=${GOOGLE_ANALYTICS_ID}`}
					strategy="afterInteractive"
					id="threadline-google-analytics"
				/>
			)}
			<ActivityTracker />
			<PageView key={pathname} pathname={pathname} />
		</>
	);
}

import {
	type AnalyticsEvent,
	type AnalyticsProvider,
	POSTHOG_HOST,
	POSTHOG_KEY,
} from "@/lib/analytics";

const ALLOWED_POSTHOG_PROPERTIES = new Set([
	"element_type",
	"interaction_type",
	"page_location",
	"page_path",
	"page_referrer",
	"page_title",
	"percent_scrolled",
]);

let posthogLoader: Promise<typeof import("posthog-js").default | null> | null =
	null;

function loadPostHog(): Promise<typeof import("posthog-js").default | null> {
	if (!POSTHOG_KEY) return Promise.resolve(null);
	if (posthogLoader) return posthogLoader;

	posthogLoader = import("posthog-js")
		.then(({ default: posthog }) => {
			posthog.init(POSTHOG_KEY, {
				api_host: POSTHOG_HOST,
				autocapture: false,
				before_send: (event) => {
					if (!event) return null;
					const properties = Object.fromEntries(
						Object.entries(event.properties ?? {}).filter(([name]) =>
							ALLOWED_POSTHOG_PROPERTIES.has(name),
						),
					);

					return { ...event, properties };
				},
				capture_pageleave: false,
				capture_pageview: false,
				disable_persistence: true,
				disable_session_recording: true,
				person_profiles: "never",
			});

			return posthog;
		})
		.catch((error: unknown) => {
			console.error("PostHog failed to load.", error);
			return null;
		});

	return posthogLoader;
}

export const posthogAnalyticsProvider: AnalyticsProvider = {
	name: "posthog",
	capture(event: AnalyticsEvent): void {
		void loadPostHog().then((posthog) => {
			try {
				posthog?.capture(event.name, { ...event.parameters });
			} catch (error) {
				console.error("PostHog failed to capture an event.", error);
			}
		});
	},
};

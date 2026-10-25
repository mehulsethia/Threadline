import { describe, expect, it } from "bun:test";
import {
	type AnalyticsEvent,
	type AnalyticsProvider,
	captureWithProviders,
	createAnalyticsPageParameters,
	sanitizeAnalyticsPath,
} from "../lib/analytics";

describe("createAnalyticsPageParameters", () => {
	it("uses the new sanitized route and the previous route as referrer", () => {
		const previousPage = createAnalyticsPageParameters(
			"/acme/contacts/cnt_123",
			"https://threadline.example",
			"",
		);
		const nextPage = createAnalyticsPageParameters(
			"/acme/deals/dl_456",
			"https://threadline.example",
			previousPage.page_location,
		);

		expect(nextPage).toEqual({
			page_location: "https://threadline.example/:workspace/deals/:deal",
			page_path: "/:workspace/deals/:deal",
			page_referrer: previousPage.page_location,
			page_title: "Threadline | /:workspace/deals/:deal",
		});
	});
});

describe("sanitizeAnalyticsPath", () => {
	it("keeps static public paths", () => {
		expect(sanitizeAnalyticsPath("/privacy")).toBe("/privacy");
		expect(sanitizeAnalyticsPath("/onboarding/profile")).toBe(
			"/onboarding/profile",
		);
	});

	it("removes workspace and record identifiers", () => {
		expect(sanitizeAnalyticsPath("/acme/contacts/cnt_123")).toBe(
			"/:workspace/contacts/:contact",
		);
		expect(sanitizeAnalyticsPath("/acme/deals/dl_456")).toBe(
			"/:workspace/deals/:deal",
		);
	});

	it("removes form identifiers and query strings", () => {
		expect(sanitizeAnalyticsPath("/f/site_123/form_456?email=private")).toBe(
			"/f/:site/:form",
		);
	});

	it("does not treat workspace slugs as public routes", () => {
		expect(sanitizeAnalyticsPath("/privacy/contacts/cnt_789")).toBe(
			"/:workspace/contacts/:contact",
		);
	});

	it("replaces unrecognized path segments", () => {
		expect(sanitizeAnalyticsPath("/acme/settings/secret")).toBe(
			"/:workspace/settings/:page",
		);
	});
});

describe("captureWithProviders", () => {
	it("sends each event to every configured provider", () => {
		const events: AnalyticsEvent[] = [];
		const providers: AnalyticsProvider[] = [
			{ name: "first", capture: (event) => events.push(event) },
			{ name: "second", capture: (event) => events.push(event) },
		];
		const event: AnalyticsEvent = {
			name: "page_view",
			parameters: {
				page_location: "https://example.com/:workspace/contacts",
				page_path: "/:workspace/contacts",
				page_referrer: "",
				page_title: "Threadline | /:workspace/contacts",
			},
		};

		captureWithProviders(event, providers);

		expect(events).toEqual([event, event]);
	});
});

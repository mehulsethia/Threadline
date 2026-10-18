export const CONNECTION_SYNC_COPY = {
	google: {
		connected: {
			title: "Google connected",
			description:
				"Threadline is reading your meetings for the next 180 days and Meet transcripts from the last 2 days. New email is captured from now on, every 15 minutes.",
		},
		checking: "Checking Gmail, Calendar and Meet for anything new",
		checked: {
			title: "Check finished",
			description:
				"New conversations become contacts, deals and facts in the background. They appear within a few minutes.",
		},
	},
	meet: {
		connected: {
			title: "Meet transcripts are on",
			description:
				"Threadline is reading transcripts from the last 2 days now, then checks every 15 minutes.",
		},
	},
	slack: {
		connected: {
			title: "Slack connected",
			description:
				"Threadline is reading the last 24 hours in up to 20 channels the app is in. New messages arrive as they are posted.",
		},
		checking: "Reading the last 24 hours of Slack",
	},
	recorders: {
		connected: (name: string) => ({
			title: `${name} connected`,
			description: `Threadline is fetching ${name} transcripts from the last 3 days now, then checks every hour.`,
		}),
		checking: "Checking Fireflies and Fathom for new transcripts",
		checked: {
			title: "Check started",
			description:
				"New transcripts become facts and deals in the background. They appear within a few minutes.",
		},
	},
} as const;

export const CONNECTED_PARAM = "connected";

export type ConnectedNoticeKey = "google" | "meet" | "slack";

export const REPO_URL = "https://github.com/mehulsethia/Threadline";

export const SECTION_LINKS = [
	{ label: "How it works", href: "/#how-it-works" },
	{ label: "Agents", href: "/#agents" },
	{ label: "Google Cloud", href: "/#google-cloud" },
	{ label: "FAQ", href: "/#faq" },
] as const;

export const PROJECT_LINKS = [
	{ label: "GitHub", href: REPO_URL },
	{ label: "License", href: `${REPO_URL}/blob/main/LICENSE` },
	{ label: "Privacy", href: "/privacy" },
	{ label: "Terms", href: "/terms" },
] as const;

import "@crm/ui/globals.css";
import { Toaster } from "@crm/ui/components/sonner";
import { TooltipProvider } from "@crm/ui/components/tooltip";
import { cn } from "@crm/ui/lib/utils";
import type { Metadata } from "next";
import { Hanken_Grotesk, JetBrains_Mono, Newsreader } from "next/font/google";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { LocalDateTimeHydrator } from "@/components/local-date-time";
import { ThemeProvider } from "@/components/theme-provider";
import { TRPCReactProvider } from "@/lib/trpc/client";

const fontSans = Hanken_Grotesk({
	variable: "--font-body",
	subsets: ["latin"],
});

const fontDisplay = Newsreader({
	variable: "--font-display",
	subsets: ["latin"],
	style: ["normal", "italic"],
});

const fontMono = JetBrains_Mono({
	variable: "--font-code",
	subsets: ["latin"],
});

export const metadata: Metadata = {
	title: {
		default: "Threadline",
		template: "%s · Threadline",
	},
	description:
		"Threadline is an agentic CRM that turns sales conversations in any language into evidence-backed records, then follows up on every deal.",
	icons: {
		icon: [
			{ url: "/favicon.svg", type: "image/svg+xml" },
			{ url: "/favicon-96x96.png", type: "image/png", sizes: "96x96" },
		],
		apple: "/apple-touch-icon.png",
	},
	manifest: "/site.webmanifest",
};

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<html
			lang="en"
			suppressHydrationWarning
			className={cn(
				fontSans.variable,
				fontDisplay.variable,
				fontMono.variable,
				"h-full antialiased",
			)}
		>
			<body className="flex min-h-full flex-col font-sans">
				<a
					href="#main"
					className="fixed top-[-4rem] left-4 z-50 rounded-md bg-primary px-4 py-3 text-primary-foreground focus-visible:top-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
				>
					Skip to content
				</a>
				<NuqsAdapter>
					<TRPCReactProvider>
						<ThemeProvider>
							<TooltipProvider>{children}</TooltipProvider>
							<Toaster richColors />
						</ThemeProvider>
					</TRPCReactProvider>
				</NuqsAdapter>
				<LocalDateTimeHydrator />
			</body>
		</html>
	);
}

import "@crm/ui/globals.css";
import { Toaster } from "@crm/ui/components/sonner";
import { TooltipProvider } from "@crm/ui/components/tooltip";
import { cn } from "@crm/ui/lib/utils";
import type { Metadata } from "next";
import { Roboto, Roboto_Flex, Roboto_Mono } from "next/font/google";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { LocalDateTimeHydrator } from "@/components/local-date-time";
import { ThemeProvider } from "@/components/theme-provider";
import { TRPCReactProvider } from "@/lib/trpc/client";

const fontSans = Roboto({
	weight: ["400", "500", "700"],
	variable: "--font-roboto",
	subsets: ["latin"],
});

const fontDisplay = Roboto_Flex({
	variable: "--font-roboto-flex",
	subsets: ["latin"],
});

const fontMono = Roboto_Mono({
	weight: ["400", "500", "700"],
	variable: "--font-roboto-mono",
	subsets: ["latin"],
});

export const metadata: Metadata = {
	title: {
		default: "Threadline",
		template: "%s · Threadline",
	},
	description: "Your conversations, turned into closed deals.",
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

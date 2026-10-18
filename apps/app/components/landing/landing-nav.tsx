import { Button } from "@crm/ui/components/button";
import Link from "next/link";
import { DemoLaunchButton } from "@/components/demo-launch-button";
import { SECTION_LINKS } from "./links";
import { Wordmark } from "./wordmark";

export function LandingNav() {
	return (
		<header className="sticky top-0 z-50 flex w-full justify-center border-border/70 border-b bg-background/85 backdrop-blur-md">
			<nav
				aria-label="Main"
				className="flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-6"
			>
				<Link href="/" aria-label="Threadline home" className="rounded-md">
					<Wordmark />
				</Link>
				<ul className="hidden items-center gap-7 text-sm lg:flex">
					{SECTION_LINKS.map((link) => (
						<li key={link.href}>
							<Link
								href={link.href}
								className="text-muted-foreground transition-colors hover:text-foreground"
							>
								{link.label}
							</Link>
						</li>
					))}
				</ul>
				<div className="flex items-center gap-2">
					<Button asChild variant="ghost" size="sm" className="max-sm:hidden">
						<Link href="/sign-in">Sign in</Link>
					</Button>
					<DemoLaunchButton size="sm" className="px-4" />
				</div>
			</nav>
		</header>
	);
}

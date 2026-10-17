import Rocket from "@carbon/icons-react/es/Rocket";
import { Button } from "@crm/ui/components/button";
import Link from "next/link";
import { REPO_LINKS } from "./links";
import { Wordmark } from "./wordmark";

export function LandingNav() {
	const githubLink =
		REPO_LINKS.find((l) => l.label === "GitHub")?.href ||
		"https://github.com/mehulsethia/Threadline";

	return (
		<header className="sticky top-0 z-50 flex h-16 w-full shrink-0 items-center justify-center border-b border-border/60 bg-background/80 backdrop-blur-md">
			<nav className="flex w-full max-w-6xl items-center justify-between px-6">
				<div className="flex items-center gap-8">
					<Link
						href="/"
						aria-label="Homepage"
						className="transition-opacity hover:opacity-90"
					>
						<Wordmark />
					</Link>
					<div className="hidden items-center gap-6 text-muted-foreground text-sm font-medium md:flex">
						<Link
							href="/#features"
							className="transition-colors hover:text-foreground"
						>
							Capabilities
						</Link>
						<a
							href={githubLink}
							target="_blank"
							rel="noreferrer"
							className="transition-colors hover:text-foreground"
						>
							GitHub
						</a>
					</div>
				</div>

				<div className="flex items-center gap-3">
					<Button asChild variant="ghost" size="sm" className="font-medium">
						<Link href="/sign-in">Sign in</Link>
					</Button>
					<Button
						asChild
						variant="default"
						size="sm"
						className="gap-1.5 font-medium shadow-xs shadow-primary/20"
					>
						<Link href="/sign-in">
							<Rocket size={14} />
							<span>Live Demo</span>
						</Link>
					</Button>
				</div>
			</nav>
		</header>
	);
}

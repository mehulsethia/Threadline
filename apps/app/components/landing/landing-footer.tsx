import Link from "next/link";
import { PROJECT_LINKS, SECTION_LINKS } from "./links";
import { Wordmark } from "./wordmark";

export function LandingFooter() {
	return (
		<footer className="flex w-full justify-center border-border border-t px-4 pt-16 pb-10 sm:px-6">
			<div className="flex w-full max-w-6xl flex-col gap-12">
				<div className="flex flex-col justify-between gap-10 md:flex-row">
					<div className="flex max-w-sm flex-col gap-4">
						<Wordmark />
						<p className="text-muted-foreground text-[15px]/7">
							The agentic CRM that turns conversations in any language into
							evidence-backed records, then works the leads.
						</p>
					</div>
					<div className="flex gap-16">
						<nav aria-label="Product" className="flex flex-col gap-3 text-sm">
							<p className="text-muted-foreground">Product</p>
							{SECTION_LINKS.map((link) => (
								<Link
									key={link.href}
									href={link.href}
									className="hover:underline"
								>
									{link.label}
								</Link>
							))}
						</nav>
						<nav aria-label="Project" className="flex flex-col gap-3 text-sm">
							<p className="text-muted-foreground">Project</p>
							{PROJECT_LINKS.map((link) => (
								<Link
									key={link.href}
									href={link.href}
									className="hover:underline"
								>
									{link.label}
								</Link>
							))}
						</nav>
					</div>
				</div>
				<p className="border-border border-t pt-6 text-muted-foreground text-sm">
					Threadline builds on Comp AI's open-source CRM, MIT licensed. Made for
					the Google Cloud AI Builder Cup 2026.
				</p>
			</div>
		</footer>
	);
}

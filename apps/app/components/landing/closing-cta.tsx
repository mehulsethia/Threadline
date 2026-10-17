import ArrowRight from "@carbon/icons-react/es/ArrowRight";
import Rocket from "@carbon/icons-react/es/Rocket";
import { Button } from "@crm/ui/components/button";
import Link from "next/link";
import { GitHubStarButton } from "./github-star-button";

export function ClosingCta() {
	return (
		<section className="relative flex w-full shrink-0 flex-col items-center gap-8 px-6 py-16">
			<div className="relative flex w-[970px] max-w-full shrink-0 flex-col items-center justify-center gap-7 overflow-hidden rounded-2xl border border-border/80 bg-gradient-to-b from-primary/5 via-card to-background px-6 py-16 shadow-xl shadow-primary/5 md:px-12">
				<div
					aria-hidden="true"
					className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-primary/10 to-transparent"
				/>

				<div className="flex flex-col items-center gap-3 text-center">
					<span className="font-mono text-xs font-semibold text-primary uppercase tracking-wider">
						Ready to transform your sales pipeline?
					</span>
					<h2 className="max-w-xl text-balance font-semibold text-4xl/[44px] tracking-tight md:text-5xl/[52px]">
						Try the live demo or fork the code.
					</h2>
					<p className="max-w-md text-pretty text-muted-foreground text-sm/6">
						Evaluate pre-seeded enterprise deals with evidence-backed records,
						lead revival, and Gemini voice qualification.
					</p>
				</div>

				<div className="flex flex-wrap items-center justify-center gap-3 pt-2">
					<Button
						asChild
						variant="default"
						size="lg"
						className="gap-2 font-medium shadow-md shadow-primary/20 transition-all hover:shadow-lg hover:shadow-primary/25"
					>
						<Link href="/sign-in">
							<Rocket size={16} />
							<span>Explore Live Demo</span>
							<ArrowRight size={14} />
						</Link>
					</Button>
					<SetupPromptButton location="closing" />
					<GitHubStarButton location="closing" />
				</div>
			</div>
		</section>
	);
}

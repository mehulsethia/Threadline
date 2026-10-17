import ArrowRight from "@carbon/icons-react/es/ArrowRight";
import Rocket from "@carbon/icons-react/es/Rocket";
import { Button } from "@crm/ui/components/button";
import Link from "next/link";
import { GitHubStarButton } from "./github-star-button";
import { SetupPromptButton } from "./setup-prompt-button";

export function Hero() {
	return (
		<section className="relative flex w-full shrink-0 flex-col items-center overflow-hidden px-6 pt-16 pb-12 md:pt-24 md:pb-16">
			<div
				aria-hidden="true"
				className="pointer-events-none absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 select-none"
			>
				<div className="size-[540px] rounded-full bg-primary/15 blur-[120px]" />
				<div className="absolute top-1/2 left-1/2 size-[360px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-tertiary/10 blur-[100px]" />
			</div>

			<div className="relative flex w-full max-w-6xl flex-col items-center gap-7">
				<Link
					href="/sign-in"
					className="group inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-4 py-1.5 font-mono text-xs font-medium text-primary tracking-wide shadow-2xs backdrop-blur-sm transition-all hover:border-primary/40 hover:bg-primary/15"
				>
					<span className="size-1.5 rounded-full bg-primary animate-pulse" />
					<span>Google Cloud AI Builder Cup 2026</span>
					<ArrowRight
						size={12}
						className="transition-transform group-hover:translate-x-0.5"
					/>
				</Link>

				<h1 className="max-w-[940px] text-balance text-center font-semibold text-5xl/[54px] tracking-tight md:text-[76px]/[80px]">
					The CRM built for{" "}
					<span className="bg-gradient-to-r from-primary via-purple-600 to-tertiary bg-clip-text text-transparent dark:from-purple-400 dark:via-purple-300 dark:to-pink-300">
						Agents
					</span>
				</h1>

				<p className="max-w-[680px] text-pretty text-center text-muted-foreground text-lg/[30px] md:text-xl/[32px]">
					Turn customer conversations across WhatsApp, email, and live sales
					calls into evidence-backed records. Autonomously qualify leads and
					draft multilingual follow-ups.
				</p>

				<div className="flex flex-wrap items-center justify-center gap-3 pt-2">
					<Button
						asChild
						variant="default"
						size="xl"
						className="gap-2 font-medium shadow-md shadow-primary/20 transition-all hover:shadow-lg hover:shadow-primary/25"
					>
						<Link href="/sign-in">
							<Rocket size={18} />
							<span>Explore Live Demo</span>
							<ArrowRight size={14} />
						</Link>
					</Button>
					<SetupPromptButton location="hero" />
					<GitHubStarButton location="hero" />
				</div>
			</div>
		</section>
	);
}

import { cn } from "@crm/ui/lib/utils";
import Link from "next/link";
import type { ReactNode } from "react";
import { Wordmark } from "@/components/landing/wordmark";

type AuthShellProps = {
	children: ReactNode;
	variant?: "default" | "sign-in";
};

function EvidenceExample() {
	return (
		<figure className="flex max-w-md flex-col gap-3">
			<blockquote className="rounded-xl bg-band-foreground/8 px-4 py-3 text-[15px]/7">
				Es sind 500 Einheiten, Budget ca.{" "}
				<span className="font-semibold underline decoration-2 decoration-thread underline-offset-4">
					72.000 €
				</span>
				, Lieferung bis Ende Q1.
			</blockquote>
			<div className="ml-6 h-6 w-px bg-thread" aria-hidden="true" />
			<figcaption className="flex items-center justify-between gap-4 rounded-xl border border-band-foreground/15 px-4 py-3 text-sm">
				<span>
					<span className="text-band-foreground/65">Budget</span>
					<span className="ml-2">€72,000 (EUR)</span>
				</span>
				<span className="rounded-full bg-band-foreground px-2.5 py-0.5 text-band text-xs">
					Verified
				</span>
			</figcaption>
		</figure>
	);
}

export function AuthShell({ children, variant = "default" }: AuthShellProps) {
	const isSignIn = variant === "sign-in";

	return (
		<main
			id="main"
			className="grid min-h-svh bg-background text-foreground lg:grid-cols-[minmax(0,1fr)_minmax(440px,560px)]"
		>
			<section className="relative hidden min-h-svh flex-col justify-between bg-band p-10 text-band-foreground lg:flex xl:p-16">
				<Link
					href="/"
					aria-label="Threadline home"
					className="w-fit rounded-md"
				>
					<Wordmark className="text-band-foreground" />
				</Link>

				<div className="flex max-w-xl flex-col gap-10">
					<div className="flex flex-col gap-5">
						<h1 className="text-5xl/[1.04] tracking-[-0.035em] xl:text-6xl/[1.02]">
							Your conversations, turned into closed deals.
						</h1>
						<p className="max-w-[48ch] text-band-foreground/75 text-lg/8">
							{isSignIn
								? "Every field in Threadline points back to the message it came from. Strong evidence writes to the record. Weak evidence waits for you."
								: "Set up your workspace once. Threadline does the data entry from then on."}
						</p>
					</div>
					{isSignIn ? <EvidenceExample /> : null}
				</div>

				<p className="text-band-foreground/60 text-sm">
					Runs on Gemini, Google ADK and Cloud Run.
				</p>
			</section>

			<section className="flex min-h-svh min-w-0 flex-col px-4 py-8 sm:px-10 lg:px-12">
				<Link
					href="/"
					aria-label="Threadline home"
					className="w-fit rounded-md lg:hidden"
				>
					<Wordmark />
				</Link>

				<div className="flex flex-1 items-center justify-center py-8 sm:py-12">
					<div
						className={cn(
							"flex w-full max-w-md flex-col gap-6",
							isSignIn &&
								"rounded-xl border border-border bg-card p-6 shadow-md sm:p-8",
						)}
					>
						{children}
					</div>
				</div>
			</section>
		</main>
	);
}

export function AuthHeading({
	title,
	description,
}: {
	title: string;
	description: ReactNode;
}) {
	return (
		<div className="flex flex-col gap-2 text-left">
			<h2 className="text-[32px]/[1.1] tracking-[-0.025em]">{title}</h2>
			<p className="text-pretty text-[15px]/6 text-muted-foreground">
				{description}
			</p>
		</div>
	);
}

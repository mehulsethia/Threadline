import Logo from "@crm/ui/components/logo";
import { cn } from "@crm/ui/lib/utils";
import Link from "next/link";
import type { ReactNode } from "react";
import { AuthShader } from "@/components/auth-shader";

type AuthShellProps = {
	children: ReactNode;
	variant?: "default" | "sign-in";
};

export function AuthShell({ children, variant = "default" }: AuthShellProps) {
	const isSignIn = variant === "sign-in";

	return (
		<main
			id="main"
			className="grid min-h-svh bg-background text-foreground lg:grid-cols-[minmax(0,1fr)_minmax(420px,520px)]"
		>
			<section
				className={cn(
					"relative hidden min-h-svh overflow-hidden bg-muted p-8 lg:flex lg:flex-col lg:justify-between xl:p-12",
					isSignIn && "xl:p-14",
				)}
			>
				<AuthShader />

				<div className="relative flex gap-2 text-sm/5">
					<Link href="/" aria-label="Homepage" className="flex">
						<Logo className="size-5 shrink-0" />
					</Link>
				</div>

				{isSignIn ? (
					<div className="relative flex max-w-2xl flex-col gap-10">
						<div className="flex flex-col gap-5">
							<p className="w-fit rounded-full bg-background/70 px-3 py-1 font-mono text-xs/4 tracking-wide text-primary uppercase">
								Conversation intelligence
							</p>
							<h1 className="max-w-[13ch] text-5xl/[1.08] font-semibold tracking-tight text-balance xl:text-6xl/[1.05]">
								Your conversations, turned into closed deals.
							</h1>
							<p className="max-w-[48ch] text-base/7 text-muted-foreground text-pretty">
								Turn customer conversations into evidence-backed records and
								confident next steps.
							</p>
						</div>

						<div className="grid max-w-xl grid-cols-3 gap-3">
							<div className="flex min-h-32 flex-col gap-4 rounded-xl border border-border/60 bg-background/70 p-4">
								<span className="font-mono text-xs text-primary">01</span>
								<div className="flex flex-col gap-1">
									<p className="text-sm font-medium">Capture</p>
									<p className="text-xs/5 text-muted-foreground">
										Bring every conversation together.
									</p>
								</div>
							</div>
							<div className="flex min-h-32 flex-col gap-4 rounded-xl border border-border/60 bg-background/70 p-4">
								<span className="font-mono text-xs text-primary">02</span>
								<div className="flex flex-col gap-1">
									<p className="text-sm font-medium">Ground</p>
									<p className="text-xs/5 text-muted-foreground">
										Keep every record tied to evidence.
									</p>
								</div>
							</div>
							<div className="flex min-h-32 flex-col gap-4 rounded-xl border border-border/60 bg-background/70 p-4">
								<span className="font-mono text-xs text-primary">03</span>
								<div className="flex flex-col gap-1">
									<p className="text-sm font-medium">Move forward</p>
									<p className="text-xs/5 text-muted-foreground">
										Know what to do next on every deal.
									</p>
								</div>
							</div>
						</div>
					</div>
				) : (
					<div className="relative flex max-w-lg flex-col gap-8">
						<div className="flex flex-col gap-4">
							<p className="font-mono text-xs/4 text-muted-foreground uppercase">
								Threadline
							</p>
							<h1 className="max-w-[14ch] text-5xl/14 font-semibold text-balance">
								Your conversations, turned into closed deals.
							</h1>
						</div>
					</div>
				)}

				<p className="relative font-mono text-xs/4 text-muted-foreground">
					Autonomous Sales Platform · Threadline
				</p>
			</section>

			<section className="flex min-h-svh min-w-0 flex-col bg-background px-6 py-8 sm:px-10 lg:px-14">
				<div className="flex gap-2 text-sm/5 max-lg:hidden lg:invisible">
					<Logo className="size-5 shrink-0" />
				</div>

				<div className="flex flex-1 items-center justify-center py-12">
					<div
						className={cn(
							"flex w-full max-w-sm flex-col gap-8",
							isSignIn &&
								"rounded-2xl border border-border/60 bg-card p-6 shadow-lg sm:p-8",
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
		<div className="flex flex-col gap-3 text-left">
			<Link href="/" aria-label="Homepage" className="flex">
				<Logo className="size-6 shrink-0" />
			</Link>
			<div className="flex flex-col gap-1">
				<h2 className="text-2xl/8 font-semibold tracking-tight text-balance">
					{title}
				</h2>
				<p className="max-w-[32ch] text-sm/5 text-muted-foreground text-pretty">
					{description}
				</p>
			</div>
		</div>
	);
}

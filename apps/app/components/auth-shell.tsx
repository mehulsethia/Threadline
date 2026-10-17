import ArrowRight from "@carbon/icons-react/es/ArrowRight";
import Chat from "@carbon/icons-react/es/Chat";
import Document from "@carbon/icons-react/es/Document";
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
			className="grid min-h-svh bg-background text-foreground lg:grid-cols-[minmax(0,1fr)_minmax(440px,540px)]"
		>
			<section
				className={cn(
					"relative hidden min-h-svh overflow-hidden bg-muted/40 p-8 lg:flex lg:flex-col lg:justify-between xl:p-14",
					isSignIn && "xl:p-16",
				)}
			>
				<AuthShader />

				<div className="relative flex items-center justify-between">
					<Link
						href="/"
						aria-label="Homepage"
						className="group inline-flex items-center gap-2.5 rounded-full border border-border/60 bg-card/70 px-3.5 py-1.5 backdrop-blur-md transition-all hover:border-primary/40 hover:bg-card"
					>
						<Logo className="size-5 shrink-0 transition-transform group-hover:scale-105" />
						<span className="font-semibold text-sm tracking-tight text-foreground">
							Threadline
						</span>
					</Link>

					<div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 font-mono text-[11px] font-medium text-primary tracking-wide">
						<span className="size-1.5 rounded-full bg-primary animate-pulse" />
						GOOGLE CLOUD AI BUILDER CUP
					</div>
				</div>

				{isSignIn ? (
					<div className="relative flex max-w-2xl flex-col gap-10">
						<div className="flex flex-col gap-4">
							<div className="inline-flex w-fit items-center gap-2 rounded-full border border-border/80 bg-background/80 px-3.5 py-1 font-mono text-xs font-medium text-primary uppercase shadow-2xs backdrop-blur-sm">
								<span className="size-1.5 rounded-full bg-primary" />
								Multimodal Conversation Intelligence
							</div>

							<h1 className="max-w-[14ch] text-balance font-semibold text-5xl/[1.1] tracking-tight xl:text-6xl/[1.05]">
								Your conversations, turned into{" "}
								<span className="bg-gradient-to-r from-primary via-purple-600 to-tertiary bg-clip-text text-transparent dark:from-purple-400 dark:via-purple-300 dark:to-pink-300">
									closed deals.
								</span>
							</h1>

							<p className="max-w-[48ch] text-pretty text-base/7 text-muted-foreground">
								Turn WhatsApp chats, emails, and live sales calls into verified,
								evidence-backed records and automatic lead revival.
							</p>
						</div>

						<div className="grid max-w-xl grid-cols-3 gap-3.5">
							<div className="group flex min-h-36 flex-col justify-between rounded-xl border border-border/70 bg-card/60 p-4.5 shadow-2xs backdrop-blur-md transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:bg-card/90 hover:shadow-sm">
								<div className="flex items-center justify-between">
									<span className="font-mono text-xs font-semibold text-primary">
										01
									</span>
									<span className="flex size-7 items-center justify-center rounded-md bg-primary/10 text-primary">
										<Chat size={14} />
									</span>
								</div>
								<div className="flex flex-col gap-1">
									<p className="font-semibold text-sm text-foreground">
										Capture
									</p>
									<p className="text-xs/5 text-muted-foreground">
										Ingest WhatsApp, email, audio and voice notes in any
										language.
									</p>
								</div>
							</div>

							<div className="group flex min-h-36 flex-col justify-between rounded-xl border border-border/70 bg-card/60 p-4.5 shadow-2xs backdrop-blur-md transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:bg-card/90 hover:shadow-sm">
								<div className="flex items-center justify-between">
									<span className="font-mono text-xs font-semibold text-primary">
										02
									</span>
									<span className="flex size-7 items-center justify-center rounded-md bg-primary/10 text-primary">
										<Document size={14} />
									</span>
								</div>
								<div className="flex flex-col gap-1">
									<p className="font-semibold text-sm text-foreground">
										Ground
									</p>
									<p className="text-xs/5 text-muted-foreground">
										Every field links to verbatim quotes in the evidence ledger.
									</p>
								</div>
							</div>

							<div className="group flex min-h-36 flex-col justify-between rounded-xl border border-border/70 bg-card/60 p-4.5 shadow-2xs backdrop-blur-md transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:bg-card/90 hover:shadow-sm">
								<div className="flex items-center justify-between">
									<span className="font-mono text-xs font-semibold text-primary">
										03
									</span>
									<span className="flex size-7 items-center justify-center rounded-md bg-primary/10 text-primary">
										<ArrowRight size={14} />
									</span>
								</div>
								<div className="flex flex-col gap-1">
									<p className="font-semibold text-sm text-foreground">
										Revive
									</p>
									<p className="text-xs/5 text-muted-foreground">
										Autonomously draft follow-ups and qualify deals with live
										voice.
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
							<h1 className="max-w-[14ch] font-semibold text-5xl/14 text-balance">
								Your conversations, turned into closed deals.
							</h1>
						</div>
					</div>
				)}

				<div className="relative flex items-center justify-between font-mono text-xs/4 text-muted-foreground">
					<span>Autonomous Sales Platform · Threadline</span>
					<span className="flex items-center gap-1.5">
						<span className="size-1.5 rounded-full bg-emerald-500" />
						Systems online
					</span>
				</div>
			</section>

			<section className="relative flex min-h-svh min-w-0 flex-col bg-background px-6 py-8 sm:px-10 lg:px-12">
				<div className="flex items-center justify-between max-lg:mb-6 lg:invisible">
					<Link
						href="/"
						aria-label="Homepage"
						className="inline-flex items-center gap-2"
					>
						<Logo className="size-6 shrink-0" />
						<span className="font-semibold text-sm">Threadline</span>
					</Link>
					<span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-0.5 font-mono text-[11px] text-primary">
						<span className="size-1.5 rounded-full bg-primary" />
						Demo Ready
					</span>
				</div>

				<div className="flex flex-1 items-center justify-center py-6 sm:py-10">
					<div
						className={cn(
							"flex w-full max-w-md flex-col gap-6",
							isSignIn &&
								"rounded-2xl border border-border/80 bg-card/95 p-7 shadow-xl shadow-primary/5 backdrop-blur-xl sm:p-9",
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
			<Link
				href="/"
				aria-label="Homepage"
				className="flex size-10 items-center justify-center rounded-xl border border-border/80 bg-surface-container/60 shadow-2xs transition-transform hover:scale-105"
			>
				<Logo className="size-6 shrink-0" />
			</Link>
			<div className="flex flex-col gap-1.5">
				<h2 className="text-balance font-semibold text-2xl/8 tracking-tight">
					{title}
				</h2>
				<p className="text-pretty text-muted-foreground text-sm/5">
					{description}
				</p>
			</div>
		</div>
	);
}

"use client";

import ArrowRight from "@carbon/icons-react/es/ArrowRight";
import Checkmark from "@carbon/icons-react/es/Checkmark";
import Rocket from "@carbon/icons-react/es/Rocket";
import { Badge } from "@crm/ui/components/badge";
import { Button } from "@crm/ui/components/button";
import { Spinner } from "@crm/ui/components/spinner";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

export function DemoSignIn() {
	const [pending, setPending] = useState(false);
	const router = useRouter();

	async function handleDemoLogin() {
		try {
			setPending(true);
			const res = await fetch("/api/auth/demo-login", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
			});

			if (!res.ok) {
				const data = (await res.json().catch(() => ({}))) as {
					error?: string;
				};
				toast.error(
					data.error || "Too many demo login requests. Please try again soon.",
				);
				setPending(false);
				return;
			}

			const data = (await res.json()) as { redirectUrl?: string };
			toast.success("Opening Northwind Systems demo workspace...");
			router.push(data.redirectUrl || "/northwind-systems/deals");
			router.refresh();
		} catch {
			toast.error("Could not reach demo sign-in service.");
			setPending(false);
		}
	}

	return (
		<div className="flex w-full flex-col gap-4 rounded-xl border border-primary/25 bg-gradient-to-b from-primary/5 via-card to-card p-4.5 shadow-xs">
			<div className="flex items-center justify-between">
				<Badge
					variant="secondary"
					className="border-primary/25 bg-primary/10 font-mono text-[11px] font-semibold text-primary uppercase"
				>
					Evaluation Workspace
				</Badge>
				<span className="font-mono text-muted-foreground text-xs">
					Northwind Systems
				</span>
			</div>

			<div className="flex flex-col gap-2 pt-1 text-xs text-muted-foreground">
				<div className="flex items-center gap-2">
					<span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
						<Checkmark size={11} />
					</span>
					<span>12 pre-seeded global enterprise deals</span>
				</div>
				<div className="flex items-center gap-2">
					<span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
						<Checkmark size={11} />
					</span>
					<span>Evidence ledger with verbatim quotes</span>
				</div>
				<div className="flex items-center gap-2">
					<span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
						<Checkmark size={11} />
					</span>
					<span>Multilingual lead revival & voice qualifier</span>
				</div>
			</div>

			<Button
				type="button"
				variant="default"
				size="lg"
				className="group relative mt-1 w-full gap-2 font-semibold shadow-md shadow-primary/20 transition-all hover:shadow-lg hover:shadow-primary/25"
				disabled={pending}
				onClick={() => {
					void handleDemoLogin();
				}}
			>
				{pending ? (
					<Spinner className="size-4" />
				) : (
					<Rocket size={16} className="text-primary-foreground" />
				)}
				<span>Explore the live demo</span>
				{!pending && (
					<ArrowRight
						size={14}
						className="transition-transform group-hover:translate-x-0.5"
					/>
				)}
			</Button>
		</div>
	);
}

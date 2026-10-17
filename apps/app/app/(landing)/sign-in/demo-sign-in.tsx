"use client";

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
			toast.success("Signing into Northwind Systems demo workspace...");
			router.push(data.redirectUrl || "/northwind-systems/deals");
			router.refresh();
		} catch {
			toast.error("Could not reach demo sign-in service.");
			setPending(false);
		}
	}

	return (
		<div className="flex w-full flex-col gap-4 pt-2">
			<div className="flex flex-col gap-1">
				<span className="font-mono text-xs/4 font-medium tracking-wide text-primary uppercase">
					Hackathon Evaluation
				</span>
				<p className="text-sm/5 text-muted-foreground">
					Explore the Northwind Systems demo workspace.
				</p>
			</div>

			<Button
				type="button"
				variant="default"
				className="w-full gap-2 font-medium"
				disabled={pending}
				onClick={() => {
					void handleDemoLogin();
				}}
			>
				{pending ? (
					<Spinner className="size-4" />
				) : (
					<span className="inline-block text-base">✨</span>
				)}
				<span>Explore the live demo</span>
			</Button>

			<p className="text-sm/5 text-muted-foreground">
				Instantly access 12 pre-seeded global enterprise deals with real facts,
				tasks & lead revival drafts.
			</p>
		</div>
	);
}

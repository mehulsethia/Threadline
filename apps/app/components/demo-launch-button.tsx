"use client";

import { Button } from "@crm/ui/components/button";
import { Spinner } from "@crm/ui/components/spinner";
import { cn } from "@crm/ui/lib/utils";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

type DemoLaunchButtonProps = {
	label?: string;
	size?: "default" | "sm" | "lg" | "xl";
	variant?: "default" | "outline";
	className?: string;
};

export function DemoLaunchButton({
	label = "Try the live demo",
	size = "lg",
	variant = "default",
	className,
}: DemoLaunchButtonProps) {
	const [pending, setPending] = useState(false);
	const router = useRouter();

	async function launch() {
		setPending(true);
		try {
			const res = await fetch("/api/auth/demo-login", { method: "POST" });
			if (!res.ok) {
				const data = (await res.json().catch(() => ({}))) as {
					error?: string;
				};
				toast.error(data.error ?? "The demo did not open. Try again.");
				setPending(false);
				return;
			}
			const data = (await res.json()) as { redirectUrl?: string };
			router.push(data.redirectUrl ?? "/");
			router.refresh();
		} catch {
			toast.error("The demo service did not respond. Try again.");
			setPending(false);
		}
	}

	return (
		<Button
			type="button"
			size={size}
			variant={variant}
			disabled={pending}
			aria-busy={pending}
			className={cn("px-6", className)}
			onClick={() => {
				void launch();
			}}
		>
			{pending ? <Spinner data-icon="inline-start" /> : null}
			<span>{pending ? "Opening the demo workspace" : label}</span>
		</Button>
	);
}

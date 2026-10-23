"use client";

import Checkmark from "@carbon/icons-react/es/Checkmark";
import { Icon } from "@crm/ui/components/icon";
import { cn } from "@crm/ui/lib/utils";
import { useEffect, useRef } from "react";
import type { AgentStep } from "@/lib/agent-steps";

export function AgentLiveLog({
	steps,
	running,
	waiting = "The agent is picking up the work…",
	className,
}: {
	steps: readonly AgentStep[];
	running: boolean;
	waiting?: string;
	className?: string;
}) {
	const end = useRef<HTMLLIElement | null>(null);
	const count = steps.length;

	useEffect(() => {
		if (count > 0) end.current?.scrollIntoView({ block: "nearest" });
	}, [count]);

	return (
		<ol
			aria-live="polite"
			className={cn(
				"flex max-h-72 flex-col gap-3 overflow-y-auto rounded-lg border bg-card p-4",
				className,
			)}
		>
			{steps.map((step, index) => {
				const current = running && index === count - 1;
				return (
					<li key={step.id} className="flex items-start gap-3">
						<span
							className={cn(
								"mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full",
								current ? "bg-accent" : "bg-muted",
							)}
						>
							{current ? (
								<span className="size-2 rounded-full bg-thread motion-safe:animate-pulse" />
							) : (
								<Icon icon={Checkmark} size={12} />
							)}
						</span>
						<span className="flex min-w-0 flex-col gap-0.5">
							<span className="break-words font-medium text-sm">
								{step.title}
							</span>
							{step.detail ? (
								<span className="break-words text-muted-foreground text-xs">
									{step.detail}
								</span>
							) : null}
						</span>
					</li>
				);
			})}
			{running ? (
				<li
					ref={end}
					className="flex items-center gap-3 text-muted-foreground text-sm"
				>
					<span className="flex size-5 shrink-0 items-center justify-center">
						<span className="size-1.5 rounded-full bg-muted-foreground motion-safe:animate-pulse" />
					</span>
					{count === 0 ? waiting : "Working…"}
				</li>
			) : (
				<li ref={end} aria-hidden="true" />
			)}
		</ol>
	);
}

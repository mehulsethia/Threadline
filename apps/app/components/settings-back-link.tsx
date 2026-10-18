"use client";

import ArrowLeft from "@carbon/icons-react/es/ArrowLeft";
import Link from "next/link";
import { useWorkspaceUrl } from "@/lib/use-workspace-url";

export function SettingsBackLink({ to, label }: { to: string; label: string }) {
	const workspaceUrl = useWorkspaceUrl();

	return (
		<Link
			href={workspaceUrl(to)}
			className="inline-flex w-fit items-center gap-1.5 rounded-md px-(--spacing-block-inline) text-muted-foreground text-sm transition-colors hover:text-foreground"
		>
			<ArrowLeft aria-hidden="true" className="size-4" />
			{label}
		</Link>
	);
}

import { Spinner } from "@crm/ui/components/spinner";
import { cn } from "@crm/ui/lib/utils";
import { Suspense } from "react";
import { ConnectedNotice } from "@/components/connected-notice";
import { SettingsBackLink } from "@/components/settings-back-link";

const CONNECTIONS_BACK = { to: "/settings/connections", label: "Connections" };

export function ConnectionPage({
	centered = false,
	back = CONNECTIONS_BACK,
	className,
	children,
}: {
	centered?: boolean;
	back?: { to: string; label: string } | null;
	className?: string;
	children: React.ReactNode;
}) {
	return (
		<main
			id="main"
			className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto px-(--spacing-page-inline) pt-(--spacing-page-top) pb-(--spacing-page-bottom)"
		>
			<Suspense fallback={null}>
				<ConnectedNotice />
			</Suspense>
			{back ? (
				<div
					className={cn(
						"mx-auto w-full max-w-(--container-page) pb-4",
						className,
						"text-left",
					)}
				>
					<Suspense fallback={null}>
						<SettingsBackLink to={back.to} label={back.label} />
					</Suspense>
				</div>
			) : null}
			<div
				className={cn(
					"mx-auto flex w-full max-w-(--container-page) flex-col gap-(--spacing-page-gap)",
					centered && "flex-1 justify-center",
					className,
				)}
			>
				{children}
			</div>
		</main>
	);
}

export function ConnectionPageLoading() {
	return (
		<main
			id="main"
			className="flex min-h-0 min-w-0 flex-1 items-center justify-center"
		>
			<Spinner size="lg" />
		</main>
	);
}

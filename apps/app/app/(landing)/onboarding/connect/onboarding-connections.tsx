"use client";

import Microphone from "@carbon/icons-react/es/Microphone";
import { authClient } from "@crm/auth/client";
import { SYNC_SCOPES } from "@crm/auth/scopes";
import GoogleLogo from "@crm/ui/components/brand-logos/google";
import SlackLogo from "@crm/ui/components/brand-logos/slack";
import { Button } from "@crm/ui/components/button";
import { Spinner } from "@crm/ui/components/spinner";
import { useQuery } from "@tanstack/react-query";
import { type ReactNode, Suspense, useState } from "react";
import { toast } from "sonner";
import { RecorderKeys } from "@/app/(app)/[slug]/settings/connections/recorders/recorder-keys";
import { ConnectedNotice } from "@/components/connected-notice";
import { CONNECTED_PARAM } from "@/lib/connection-sync-copy";
import { useTRPC } from "@/lib/trpc/client";

const RETURN_PATH = "/onboarding/connect";

function ConnectedPill() {
	return (
		<span className="rounded-full bg-accent px-3 py-1 text-xs">Connected</span>
	);
}

function UnavailablePill() {
	return (
		<span className="rounded-full bg-muted px-3 py-1 text-muted-foreground text-xs">
			Not set up on this server
		</span>
	);
}

function Row({
	logo,
	name,
	description,
	action,
	children,
}: {
	logo: ReactNode;
	name: string;
	description: string;
	action: ReactNode;
	children?: ReactNode;
}) {
	return (
		<li className="flex flex-col gap-3 px-4 py-3">
			<div className="flex items-center gap-3">
				{logo}
				<div className="min-w-0 flex-1">
					<p className="font-medium text-sm">{name}</p>
					<p className="text-muted-foreground text-xs">{description}</p>
				</div>
				{action}
			</div>
			{children}
		</li>
	);
}

export function OnboardingConnections({ slug }: { slug: string }) {
	const trpc = useTRPC();
	const google = useQuery(trpc.google.status.queryOptions());
	const slack = useQuery(trpc.slack.status.queryOptions());
	const recorders = useQuery(trpc.recorders.status.queryOptions());
	const [pending, setPending] = useState<"google" | "slack" | null>(null);
	const [showRecorders, setShowRecorders] = useState(false);

	async function connectGoogle() {
		setPending("google");
		const origin = window.location.origin;
		const { error } = await authClient.linkSocial({
			provider: "google",
			scopes: [...SYNC_SCOPES],
			callbackURL: `${origin}${RETURN_PATH}?${CONNECTED_PARAM}=google`,
			errorCallbackURL: `${origin}${RETURN_PATH}`,
		});
		if (error) {
			setPending(null);
			toast.error(error.message ?? "Google did not respond. Try again.");
		}
	}

	function connectSlack() {
		setPending("slack");
		window.location.href = `/api/slack/install?slug=${encodeURIComponent(slug)}&return=onboarding`;
	}

	const recordersConnected =
		recorders.data?.providers.filter((row) => row.connected).length ?? 0;

	return (
		<>
			<Suspense fallback={null}>
				<ConnectedNotice />
			</Suspense>
			<ul className="flex w-full flex-col divide-y rounded-lg border bg-card">
				<Row
					logo={<GoogleLogo className="size-5 shrink-0" />}
					name="Google Workspace"
					description="Gmail threads, Calendar meetings and Meet transcripts"
					action={
						google.data?.linked ? (
							<ConnectedPill />
						) : google.data && !google.data.configured ? (
							<UnavailablePill />
						) : (
							<Button
								variant="outline"
								size="sm"
								disabled={!google.data || pending !== null}
								onClick={() => {
									connectGoogle().catch(() => setPending(null));
								}}
							>
								{pending === "google" ? (
									<Spinner data-icon="inline-start" />
								) : null}
								Connect
							</Button>
						)
					}
				/>
				<Row
					logo={<SlackLogo className="size-5 shrink-0" />}
					name="Slack"
					description="Messages in the channels you invite the app to"
					action={
						slack.data?.connected ? (
							<ConnectedPill />
						) : slack.data && !slack.data.configured ? (
							<UnavailablePill />
						) : (
							<Button
								variant="outline"
								size="sm"
								disabled={!slack.data || pending !== null}
								onClick={connectSlack}
							>
								{pending === "slack" ? (
									<Spinner data-icon="inline-start" />
								) : null}
								Connect
							</Button>
						)
					}
				/>
				<Row
					logo={<Microphone className="size-5 shrink-0" />}
					name="Fireflies or Fathom"
					description="Transcripts of your recorded sales calls"
					action={
						recordersConnected > 0 && !showRecorders ? (
							<ConnectedPill />
						) : (
							<Button
								variant="outline"
								size="sm"
								aria-expanded={showRecorders}
								onClick={() => setShowRecorders((open) => !open)}
							>
								{showRecorders ? "Done" : "Add key"}
							</Button>
						)
					}
				>
					{showRecorders ? <RecorderKeys /> : null}
				</Row>
			</ul>
		</>
	);
}

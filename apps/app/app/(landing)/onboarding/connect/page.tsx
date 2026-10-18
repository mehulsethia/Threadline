import Microphone from "@carbon/icons-react/es/Microphone";
import GoogleLogo from "@crm/ui/components/brand-logos/google";
import SlackLogo from "@crm/ui/components/brand-logos/slack";
import { Button } from "@crm/ui/components/button";
import type { Metadata } from "next";
import Link from "next/link";
import { AuthHeading, AuthShell } from "@/components/auth-shell";
import { requireSession } from "@/lib/session";
import { getServerQueryClient, getServerTrpc } from "@/lib/trpc/server";

export const metadata: Metadata = { title: "Connect your tools" };

export const instant = false;

export default async function OnboardingConnectPage() {
	await requireSession();
	const workspace = await getServerQueryClient().fetchQuery(
		getServerTrpc().workspace.get.queryOptions(),
	);
	const base = `/${workspace.slug}/settings/connections`;
	const tools = [
		{
			logo: GoogleLogo,
			name: "Google Workspace",
			description: "Gmail threads, Calendar meetings and Meet transcripts",
			href: `${base}/google`,
		},
		{
			logo: SlackLogo,
			name: "Slack",
			description: "Messages in the channels you invite the app to",
			href: `${base}/slack`,
		},
		{
			logo: Microphone,
			name: "Fireflies or Fathom",
			description: "Transcripts of your recorded sales calls",
			href: `${base}/recorders`,
		},
	];

	return (
		<AuthShell>
			<AuthHeading
				title="Connect where your conversations happen"
				description="Step 3 of 3. Threadline reads these and keeps your deals, facts and follow-ups up to date by itself. You can connect more later in Settings."
			/>
			<ul className="flex w-full flex-col divide-y rounded-lg border bg-card">
				{tools.map((tool) => (
					<li key={tool.name} className="flex items-center gap-3 px-4 py-3">
						<tool.logo className="size-5 shrink-0" />
						<div className="min-w-0 flex-1">
							<p className="font-medium text-sm">{tool.name}</p>
							<p className="text-muted-foreground text-xs">
								{tool.description}
							</p>
						</div>
						<Button asChild variant="outline" size="sm">
							<Link href={tool.href}>Connect</Link>
						</Button>
					</li>
				))}
			</ul>
			<Button asChild className="w-full">
				<Link href={`/${workspace.slug}/deals`}>Go to my dashboard</Link>
			</Button>
		</AuthShell>
	);
}

import { Button } from "@crm/ui/components/button";
import type { Metadata } from "next";
import Link from "next/link";
import { AuthHeading, AuthShell } from "@/components/auth-shell";
import { requireSession } from "@/lib/session";
import { getServerQueryClient, getServerTrpc } from "@/lib/trpc/server";
import { OnboardingConnections } from "./onboarding-connections";

export const metadata: Metadata = { title: "Connect your tools" };

export const instant = false;

export default async function OnboardingConnectPage({
	searchParams,
}: PageProps<"/onboarding/connect">) {
	await requireSession();
	const { error } = await searchParams;
	const workspace = await getServerQueryClient().fetchQuery(
		getServerTrpc().workspace.get.queryOptions(),
	);
	return (
		<AuthShell>
			<AuthHeading
				title="Connect where your conversations happen"
				description="Step 3 of 3. Each connection brings you back here. Threadline then reads these and keeps your deals, facts and follow-ups up to date by itself."
			/>
			<OnboardingConnections
				slug={workspace.slug}
				connectError={typeof error === "string" ? error : undefined}
			/>
			<Button asChild className="w-full">
				<Link href={`/${workspace.slug}/deals`}>Go to my dashboard</Link>
			</Button>
		</AuthShell>
	);
}

import type { Metadata } from "next";
import { Suspense } from "react";
import { PageShell, PageShellLoading } from "@/components/page-shell";
import { requireSession } from "@/lib/session";
import { HydrateClient } from "@/lib/trpc/hydrate";
import { getServerQueryClient, getServerTrpc } from "@/lib/trpc/server";
import { RevivalDashboard } from "./revival-dashboard";

export const metadata: Metadata = {
	title: "Lead Revival",
};

export default function RevivalPage() {
	return (
		<PageShell className="min-h-0">
			<Suspense fallback={<PageShellLoading />}>
				<RevivalContent />
			</Suspense>
		</PageShell>
	);
}

async function RevivalContent() {
	await requireSession();
	const trpc = getServerTrpc();
	const queryClient = getServerQueryClient();

	await Promise.all([
		queryClient.prefetchQuery(trpc.revival.listDrafts.queryOptions({})),
		queryClient.prefetchQuery(trpc.revival.getSettings.queryOptions({})),
	]);

	return (
		<HydrateClient>
			<RevivalDashboard />
		</HydrateClient>
	);
}

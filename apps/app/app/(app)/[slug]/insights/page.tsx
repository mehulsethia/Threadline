import type { Metadata } from "next";
import { Suspense } from "react";
import { PageShell, PageShellLoading } from "@/components/page-shell";
import { requireSession } from "@/lib/session";
import { HydrateClient } from "@/lib/trpc/hydrate";
import { getServerQueryClient, getServerTrpc } from "@/lib/trpc/server";
import { InsightsDashboard } from "./insights-dashboard";

export const metadata: Metadata = { title: "Forecast & health" };

export default function InsightsPage() {
	return (
		<PageShell className="min-h-0">
			<Suspense fallback={<PageShellLoading />}>
				<InsightsContent />
			</Suspense>
		</PageShell>
	);
}

async function InsightsContent() {
	await requireSession();
	const trpc = getServerTrpc();
	const queryClient = getServerQueryClient();
	await Promise.all([
		queryClient.prefetchQuery(trpc.assist.forecast.queryOptions()),
		queryClient.prefetchQuery(trpc.assist.promises.queryOptions({})),
	]);
	return (
		<HydrateClient>
			<InsightsDashboard />
		</HydrateClient>
	);
}

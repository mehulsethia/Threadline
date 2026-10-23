import type { Metadata } from "next";
import { Suspense } from "react";
import {
	PageShell,
	PageShellContent,
	PageShellDescription,
	PageShellHeader,
	PageShellHeading,
	PageShellLoading,
	PageShellTitle,
} from "@/components/page-shell";
import { requireSession } from "@/lib/session";
import { HydrateClient } from "@/lib/trpc/hydrate";
import { getServerQueryClient, getServerTrpc } from "@/lib/trpc/server";
import { InboxQueue } from "./inbox-queue";

export const metadata: Metadata = { title: "For you" };

export default function InboxPage() {
	return (
		<PageShell>
			<PageShellHeader>
				<PageShellHeading>
					<PageShellTitle>For you</PageShellTitle>
					<PageShellDescription>
						Everything the agents need you to decide, in one place. Most days it
						takes a couple of minutes to clear.
					</PageShellDescription>
				</PageShellHeading>
			</PageShellHeader>
			<PageShellContent>
				<Suspense fallback={<PageShellLoading />}>
					<Queue />
				</Suspense>
			</PageShellContent>
		</PageShell>
	);
}

async function Queue() {
	await requireSession();
	await getServerQueryClient().prefetchQuery(
		getServerTrpc().inbox.list.queryOptions(),
	);
	return (
		<HydrateClient>
			<InboxQueue />
		</HydrateClient>
	);
}

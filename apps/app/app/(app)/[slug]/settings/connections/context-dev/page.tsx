import type { Metadata } from "next";
import { Suspense } from "react";
import { requireSession } from "@/lib/session";
import { HydrateClient } from "@/lib/trpc/hydrate";
import { getServerQueryClient, getServerTrpc } from "@/lib/trpc/server";
import { ConnectionPage, ConnectionPageLoading } from "../connection-page";
import { ResearchKey } from "./research-key";

export const metadata: Metadata = { title: "Context.dev" };

export default function ContextDevConnectionPage(
	props: PageProps<"/[slug]/settings/connections/context-dev">,
) {
	return (
		<Suspense fallback={<ConnectionPageLoading />}>
			<ContextDevConnectionPageContent {...props} />
		</Suspense>
	);
}

async function ContextDevConnectionPageContent({
	params,
}: PageProps<"/[slug]/settings/connections/context-dev">) {
	await requireSession();
	await params;
	await getServerQueryClient().prefetchQuery(
		getServerTrpc().settings.researchKey.queryOptions(),
	);

	return (
		<ConnectionPage className="max-w-(--container-narrow)">
			<header className="flex flex-col gap-2 px-(--spacing-block-inline)">
				<h1 className="font-medium text-2xl tracking-tight">Context.dev</h1>
				<p className="text-muted-foreground text-sm leading-relaxed">
					Company research. With a key, the agents look up every company in the
					CRM: logo, industry, size, location and socials, each with its source.
					Without one, companies keep only what your conversations say.
				</p>
			</header>
			<HydrateClient>
				<ResearchKey />
			</HydrateClient>
		</ConnectionPage>
	);
}

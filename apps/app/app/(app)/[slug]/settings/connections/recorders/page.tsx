import { Button } from "@crm/ui/components/button";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { requireSession } from "@/lib/session";
import { ConnectionPage, ConnectionPageLoading } from "../connection-page";
import { RecorderKeys } from "./recorder-keys";

export const metadata: Metadata = { title: "Meeting recorders" };

export default function RecordersConnectionPage(
	props: PageProps<"/[slug]/settings/connections/recorders">,
) {
	return (
		<Suspense fallback={<ConnectionPageLoading />}>
			<RecordersConnectionPageContent {...props} />
		</Suspense>
	);
}

async function RecordersConnectionPageContent({
	params,
}: PageProps<"/[slug]/settings/connections/recorders">) {
	await requireSession();
	const { slug } = await params;

	return (
		<ConnectionPage className="max-w-(--container-narrow)">
			<header className="flex flex-col gap-2 px-(--spacing-block-inline)">
				<h1 className="font-medium text-2xl tracking-tight">
					Meeting recorders
				</h1>
				<p className="text-muted-foreground text-sm leading-relaxed">
					Connect your own Fireflies or Fathom account. Every hour Threadline
					fetches new transcripts, extracts facts with quotes, and updates the
					right contact and deal. Use Sync now to check straight away.
				</p>
			</header>
			<RecorderKeys />
			<div className="px-(--spacing-block-inline)">
				<Button asChild variant="outline">
					<Link href={`/${slug}/settings/connections`}>
						Back to connections
					</Link>
				</Button>
			</div>
		</ConnectionPage>
	);
}

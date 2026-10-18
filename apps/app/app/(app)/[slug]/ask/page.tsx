import type { Metadata } from "next";
import { Suspense } from "react";
import { PageShell, PageShellLoading } from "@/components/page-shell";
import { requireSession } from "@/lib/session";
import { AskChat } from "./ask-chat";

export const metadata: Metadata = { title: "Ask your CRM" };

export default function AskPage() {
	return (
		<PageShell className="min-h-0">
			<Suspense fallback={<PageShellLoading />}>
				<AskContent />
			</Suspense>
		</PageShell>
	);
}

async function AskContent() {
	await requireSession();
	return <AskChat />;
}

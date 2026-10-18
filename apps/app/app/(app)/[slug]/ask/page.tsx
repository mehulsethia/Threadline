import type { Metadata } from "next";
import { PageShell } from "@/components/page-shell";
import { requireSession } from "@/lib/session";
import { AskChat } from "./ask-chat";

export const metadata: Metadata = { title: "Ask your CRM" };

export default async function AskPage() {
	await requireSession();
	return (
		<PageShell className="min-h-0">
			<AskChat />
		</PageShell>
	);
}

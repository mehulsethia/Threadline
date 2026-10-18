import type { Metadata } from "next";
import { requireSession } from "@/lib/session";
import { ConnectionPage } from "../connections/connection-page";
import { FormsManager } from "./forms-manager";

export const metadata: Metadata = { title: "Enquiry forms" };

export default async function FormsSettingsPage() {
	await requireSession();
	return (
		<ConnectionPage className="max-w-(--container-narrow)">
			<header className="flex flex-col gap-2 px-(--spacing-block-inline)">
				<h1 className="font-medium text-2xl tracking-tight">Enquiry forms</h1>
				<p className="text-muted-foreground text-sm leading-relaxed">
					Share a link or put it on your website. Every submission becomes a
					contact and a deal, gets scored, and alerts your team.
				</p>
			</header>
			<FormsManager />
		</ConnectionPage>
	);
}

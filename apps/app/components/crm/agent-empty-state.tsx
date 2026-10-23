"use client";

import Email from "@carbon/icons-react/es/Email";
import Upload from "@carbon/icons-react/es/Upload";
import { Button } from "@crm/ui/components/button";
import { Icon } from "@crm/ui/components/icon";
import Link from "next/link";
import { parseAsBoolean, useQueryState } from "nuqs";
import { SEARCH_PARAM } from "@/lib/search-param-keys";
import { useWorkspaceUrl } from "@/lib/use-workspace-url";

const COPY = {
	deals: {
		title: "No deals yet. Let the agents find them.",
		body: "Import a WhatsApp chat, email thread or call recording and the agent creates the deal, fills every field with its source and scores it.",
	},
	contacts: {
		title: "No contacts yet. Let the agents file them.",
		body: "Import a conversation or fetch your recent email, and every person who wrote to you becomes a contact, with the message they came from.",
	},
	companies: {
		title: "No companies yet. Let the agents research them.",
		body: "Each conversation you import adds the company behind it, with its logo, industry and size where a source confirms them.",
	},
	activity: {
		title: "The agents are ready to work.",
		body: "Give them a conversation or your recent email. Every step they take shows up here, and anything that needs you lands in For you.",
	},
} as const;

export function AgentEmptyState({ entity }: { entity: keyof typeof COPY }) {
	const workspaceUrl = useWorkspaceUrl();
	const [, setImportOpen] = useQueryState(
		SEARCH_PARAM.dialog.importConversation,
		parseAsBoolean.withDefault(false),
	);
	const copy = COPY[entity];

	return (
		<div className="mx-auto flex max-w-md flex-col items-center gap-4 px-4 py-6 text-center">
			<div className="flex flex-col gap-1.5">
				<p className="font-medium text-foreground text-base">{copy.title}</p>
				<p className="text-pretty text-muted-foreground text-sm">{copy.body}</p>
			</div>
			<div className="flex w-full flex-col justify-center gap-2 sm:w-auto sm:flex-row">
				<Button onClick={() => void setImportOpen(true)}>
					<Icon icon={Upload} data-icon="inline-start" />
					Import a conversation
				</Button>
				<Button asChild variant="outline">
					<Link href={workspaceUrl("/settings/connections/google")}>
						<Icon icon={Email} data-icon="inline-start" />
						Fetch last 7 days of email
					</Link>
				</Button>
			</div>
		</div>
	);
}

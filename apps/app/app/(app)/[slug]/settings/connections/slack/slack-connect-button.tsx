"use client";

import { Button } from "@crm/ui/components/button";
import { useState } from "react";

const CONNECT_ERRORS = new Map([
	[
		"access_denied",
		"Slack installation was cancelled before access was granted.",
	],
	[
		"account_already_linked_to_different_user",
		"That Slack installer is already linked to another CRM account.",
	],
	[
		"email_doesn't_match",
		"The Slack installer's email must match the CRM account you are signed in with.",
	],
	[
		"oauth_code_verification_failed",
		"Slack rejected the app credentials or redirect URL. Check the client ID, client secret, and OAuth redirect URL, then try again.",
	],
	[
		"user_info_is_missing",
		"Slack did not return the installer's profile. Confirm the app has users:read and users:read.email, reinstall it, then try again.",
	],
]);

// Same-origin: the app proxies /api/* to the API with the session cookie, so
// the install is tied to the signed-in member.
function startSlackOAuth(slug: string) {
	window.location.href = `/api/slack/install?slug=${encodeURIComponent(slug)}`;
}

export function SlackReconnectButton({ slug }: { slug: string }) {
	const [pending, setPending] = useState(false);

	return (
		<Button
			disabled={pending}
			onClick={async () => {
				setPending(true);
				await startSlackOAuth(slug);
				setPending(false);
			}}
			size="xs"
			variant="contrast"
		>
			{pending ? "Opening Slack…" : "Reconnect"}
		</Button>
	);
}

export function SlackConnectButton({
	slug,
	configured,
	connectError,
}: {
	slug: string;
	configured: boolean;
	connectError?: string;
}) {
	const [pending, setPending] = useState(false);
	const connect = async () => {
		setPending(true);
		await startSlackOAuth(slug);
		setPending(false);
	};
	return (
		<div className="flex min-w-0 flex-col gap-2">
			<Button onClick={() => void connect()} disabled={!configured || pending}>
				{pending
					? "Opening Slack…"
					: configured
						? "Add to Slack"
						: "Slack is not configured"}
			</Button>
			{connectError ? (
				<p role="alert" className="max-w-sm text-destructive text-xs">
					{CONNECT_ERRORS.get(connectError) ??
						`Slack could not be connected (${connectError.replaceAll("_", " ")}).`}
				</p>
			) : null}
		</div>
	);
}

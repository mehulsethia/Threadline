"use client";

import { signIn } from "@crm/auth/client";
import type { MailboxProviderId } from "@crm/auth/scopes";
import GoogleLogo from "@crm/ui/components/brand-logos/google";
import MicrosoftLogo from "@crm/ui/components/brand-logos/microsoft";
import { Button } from "@crm/ui/components/button";
import { Spinner } from "@crm/ui/components/spinner";
import type { FC, SVGProps } from "react";
import { useState } from "react";
import { toast } from "sonner";

type ProviderChoice = {
	label: string;
	Logo: FC<SVGProps<SVGSVGElement>>;
};

const PROVIDERS = {
	google: { label: "Continue with Google", Logo: GoogleLogo },
	microsoft: { label: "Continue with Microsoft", Logo: MicrosoftLogo },
} as const satisfies Record<MailboxProviderId, ProviderChoice>;

export function SocialSignIn({ provider }: { provider: MailboxProviderId }) {
	const [pending, setPending] = useState(false);

	const { label, Logo } = PROVIDERS[provider];

	function fail(message?: string) {
		setPending(false);
		toast.error(message ?? "Could not reach the sign-in service.");
	}

	async function handleClick() {
		setPending(true);

		const origin = window.location.origin;

		const { error } = await signIn.social({
			provider,
			callbackURL: `${origin}/`,
			errorCallbackURL: `${origin}/sign-in`,
		});

		if (error) fail(error.message);
	}

	return (
		<Button
			className="h-11 w-full justify-center border-border/80 bg-background/80 font-medium shadow-2xs transition-all hover:bg-surface-container/70 active:scale-[0.96]"
			disabled={pending}
			onClick={() => {
				handleClick().catch(() => fail());
			}}
			type="button"
			variant="outline"
		>
			{pending ? (
				<Spinner data-icon="inline-start" />
			) : (
				<Logo data-icon="inline-start" className="size-4.5" />
			)}
			<span>{label}</span>
		</Button>
	);
}

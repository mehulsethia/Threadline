"use client";

import { Separator } from "@crm/ui/components/separator";
import { type ReactNode, useState } from "react";
import { AuthHeading } from "@/components/auth-shell";
import { type EmailMode, EmailSignIn } from "./email-sign-in";

const HEADINGS = {
	"sign-in": {
		title: "Sign in to Threadline",
		description: "Open the demo workspace, or sign in to your own.",
	},
	"sign-up": {
		title: "Create your account",
		description: "Your own workspace, ready in a minute.",
	},
} as const satisfies Record<EmailMode, { title: string; description: string }>;

export function SignInPanel({
	initialMode,
	demo,
	providers,
}: {
	initialMode: EmailMode;
	demo: ReactNode;
	providers: ReactNode;
}) {
	const [mode, setMode] = useState<EmailMode>(initialMode);

	return (
		<>
			<AuthHeading {...HEADINGS[mode]} />

			{mode === "sign-in" && (
				<>
					{demo}
					<OrDivider />
				</>
			)}

			{providers && (
				<>
					<div className="flex flex-col gap-2.5">{providers}</div>
					<OrDivider label="or use email" />
				</>
			)}

			<EmailSignIn mode={mode} onModeChange={setMode} />
		</>
	);
}

function OrDivider({ label = "or" }: { label?: string }) {
	return (
		<div className="relative flex items-center justify-center">
			<Separator className="w-full" />
			<span className="absolute bg-card px-3 text-muted-foreground text-sm">
				{label}
			</span>
		</div>
	);
}

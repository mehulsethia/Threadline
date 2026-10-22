"use client";

import { signIn, signUp } from "@crm/auth/client";
import { PASSWORD } from "@crm/auth/password";
import { Button } from "@crm/ui/components/button";
import {
	Field,
	FieldError,
	FieldGroup,
	FieldLabel,
} from "@crm/ui/components/field";
import { Input } from "@crm/ui/components/input";
import { Spinner } from "@crm/ui/components/spinner";
import { type FormEvent, useId, useState } from "react";

export type EmailMode = "sign-in" | "sign-up";

const COPY = {
	"sign-in": {
		submit: "Sign in",
		switchPrompt: "New to Threadline?",
		switchAction: "Create an account",
	},
	"sign-up": {
		submit: "Create account",
		switchPrompt: "Already have an account?",
		switchAction: "Sign in",
	},
} as const satisfies Record<EmailMode, Record<string, string>>;

export function EmailSignIn({
	mode,
	onModeChange,
}: {
	mode: EmailMode;
	onModeChange: (mode: EmailMode) => void;
}) {
	const [pending, setPending] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const nameId = useId();
	const emailId = useId();
	const passwordId = useId();

	async function submit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		const form = new FormData(event.currentTarget);
		const email = String(form.get("email") ?? "").trim();
		const password = String(form.get("password") ?? "");
		const name = String(form.get("name") ?? "").trim();

		setPending(true);
		setError(null);

		const { error: failure } =
			mode === "sign-up"
				? await signUp.email({ name, email, password })
				: await signIn.email({ email, password });

		if (failure) {
			setPending(false);
			setError(
				failure.message ??
					(mode === "sign-up"
						? "Could not create the account."
						: "The email or password is wrong."),
			);
			return;
		}

		window.location.assign("/");
	}

	const copy = COPY[mode];

	return (
		<form
			className="flex flex-col gap-3"
			onSubmit={(event) => {
				submit(event).catch(() => {
					setPending(false);
					setError("Could not reach the sign-in service.");
				});
			}}
		>
			<FieldGroup className="gap-3">
				{mode === "sign-up" && (
					<Field>
						<FieldLabel htmlFor={nameId}>Name</FieldLabel>
						<Input
							id={nameId}
							name="name"
							autoComplete="name"
							required
							maxLength={120}
						/>
					</Field>
				)}
				<Field>
					<FieldLabel htmlFor={emailId}>Email</FieldLabel>
					<Input
						id={emailId}
						name="email"
						type="email"
						autoComplete="email"
						required
					/>
				</Field>
				<Field>
					<FieldLabel htmlFor={passwordId}>Password</FieldLabel>
					<Input
						id={passwordId}
						name="password"
						type="password"
						autoComplete={
							mode === "sign-up" ? "new-password" : "current-password"
						}
						required
						minLength={PASSWORD.minLength}
						maxLength={PASSWORD.maxLength}
						placeholder={
							mode === "sign-up"
								? `At least ${PASSWORD.minLength} characters`
								: undefined
						}
					/>
				</Field>
				{error && <FieldError role="alert">{error}</FieldError>}
			</FieldGroup>

			<Button type="submit" className="h-11 w-full" disabled={pending}>
				{pending && <Spinner data-icon="inline-start" />}
				{copy.submit}
			</Button>

			<p className="text-center text-muted-foreground text-sm">
				{copy.switchPrompt}{" "}
				<Button
					type="button"
					variant="link"
					className="h-auto p-0"
					onClick={() => {
						setError(null);
						onModeChange(mode === "sign-in" ? "sign-up" : "sign-in");
					}}
				>
					{copy.switchAction}
				</Button>
			</p>
		</form>
	);
}

"use client";

import { Button } from "@crm/ui/components/button";
import { Field, FieldGroup, FieldLabel } from "@crm/ui/components/field";
import { Input } from "@crm/ui/components/input";
import { Spinner } from "@crm/ui/components/spinner";
import { Textarea } from "@crm/ui/components/textarea";
import { useState } from "react";

export function PublicForm({ slug, formId }: { slug: string; formId: string }) {
	const [state, setState] = useState<"idle" | "sending" | "done" | "error">(
		"idle",
	);
	const [message, setMessage] = useState<string | null>(null);

	if (state === "done") {
		return (
			<p className="text-base" role="status">
				{message ?? "Thank you. We will be in touch shortly."}
			</p>
		);
	}

	return (
		<form
			className="flex w-full flex-col gap-6"
			onSubmit={async (event) => {
				event.preventDefault();
				setState("sending");
				const form = new FormData(event.currentTarget);
				const response = await fetch(
					`/api/forms/${encodeURIComponent(slug)}/${encodeURIComponent(formId)}`,
					{
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify(Object.fromEntries(form.entries())),
					},
				).catch(() => null);
				if (!response?.ok) {
					setState("error");
					setMessage(
						response?.status === 429
							? "Too many submissions. Try again in a minute."
							: "Please check your name, email and message.",
					);
					return;
				}
				const body: { thankYou?: string | null } = await response.json();
				setMessage(body.thankYou ?? null);
				setState("done");
			}}
		>
			<FieldGroup>
				<Field>
					<FieldLabel htmlFor="lead-name">Your name</FieldLabel>
					<Input id="lead-name" name="name" autoComplete="name" required />
				</Field>
				<Field>
					<FieldLabel htmlFor="lead-email">Work email</FieldLabel>
					<Input
						id="lead-email"
						name="email"
						type="email"
						autoComplete="email"
						required
					/>
				</Field>
				<Field>
					<FieldLabel htmlFor="lead-phone">Phone (optional)</FieldLabel>
					<Input id="lead-phone" name="phone" type="tel" autoComplete="tel" />
				</Field>
				<Field>
					<FieldLabel htmlFor="lead-company">Company</FieldLabel>
					<Input id="lead-company" name="company" autoComplete="organization" />
				</Field>
				<Field>
					<FieldLabel htmlFor="lead-message">What do you need?</FieldLabel>
					<Textarea id="lead-message" name="message" rows={4} required />
				</Field>
				<input
					type="text"
					name="website"
					tabIndex={-1}
					autoComplete="off"
					aria-hidden="true"
					className="hidden"
				/>
			</FieldGroup>
			{state === "error" && message ? (
				<p className="text-destructive text-sm" role="alert">
					{message}
				</p>
			) : null}
			<Button type="submit" disabled={state === "sending"}>
				{state === "sending" ? <Spinner data-icon="inline-start" /> : null}
				Send
			</Button>
		</form>
	);
}

"use client";

import { Button } from "@crm/ui/components/button";
import {
	Field,
	FieldDescription,
	FieldGroup,
	FieldLabel,
} from "@crm/ui/components/field";
import { Input } from "@crm/ui/components/input";
import { Spinner } from "@crm/ui/components/spinner";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { toast } from "sonner";
import { useTRPC } from "@/lib/trpc/client";

export function ProfileForm({ initialName }: { initialName: string }) {
	const trpc = useTRPC();
	const router = useRouter();
	const nameId = useId();
	const [name, setName] = useState(initialName);
	const save = useMutation(
		trpc.users.updateProfile.mutationOptions({
			onSuccess: () => router.replace("/onboarding/connect"),
			onError: (error) => toast.error(error.message),
		}),
	);

	return (
		<form
			className="flex w-full flex-col gap-6"
			onSubmit={(event) => {
				event.preventDefault();
				if (name.trim()) save.mutate({ name: name.trim() });
			}}
		>
			<FieldGroup>
				<Field>
					<FieldLabel htmlFor={nameId}>Your name</FieldLabel>
					<Input
						id={nameId}
						value={name}
						onChange={(event) => setName(event.target.value)}
						autoComplete="name"
						autoFocus
						required
					/>
					<FieldDescription>
						Shown to your team and used as the sign-off on drafts.
					</FieldDescription>
				</Field>
			</FieldGroup>
			<Button type="submit" disabled={save.isPending || !name.trim()}>
				{save.isPending ? <Spinner data-icon="inline-start" /> : null}
				Continue
			</Button>
		</form>
	);
}

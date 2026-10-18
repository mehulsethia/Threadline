import type { Metadata } from "next";
import { AuthHeading, AuthShell } from "@/components/auth-shell";
import { requireSession } from "@/lib/session";
import { ProfileForm } from "./profile-form";

export const metadata: Metadata = { title: "Your profile" };

export const instant = false;

export default async function OnboardingProfilePage() {
	const session = await requireSession();

	return (
		<AuthShell>
			<AuthHeading
				title="How should we call you?"
				description="Step 2 of 3. Your name signs the follow-ups the agent drafts for you."
			/>
			<ProfileForm initialName={session.user.name ?? ""} />
		</AuthShell>
	);
}

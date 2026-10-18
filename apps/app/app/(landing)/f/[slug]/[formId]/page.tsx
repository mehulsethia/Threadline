import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AuthHeading, AuthShell } from "@/components/auth-shell";
import { API_URL } from "@/lib/env";
import { PublicForm } from "./public-form";

export const metadata: Metadata = { title: "Contact us" };

type PublicFormMeta = {
	title: string;
	description: string | null;
	thankYou: string | null;
	workspace: string;
};

async function loadForm(
	slug: string,
	formId: string,
): Promise<PublicFormMeta | null> {
	const response = await fetch(
		`${API_URL}/api/forms/${encodeURIComponent(slug)}/${encodeURIComponent(formId)}`,
		{ cache: "no-store" },
	).catch(() => null);
	if (!response?.ok) return null;
	const body: PublicFormMeta = await response.json();
	return body;
}

export default async function PublicFormPage({
	params,
}: PageProps<"/f/[slug]/[formId]">) {
	const { slug, formId } = await params;
	const form = await loadForm(slug, formId);
	if (!form) notFound();

	return (
		<AuthShell>
			<AuthHeading
				title={form.title}
				description={form.description ?? `Get in touch with ${form.workspace}.`}
			/>
			<PublicForm slug={slug} formId={formId} />
		</AuthShell>
	);
}

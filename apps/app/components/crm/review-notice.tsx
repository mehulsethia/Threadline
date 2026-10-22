"use client";

import { Alert, AlertDescription, AlertTitle } from "@crm/ui/components/alert";
import { Button } from "@crm/ui/components/button";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";
import { useRecordStack } from "./record-sheet/record-stack";

type ReviewTarget = { kind: "contact" | "company"; id: string };

const COPY = {
	contact: {
		body: "This person emailed you first. You have not replied, and they are not a known contact or company. Keep them to work the lead, or remove them from the CRM.",
		removed: "Removed from the CRM. You can restore it from the Archived view.",
	},
	company: {
		body: "This company came from an inbound email you have not replied to. Keep it to work the lead, or remove it and its new contacts from the CRM.",
		removed: "Removed from the CRM. You can restore it from the Archived view.",
	},
} as const;

export function ReviewNotice({ kind, id }: ReviewTarget) {
	const trpc = useTRPC();
	const cache = useCrmCache();
	const { close } = useRecordStack();

	const settle = async (decision: "keep" | "remove") => {
		if (decision === "keep") {
			await (kind === "contact" ? cache.contact(id) : cache.company(id));
			toast.success("Kept. It is now a normal record.");
			return;
		}
		close();
		await cache.removed({ kind, id });
		toast.success(COPY[kind].removed);
	};

	const contactReview = useMutation(
		trpc.contacts.review.mutationOptions({
			onSuccess: (_, input) => settle(input.decision),
			onError: (error) => toast.error(error.message),
		}),
	);
	const companyReview = useMutation(
		trpc.companies.review.mutationOptions({
			onSuccess: (_, input) => settle(input.decision),
			onError: (error) => toast.error(error.message),
		}),
	);
	const pending = contactReview.isPending || companyReview.isPending;
	const decide = (decision: "keep" | "remove") =>
		kind === "contact"
			? contactReview.mutate({ id, decision })
			: companyReview.mutate({ id, decision });

	return (
		<Alert className="mx-5 mt-4 w-auto">
			<AlertTitle>New inbound lead, not reviewed</AlertTitle>
			<AlertDescription className="flex flex-col gap-3">
				<p>{COPY[kind].body}</p>
				<div className="flex flex-wrap gap-2">
					<Button size="sm" disabled={pending} onClick={() => decide("keep")}>
						Keep
					</Button>
					<Button
						size="sm"
						variant="outline"
						disabled={pending}
						onClick={() => decide("remove")}
					>
						Remove
					</Button>
				</div>
			</AlertDescription>
		</Alert>
	);
}

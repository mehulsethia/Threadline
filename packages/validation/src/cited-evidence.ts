import { z } from "zod";

/** One ledger reference behind a revival draft. */
export const citedEvidenceItem = z.object({
	evidenceId: z.string(),
	kind: z.string(),
	quote: z.string(),
});

export type CitedEvidenceItem = z.infer<typeof citedEvidenceItem>;

/**
 * `OutboundDraft.citedEvidence` as stored JSON. Older drafts kept bare quote
 * strings; those read back as message citations. Anything unreadable is
 * dropped rather than shown.
 */
export const citedEvidenceList = z
	.array(
		z
			.union([
				z
					.object({
						evidenceId: z.string().catch(""),
						kind: z.string().catch("evidence"),
						quote: z.string(),
					})
					.transform((item): CitedEvidenceItem | null => item),
				z.string().transform((quote): CitedEvidenceItem | null => ({
					evidenceId: "",
					kind: "message",
					quote,
				})),
			])
			.catch(null),
	)
	.catch([])
	.transform((items) =>
		items.filter((item): item is CitedEvidenceItem => item !== null),
	);

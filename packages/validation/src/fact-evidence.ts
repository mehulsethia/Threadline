import { z } from "zod";

export const factEvidenceItem = z.object({
	kind: z.string(),
	detail: z.string(),
	sourceUrl: z.string().optional(),
});

export type FactEvidenceItem = z.infer<typeof factEvidenceItem>;

const quotedEvidenceItem = z
	.object({ kind: z.string(), quote: z.string() })
	.transform(
		(item): FactEvidenceItem => ({
			kind: item.kind,
			detail: `"${item.quote}" (speaker: lead)`,
		}),
	);

export const factEvidenceList = z.array(
	z.union([factEvidenceItem, quotedEvidenceItem]),
);

export function parseFactEvidence(value: unknown): FactEvidenceItem[] {
	if (value === null || value === undefined) return [];
	return factEvidenceList.parse(value);
}

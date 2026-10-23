const FIELD_LABELS: Record<string, string> = {
	leadBudget: "budget",
	need: "need",
	timeline: "timeline",
	objections: "objection",
	language: "language",
	sentiment: "sentiment",
	stage: "stage",
};

export function fieldLabel(field: string): string {
	const key = field.split(".").at(-1) ?? field;
	return (
		FIELD_LABELS[key] ??
		key
			.replace(/_/g, " ")
			.replace(/([a-z])([A-Z])/g, "$1 $2")
			.toLowerCase()
	);
}

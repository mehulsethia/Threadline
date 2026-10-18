export function workspaceLabel(name: string | undefined): string {
	const trimmed = name?.trim();

	if (!trimmed || /^crm$/i.test(trimmed)) return "Threadline";

	return trimmed;
}

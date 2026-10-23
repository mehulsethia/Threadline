export function unfiltered(
	q: string | undefined,
	query: { filters: Record<string, readonly string[]>; tabId?: string },
): boolean {
	return (
		!q &&
		Object.entries(query.filters).every(
			([id, values]) => id === query.tabId || values.length === 0,
		)
	);
}

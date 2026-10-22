import { Badge } from "@crm/ui/components/badge";

export function ReviewBadge() {
	return (
		<Badge
			variant="secondary"
			className="shrink-0"
			title="Imported from an inbound email. Not a known contact or company yet."
		>
			To review
		</Badge>
	);
}

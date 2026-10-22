"use client";

import Renew from "@carbon/icons-react/es/Renew";
import { Button } from "@crm/ui/components/button";
import { Icon } from "@crm/ui/components/icon";
import { cn } from "@crm/ui/lib/utils";

export function ListRefresh({
	fetching,
	onRefresh,
}: {
	fetching: boolean;
	onRefresh: () => void;
}) {
	return (
		<Button
			variant="outline"
			size="icon-sm"
			aria-label="Refresh"
			title="Refresh"
			disabled={fetching}
			onClick={onRefresh}
		>
			<Icon
				icon={Renew}
				className={cn(fetching && "motion-safe:animate-spin")}
			/>
		</Button>
	);
}

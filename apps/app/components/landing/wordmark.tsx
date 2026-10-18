import Logo from "@crm/ui/components/logo";
import { cn } from "@crm/ui/lib/utils";

export function Wordmark({ className }: { className?: string }) {
	return (
		<span
			className={cn(
				"flex shrink-0 select-none items-center gap-2 text-foreground",
				className,
			)}
		>
			<Logo className="size-6 shrink-0" />
			<span className="font-heading text-[22px]/none tracking-[-0.02em]">
				Threadline
			</span>
		</span>
	);
}

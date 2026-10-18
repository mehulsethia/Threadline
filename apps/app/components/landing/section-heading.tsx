import { cn } from "@crm/ui/lib/utils";
import type { ReactNode } from "react";

export function Section({
	id,
	tone = "canvas",
	className,
	children,
}: {
	id?: string;
	tone?: "canvas" | "band" | "sand";
	className?: string;
	children: ReactNode;
}) {
	return (
		<section
			id={id}
			className={cn(
				"flex w-full scroll-mt-20 justify-center px-4 py-20 sm:px-6 md:py-28",
				tone === "band" && "bg-band text-band-foreground",
				tone === "sand" && "bg-accent",
				className,
			)}
		>
			<div className="flex w-full max-w-6xl flex-col gap-12">{children}</div>
		</section>
	);
}

export function SectionHeading({
	title,
	lede,
	tone = "canvas",
}: {
	title: string;
	lede?: string;
	tone?: "canvas" | "band";
}) {
	return (
		<div className="flex max-w-3xl flex-col gap-4">
			<h2 className="text-4xl/[1.08] tracking-[-0.03em] md:text-[52px]/[1.06]">
				{title}
			</h2>
			{lede ? (
				<p
					className={cn(
						"max-w-[62ch] text-pretty text-lg/8",
						tone === "band"
							? "text-band-foreground/75"
							: "text-muted-foreground",
					)}
				>
					{lede}
				</p>
			) : null}
		</div>
	);
}

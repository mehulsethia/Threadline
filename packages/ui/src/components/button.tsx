import { cn } from "@crm/ui/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import type * as React from "react";

const buttonVariants = cva(
	"group/button inline-flex shrink-0 cursor-pointer items-center justify-center rounded-md border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-[color,background-color,border-color,box-shadow,opacity,transform] outline-none select-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-1 focus-visible:ring-offset-background motion-safe:active:scale-[0.96] disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
	{
		variants: {
			variant: {
				default:
					"bg-primary text-primary-foreground shadow-xs shadow-primary/25 hover:bg-[color-mix(in_oklch,var(--primary),black_10%)] hover:shadow-sm hover:shadow-primary/30 active:bg-[color-mix(in_oklch,var(--primary),black_20%)] active:shadow-none",
				outline:
					"border-border/80 bg-background/80 shadow-2xs hover:bg-surface-container/80 hover:text-foreground hover:border-border aria-expanded:bg-surface-container aria-expanded:text-foreground",
				"outline-ghost":
					"border-border/80 hover:bg-surface-container/80 hover:text-foreground aria-expanded:bg-surface-container aria-expanded:text-foreground",
				secondary:
					"bg-secondary text-secondary-foreground hover:bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_6%)] aria-expanded:bg-secondary aria-expanded:text-secondary-foreground",
				ghost:
					"hover:bg-surface-container/70 hover:text-foreground aria-expanded:bg-surface-container aria-expanded:text-foreground",
				destructive:
					"bg-destructive text-destructive-foreground shadow-xs shadow-destructive/25 hover:bg-[color-mix(in_oklch,var(--destructive),black_10%)] hover:shadow-sm hover:shadow-destructive/30 active:bg-[color-mix(in_oklch,var(--destructive),black_20%)] active:shadow-none focus-visible:ring-destructive/50",
				contrast:
					"bg-foreground text-background shadow-2xs hover:bg-foreground/90 active:bg-foreground/80 active:shadow-none",
				link: "text-primary underline-offset-4 hover:underline",
			},
			size: {
				default:
					"h-10 gap-2 px-4 has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3",
				xs: "h-7 gap-1 rounded-sm px-2 text-xs has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
				sm: "h-8 gap-1.5 px-3 text-sm has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 [&_svg:not([class*='size-'])]:size-3.5",
				lg: "h-11 gap-2 px-4 has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3",
				xl: "h-12 gap-2 px-5 text-base has-data-[icon=inline-end]:pr-4 has-data-[icon=inline-start]:pl-4",
				icon: "size-10",
				"icon-xs": "size-6 rounded-sm [&_svg:not([class*='size-'])]:size-3",
				"icon-sm": "size-8",
				"icon-lg": "size-11",
			},
		},
		defaultVariants: {
			variant: "default",
			size: "default",
		},
	},
);

function Button({
	className,
	variant = "default",
	size = "default",
	asChild = false,
	...props
}: React.ComponentProps<"button"> &
	VariantProps<typeof buttonVariants> & {
		asChild?: boolean;
	}) {
	const Comp = asChild ? Slot.Root : "button";

	return (
		<Comp
			data-slot="button"
			data-variant={variant}
			data-size={size}
			className={cn(buttonVariants({ variant, size, className }))}
			{...props}
		/>
	);
}

export { Button, buttonVariants };

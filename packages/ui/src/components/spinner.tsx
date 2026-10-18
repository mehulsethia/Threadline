import { cn } from "@crm/ui/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";

const THREAD = "M5 7h3.25c4.5 0 3 10 7.5 10H19";

const spinnerVariants = cva("shrink-0", {
	variants: {
		size: {
			default: "size-4",
			lg: "size-10",
		},
	},
	defaultVariants: {
		size: "default",
	},
});

function Spinner({
	className,
	size,
	...props
}: React.ComponentProps<"svg"> & VariantProps<typeof spinnerVariants>) {
	return (
		<svg
			data-slot="spinner"
			role="status"
			aria-label="Loading"
			xmlns="http://www.w3.org/2000/svg"
			viewBox="0 0 24 24"
			fill="none"
			className={cn(spinnerVariants({ size }), className)}
			{...props}
		>
			<path
				d={THREAD}
				stroke="currentColor"
				strokeOpacity={0.25}
				strokeWidth={2}
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
			<circle cx="4.25" cy="7" r="2.25" fill="currentColor" />
			<circle cx="19.75" cy="17" r="2.25" fill="currentColor" />
			<path
				d={THREAD}
				stroke="currentColor"
				strokeWidth={2}
				strokeLinecap="round"
				strokeLinejoin="round"
				pathLength={100}
				strokeDasharray="35 65"
				className="motion-safe:animate-spinner-trace"
			/>
		</svg>
	);
}

export { Spinner };

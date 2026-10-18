import { DemoLaunchButton } from "@/components/demo-launch-button";

const INCLUDED = [
	"12 sample deals in USD, EUR, GBP and INR",
	"Evidence ledger with the original quotes",
	"Lead revival drafts and the voice qualifier",
] as const;

export function DemoSignIn() {
	return (
		<div className="flex flex-col gap-4 rounded-lg bg-accent p-5">
			<div className="flex flex-col gap-1">
				<p className="font-medium">Try the demo workspace</p>
				<p className="text-muted-foreground text-sm">
					Northwind Systems, a sample sales team. No sign-up.
				</p>
			</div>
			<ul className="flex flex-col gap-2 text-sm">
				{INCLUDED.map((item) => (
					<li key={item} className="flex items-center gap-2.5">
						<span aria-hidden="true" className="h-px w-3 shrink-0 bg-thread" />
						{item}
					</li>
				))}
			</ul>
			<DemoLaunchButton className="w-full" />
		</div>
	);
}

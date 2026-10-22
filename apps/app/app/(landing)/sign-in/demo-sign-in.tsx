import { DemoLaunchButton } from "@/components/demo-launch-button";

export function DemoSignIn() {
	return (
		<div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-accent px-4 py-3">
			<div className="flex min-w-0 flex-col">
				<p className="font-medium">Try the demo workspace</p>
				<p className="text-muted-foreground text-sm">
					12 sample deals with real evidence. No sign-up.
				</p>
			</div>
			<DemoLaunchButton size="default" className="shrink-0" />
		</div>
	);
}

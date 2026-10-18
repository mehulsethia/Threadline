import { Button } from "@crm/ui/components/button";
import Link from "next/link";
import { DemoLaunchButton } from "@/components/demo-launch-button";
import { Section } from "./section-heading";

export function ClosingCta() {
	return (
		<Section tone="band">
			<div className="flex flex-col items-start gap-8 lg:flex-row lg:items-end lg:justify-between">
				<div className="flex max-w-2xl flex-col gap-4">
					<h2 className="text-4xl/[1.08] tracking-[-0.03em] md:text-[56px]/[1.04]">
						Import one conversation. Watch the record fill in.
					</h2>
					<p className="text-band-foreground/75 text-lg/8">
						The demo workspace is ready now. Bring a WhatsApp export of your
						own, or use the sample deals.
					</p>
				</div>
				<div className="flex flex-wrap gap-3">
					<DemoLaunchButton className="bg-band-foreground text-band hover:bg-band-foreground/90" />
					<Button
						asChild
						variant="ghost"
						size="lg"
						className="px-6 text-band-foreground hover:bg-band-foreground/10 hover:text-band-foreground"
					>
						<Link href="/sign-in">Sign in with Google</Link>
					</Button>
				</div>
			</div>
		</Section>
	);
}

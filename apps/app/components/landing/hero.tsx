import { Button } from "@crm/ui/components/button";
import Link from "next/link";
import { DemoLaunchButton } from "@/components/demo-launch-button";
import { ThreadVisual } from "./thread-visual";

export function Hero() {
	return (
		<section className="flex w-full justify-center px-4 pt-16 pb-20 sm:px-6 md:pt-24">
			<div className="flex w-full max-w-6xl flex-col gap-14">
				<div className="flex max-w-3xl flex-col gap-6">
					<p className="w-fit rounded-full bg-accent px-3 py-1 font-medium text-sm">
						The agentic CRM
					</p>
					<h1 className="text-[44px]/[1.04] tracking-[-0.035em] sm:text-6xl/[1.02] lg:text-[76px]/[1]">
						Your conversations, turned into closed deals.
					</h1>
					<p className="max-w-[60ch] text-pretty text-lg/8 text-muted-foreground">
						Threadline is a CRM run by agents. They read the WhatsApp chats,
						emails, calls and voice notes your team already has, fill in every
						field with the message it came from, and work your deals before they
						go cold. You approve anything that reaches a customer.
					</p>
					<div className="flex flex-col gap-3 pt-2">
						<div className="flex flex-wrap items-center gap-3">
							<DemoLaunchButton />
							<Button asChild variant="outline" size="lg" className="px-6">
								<Link href="/sign-in?mode=sign-up">Create a free account</Link>
							</Button>
						</div>
						<p className="text-muted-foreground text-sm">
							The demo opens a sample workspace with 12 deals. No sign-up.
							Accounts work with email or Google.
						</p>
					</div>
				</div>
				<ThreadVisual />
			</div>
		</section>
	);
}

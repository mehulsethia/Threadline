import type { Metadata } from "next";
import { AgentFlows } from "@/components/landing/agent-flows";
import { LandingAnalytics } from "@/components/landing/analytics";
import { ChannelsStrip } from "@/components/landing/channels-strip";
import { ClosingCta } from "@/components/landing/closing-cta";
import { Comparison } from "@/components/landing/comparison";
import { Faq } from "@/components/landing/faq";
import { GoogleCloud } from "@/components/landing/google-cloud";
import { Hero } from "@/components/landing/hero";
import { HowItWorks } from "@/components/landing/how-it-works";
import { LandingFooter } from "@/components/landing/landing-footer";
import { LandingNav } from "@/components/landing/landing-nav";
import { MoreFeatures } from "@/components/landing/more-features";
import { ProblemSection } from "@/components/landing/problem-section";
import { Roadmap } from "@/components/landing/roadmap";

export const metadata: Metadata = {
	title: "Threadline — Your conversations, turned into closed deals",
	description:
		"Threadline is an agentic CRM. It turns WhatsApp chats, emails, calls and voice notes in any language into evidence-backed records, then follows up on every deal.",
};

export default function Home() {
	return (
		<>
			<LandingNav />
			<main
				id="main"
				className="flex min-h-svh w-full flex-col items-center overflow-clip bg-background font-sans text-foreground"
			>
				<Hero />
				<ChannelsStrip />
				<ProblemSection />
				<HowItWorks />
				<AgentFlows />
				<MoreFeatures />
				<Comparison />
				<GoogleCloud />
				<Roadmap />
				<Faq />
				<ClosingCta />
			</main>
			<LandingFooter />
			<LandingAnalytics />
		</>
	);
}

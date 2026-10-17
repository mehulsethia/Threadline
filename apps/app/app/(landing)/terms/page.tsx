import type { Metadata } from "next";
import { LegalPage } from "@/components/legal/legal-page";

export const metadata: Metadata = { title: "Terms of service" };

export default function TermsPage() {
	return (
		<LegalPage
			title="Terms of service"
			updated="17 October 2026"
			intro="These terms apply to your use of Threadline, an open source CRM operated as a hackathon project. By signing in you agree to them."
			sections={[
				{
					heading: "The service",
					body: [
						"Threadline is provided as is, without warranty of any kind. It is a demonstration project and may change, break or stop at any time.",
						"AI-extracted facts and drafted messages can be wrong. Review them before you rely on them or send them.",
					],
				},
				{
					heading: "Your account and data",
					body: [
						"You are responsible for the accounts you connect and for having the right to share the conversations you import.",
						"You keep ownership of your data. You give Threadline permission to process it only to provide the service, as described in the privacy policy.",
					],
				},
				{
					heading: "Acceptable use",
					body: [
						"Do not use Threadline to send spam, to process data you are not allowed to process, or to attack or overload the service.",
						"The public demo workspace is shared and reset every night. Do not put private data in it.",
					],
				},
				{
					heading: "Liability",
					body: [
						"To the extent the law allows, the operators of Threadline are not liable for any indirect or consequential loss arising from its use.",
					],
				},
				{
					heading: "Contact",
					body: ["Questions about these terms: mehulpersonal14@gmail.com."],
				},
			]}
		/>
	);
}

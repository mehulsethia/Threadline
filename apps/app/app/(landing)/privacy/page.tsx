import type { Metadata } from "next";
import { LegalPage } from "@/components/legal/legal-page";

export const metadata: Metadata = { title: "Privacy policy" };

const CONTACT = "mehulpersonal14@gmail.com";

export default function PrivacyPage() {
	return (
		<LegalPage
			title="Privacy policy"
			updated="17 October 2026"
			intro="Threadline is a CRM that turns sales conversations into contacts, deals, facts and follow-up tasks. This policy explains what data Threadline reads, why, and how it is protected."
			sections={[
				{
					heading: "Data we access",
					body: [
						"Account data: your name, email address and profile picture from the sign-in provider you use (Google or Microsoft).",
						"Google user data, only after you connect Google: Gmail messages (read only), Google Calendar events (read only) and Google Meet transcripts (read only, Google Workspace accounts only).",
						"Microsoft user data, only after you connect Microsoft: Outlook mail (read only).",
						"Data you connect or upload: Slack messages in channels where you add the Threadline app, Fireflies or Fathom meeting transcripts, WhatsApp chat exports, audio recordings and transcript files.",
					],
				},
				{
					heading: "How we use it",
					body: [
						"Threadline uses this data only to provide the CRM features you see: matching messages to the right contact and company, extracting deal facts with the quote they came from, creating follow-up tasks, and drafting follow-up messages that you approve before anything is sent.",
						"Text is processed by Google Gemini on Vertex AI in our Google Cloud project. It is not used to train AI models.",
						"Threadline never sends email, Slack or WhatsApp messages without an explicit approval from you.",
					],
				},
				{
					heading: "Google API Services User Data Policy",
					body: [
						"Threadline's use and transfer to any other app of information received from Google APIs will adhere to the Google API Services User Data Policy, including the Limited Use requirements.",
						"We do not sell Google user data, use it for advertising, or let humans read it, except with your consent, for security purposes, or to comply with the law.",
					],
				},
				{
					heading: "Storage and security",
					body: [
						"Data is stored in Google Cloud (Cloud SQL and Cloud Storage) in the United States. Connection tokens and API keys are encrypted at rest. Access to the service is over HTTPS only.",
						"We keep data while your workspace exists. The public demo workspace is reset every night.",
					],
				},
				{
					heading: "Your choices",
					body: [
						"You can disconnect Google, Microsoft, Slack, Fireflies or Fathom at any time in Settings → Connections, and revoke access from your Google or Microsoft account settings.",
						`To delete your data, email ${CONTACT}. We delete it within 30 days.`,
					],
				},
				{
					heading: "Contact",
					body: [`Questions about this policy: ${CONTACT}.`],
				},
			]}
		/>
	);
}

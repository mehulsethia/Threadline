const CHANNELS = [
	"WhatsApp exports",
	"Gmail",
	"Outlook",
	"Slack",
	"Google Meet",
	"Fireflies",
	"Fathom",
	"Call recordings",
	"Voice notes",
	"Website enquiry forms",
] as const;

export function ChannelsStrip() {
	return (
		<section
			aria-labelledby="channels-heading"
			className="flex w-full justify-center border-border border-y bg-surface-container px-4 py-8 sm:px-6"
		>
			<div className="flex w-full max-w-6xl flex-col gap-4 md:flex-row md:items-center md:gap-10">
				<h2
					id="channels-heading"
					className="shrink-0 font-sans text-muted-foreground text-sm tracking-normal"
				>
					Works from the conversations you already have
				</h2>
				<ul className="flex flex-wrap gap-x-6 gap-y-2 text-[15px]">
					{CHANNELS.map((channel) => (
						<li key={channel}>{channel}</li>
					))}
				</ul>
			</div>
		</section>
	);
}

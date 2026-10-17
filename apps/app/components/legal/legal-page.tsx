import { Link } from "@crm/ui/components/link";

export type LegalSection = { heading: string; body: string[] };

export function LegalPage({
	title,
	updated,
	intro,
	sections,
}: {
	title: string;
	updated: string;
	intro: string;
	sections: LegalSection[];
}) {
	return (
		<main
			id="main"
			className="flex min-h-svh w-full justify-center bg-background px-4 py-16 font-sans text-foreground"
		>
			<article className="flex w-full max-w-2xl flex-col gap-8">
				<header className="flex flex-col gap-2">
					<Link href="/" variant="quiet" className="text-sm">
						Threadline
					</Link>
					<h1 className="font-medium text-3xl tracking-tight">{title}</h1>
					<p className="text-muted-foreground text-sm">
						Last updated {updated}
					</p>
					<p className="text-base/7">{intro}</p>
				</header>
				{sections.map((section) => (
					<section key={section.heading} className="flex flex-col gap-3">
						<h2 className="font-medium text-xl">{section.heading}</h2>
						{section.body.map((paragraph) => (
							<p key={paragraph} className="text-base/7 text-muted-foreground">
								{paragraph}
							</p>
						))}
					</section>
				))}
			</article>
		</main>
	);
}

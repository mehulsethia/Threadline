import type * as React from "react";

const Logo = (props: React.SVGProps<SVGSVGElement>) => (
	<svg
		xmlns="http://www.w3.org/2000/svg"
		viewBox="0 0 24 24"
		fill="none"
		role="img"
		aria-label="Threadline logo"
		{...props}
	>
		<path
			d="M5 7h3.25c4.5 0 3 10 7.5 10H19"
			stroke="currentColor"
			strokeLinecap="round"
			strokeLinejoin="round"
			strokeWidth="2"
		/>
		<circle cx="4.25" cy="7" r="2.25" fill="currentColor" />
		<circle cx="19.75" cy="17" r="2.25" fill="currentColor" />
	</svg>
);
export default Logo;

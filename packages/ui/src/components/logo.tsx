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
			d="M15.75 3.25H8.25A4.75 4.75 0 0 0 3.5 8v5.5a4.75 4.75 0 0 0 4.75 4.75H9v3l4.5-3h2.25a4.75 4.75 0 0 0 4.75-4.75V8a4.75 4.75 0 0 0-4.75-4.75Z"
			stroke="currentColor"
			strokeLinecap="round"
			strokeLinejoin="round"
			strokeWidth="1.7"
		/>
		<path
			d="M6.5 8.75h1.25c2.5 0 2.5 4 5 4s2.5-4 5-4h.75m-12 4h1.25c2.5 0 2.5-4 5-4s2.5 4 5 4h.75"
			stroke="currentColor"
			strokeLinecap="round"
			strokeLinejoin="round"
			strokeWidth="1.5"
		/>
	</svg>
);
export default Logo;

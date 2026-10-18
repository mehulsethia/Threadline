import type * as React from "react";

const Logo = (props: React.SVGProps<SVGSVGElement>) => (
	<svg
		xmlns="http://www.w3.org/2000/svg"
		width={512}
		height={512}
		viewBox="0 0 512 512"
		fill="none"
		aria-label="Threadline Logo"
		{...props}
	>
		<path
			d="M96 112h320v64H288v224h-64V176H96z"
			fill="currentColor"
		/>
	</svg>
);
export default Logo;

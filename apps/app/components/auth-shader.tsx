export function AuthShader() {
	return (
		<div
			aria-hidden="true"
			className="pointer-events-none absolute inset-0 overflow-hidden select-none"
		>
			<div className="absolute -top-32 -left-32 size-[520px] rounded-full bg-primary/20 blur-[128px]" />
			<div className="absolute top-1/3 -right-24 size-[480px] rounded-full bg-tertiary/15 blur-[140px]" />
			<div className="absolute -bottom-24 left-1/4 size-[440px] rounded-full bg-primary/15 blur-[120px]" />
			<div className="dot-pattern absolute inset-0 opacity-40 [mask-image:radial-gradient(ellipse_at_center,black_40%,transparent_80%)]" />
			<div className="absolute inset-0 bg-gradient-to-t from-background/80 via-transparent to-background/30" />
		</div>
	);
}

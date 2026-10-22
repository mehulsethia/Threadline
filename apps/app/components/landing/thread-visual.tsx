type Line = { text: string; mark?: boolean }[];

type Bubble = {
	x: number;
	y: number;
	width: number;
	outbound?: boolean;
	lines: Line[];
};

type Field = {
	label: string;
	value: string;
	suggested?: boolean;
};

type Thread = { from: [number, number]; to: number };

const LINE = 22;

const BUBBLES: Bubble[] = [
	{
		x: 24,
		y: 96,
		width: 360,
		lines: [
			[{ text: "Hi, we are looking for" }],
			[{ text: "flow sensors", mark: true }, { text: " for three" }],
			[{ text: "production lines in Ohio." }],
		],
	},
	{
		x: 136,
		y: 202,
		width: 320,
		outbound: true,
		lines: [
			[{ text: "Happy to help. How many units" }],
			[{ text: "do you need, and by when?" }],
		],
	},
	{
		x: 24,
		y: 286,
		width: 360,
		lines: [
			[
				{ text: "We need " },
				{ text: "500 units", mark: true },
				{ text: ", budget" },
			],
			[
				{ text: "about " },
				{ text: "$72,000", mark: true },
				{ text: ", delivery by " },
				{ text: "end of Q1", mark: true },
				{ text: "." },
			],
		],
	},
	{
		x: 24,
		y: 370,
		width: 360,
		lines: [
			[{ text: "Please send the quote to" }],
			[{ text: "purchasing@weberind.com", mark: true }],
		],
	},
];

const FIELDS: Field[] = [
	{ label: "Contact", value: "Karen Weber, purchasing" },
	{ label: "Need", value: "Flow sensors for 3 production lines" },
	{ label: "Quantity", value: "500 units" },
	{ label: "Budget", value: "$72,000 (USD)" },
	{ label: "Timeline", value: "End of Q1" },
	{ label: "Email", value: "purchasing@weberind.com" },
	{ label: "Language", value: "English", suggested: true },
];

const ROW_TOP = 88;
const ROW = 52;
const RECORD_X = 640;

const THREADS: Thread[] = [
	{ from: [480, 36], to: 0 },
	{ from: [384, 142], to: 1 },
	{ from: [384, 310], to: 2 },
	{ from: [384, 332], to: 3 },
	{ from: [384, 332], to: 4 },
	{ from: [384, 416], to: 5 },
];

function rowAnchor(index: number): number {
	return ROW_TOP + ROW * index + 32;
}

function threadPath({ from: [x, y], to }: Thread): string {
	const endY = rowAnchor(to);
	const mid = (x + RECORD_X) / 2;
	return `M${x} ${y} C${mid} ${y} ${mid} ${endY} ${RECORD_X} ${endY}`;
}

function bubbleHeight(bubble: Bubble): number {
	return 24 + bubble.lines.length * LINE;
}

function ChatPanel() {
	return (
		<g>
			<rect
				x={0.5}
				y={0.5}
				width={479}
				height={479}
				rx={24}
				className="fill-card stroke-border"
			/>
			<circle cx={44} cy={36} r={16} className="fill-accent" />
			<text
				x={44}
				y={41}
				textAnchor="middle"
				className="fill-foreground font-sans font-semibold text-[13px]"
			>
				KW
			</text>
			<text
				x={72}
				y={32}
				className="fill-foreground font-sans font-semibold text-[15px]"
			>
				Karen Weber
			</text>
			<text
				x={72}
				y={51}
				className="fill-muted-foreground font-sans text-[12px]"
			>
				WhatsApp, Weber Industries
			</text>
			<line x1={0} x2={480} y1={72} y2={72} className="stroke-border" />
			{BUBBLES.map((bubble) => (
				<g key={bubble.y}>
					<rect
						x={bubble.x}
						y={bubble.y}
						width={bubble.width}
						height={bubbleHeight(bubble)}
						rx={16}
						className={bubble.outbound ? "fill-primary" : "fill-muted"}
					/>
					{bubble.lines.map((line, index) => (
						<text
							key={line.map((part) => part.text).join("")}
							x={bubble.x + 16}
							y={bubble.y + 29 + index * LINE}
							className={
								bubble.outbound
									? "fill-primary-foreground font-sans text-[15px]"
									: "fill-foreground font-sans text-[15px]"
							}
						>
							{line.map((part) =>
								part.mark ? (
									<tspan
										key={part.text}
										className="fill-tertiary font-semibold"
									>
										{part.text}
									</tspan>
								) : (
									<tspan key={part.text}>{part.text}</tspan>
								),
							)}
						</text>
					))}
				</g>
			))}
			<text
				x={24}
				y={462}
				className="fill-muted-foreground font-sans text-[12px]"
			>
				Imported from a WhatsApp export
			</text>
		</g>
	);
}

function RecordPanel() {
	return (
		<g transform={`translate(${RECORD_X} 0)`}>
			<rect
				x={0.5}
				y={0.5}
				width={479}
				height={479}
				rx={24}
				className="fill-card stroke-border"
			/>
			<text
				x={24}
				y={34}
				className="fill-foreground font-sans font-semibold text-[15px]"
			>
				Weber Industries Inc.
			</text>
			<text
				x={24}
				y={54}
				className="fill-muted-foreground font-sans text-[12px]"
			>
				Deal record, filled by Threadline
			</text>
			<rect
				x={372}
				y={22}
				width={84}
				height={28}
				rx={14}
				className="fill-accent"
			/>
			<text
				x={414}
				y={41}
				textAnchor="middle"
				className="fill-foreground font-sans font-medium text-[12px]"
			>
				Qualified
			</text>
			<line x1={0} x2={480} y1={72} y2={72} className="stroke-border" />
			{FIELDS.map((field, index) => {
				const top = ROW_TOP + ROW * index;
				return (
					<g key={field.label}>
						<text
							x={24}
							y={top + 20}
							className="fill-muted-foreground font-sans text-[12px]"
						>
							{field.label}
						</text>
						<text
							x={24}
							y={top + 40}
							className="fill-foreground font-sans text-[15px]"
						>
							{field.value}
						</text>
						{field.suggested ? (
							<>
								<rect
									x={368}
									y={top + 16}
									width={88}
									height={24}
									rx={12}
									className="fill-none stroke-foreground/40"
									strokeDasharray="3 3"
								/>
								<text
									x={412}
									y={top + 32}
									textAnchor="middle"
									className="fill-foreground font-sans text-[12px]"
								>
									Suggested
								</text>
							</>
						) : (
							<>
								<rect
									x={376}
									y={top + 16}
									width={80}
									height={24}
									rx={12}
									className="fill-primary"
								/>
								<text
									x={416}
									y={top + 32}
									textAnchor="middle"
									className="fill-primary-foreground font-sans text-[12px]"
								>
									Verified
								</text>
							</>
						)}
					</g>
				);
			})}
		</g>
	);
}

function MobileThread() {
	return (
		<div className="flex flex-col gap-4 lg:hidden">
			<div className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4">
				<p className="font-medium text-sm">Karen Weber on WhatsApp</p>
				<p className="rounded-lg bg-muted px-3 py-2 text-sm/6">
					We need <span className="font-semibold text-tertiary">500 units</span>
					, budget about{" "}
					<span className="font-semibold text-tertiary">$72,000</span>, delivery
					by <span className="font-semibold text-tertiary">end of Q1</span>.
				</p>
			</div>
			<div className="ml-6 h-6 w-px bg-thread" aria-hidden="true" />
			<dl className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-xl border border-border bg-card p-4 text-sm">
				<div>
					<dt className="text-muted-foreground text-xs">Quantity</dt>
					<dd>500 units</dd>
				</div>
				<div>
					<dt className="text-muted-foreground text-xs">Budget</dt>
					<dd>$72,000 (USD)</dd>
				</div>
				<div>
					<dt className="text-muted-foreground text-xs">Timeline</dt>
					<dd>End of Q1</dd>
				</div>
				<div>
					<dt className="text-muted-foreground text-xs">Language</dt>
					<dd>English, suggested</dd>
				</div>
			</dl>
		</div>
	);
}

export function ThreadVisual() {
	return (
		<figure className="w-full">
			<svg
				viewBox="0 0 1120 480"
				role="img"
				aria-label="A WhatsApp conversation on the left. Threads connect the quantity, budget, timeline and email the lead wrote to the matching fields of a deal record on the right. Language is marked as a suggestion."
				className="hidden h-auto w-full lg:block"
			>
				<ChatPanel />
				<RecordPanel />
				{THREADS.map((thread, index) => (
					<g key={`${thread.to}-${thread.from.join("-")}`}>
						<path
							d={threadPath(thread)}
							pathLength={1}
							className="thread-draw fill-none stroke-thread"
							strokeWidth={1.75}
							strokeLinecap="round"
							style={{ animationDelay: `${300 + index * 140}ms` }}
						/>
						<circle
							cx={thread.from[0]}
							cy={thread.from[1]}
							r={3.5}
							className="fill-thread"
						/>
						<circle
							cx={RECORD_X}
							cy={rowAnchor(thread.to)}
							r={3.5}
							className="fill-thread"
						/>
					</g>
				))}
			</svg>
			<MobileThread />
		</figure>
	);
}

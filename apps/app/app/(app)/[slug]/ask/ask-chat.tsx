"use client";

import Send from "@carbon/icons-react/es/Send";
import { Button } from "@crm/ui/components/button";
import { Markdown } from "@crm/ui/components/markdown";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@crm/ui/components/select";
import { Spinner } from "@crm/ui/components/spinner";
import { Textarea } from "@crm/ui/components/textarea";
import { useMountEffect } from "@crm/ui/hooks/use-mount-effect";
import { cn } from "@crm/ui/lib/utils";
import { parseAskStreamEvent } from "@crm/validation/ask-stream";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import {
	type RecordKind,
	useOpenRecord,
} from "@/components/crm/record-sheet/record-stack";
import {
	PageShellActions,
	PageShellContent,
	PageShellDescription,
	PageShellHeader,
	PageShellHeading,
	PageShellTitle,
} from "@/components/page-shell";

const turnSchema = z.object({
	id: z.number(),
	role: z.enum(["user", "assistant"]),
	text: z.string(),
});

type Turn = z.infer<typeof turnSchema>;

const conversationSchema = z.object({
	id: z.string(),
	title: z.string(),
	turns: z.array(turnSchema),
	updatedAt: z.number(),
});

type Conversation = z.infer<typeof conversationSchema>;

const STORAGE_KEY = "threadline.ask.conversations";
const MAX_CONVERSATIONS = 20;

function loadConversations(): Conversation[] {
	try {
		const raw = window.localStorage.getItem(STORAGE_KEY);
		if (!raw) return [];
		const parsed = z.array(conversationSchema).safeParse(JSON.parse(raw));
		return parsed.success ? parsed.data : [];
	} catch {
		return [];
	}
}

function storeConversations(conversations: Conversation[]): void {
	try {
		window.localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations));
	} catch {}
}

const TOOL_LABEL = new Map<string, string>(
	Object.entries({
		search_records: "Searching records",
		list_deals: "Reading deals",
		get_deal: "Reading a deal",
		search_conversations: "Reading conversations",
		list_promises: "Checking promises",
		list_tasks: "Checking tasks",
		pipeline_forecast: "Reading the forecast",
	}),
);

const SUGGESTIONS = [
	"Which deals are most likely to close this month?",
	"Which leads mentioned a competitor, and what did they say?",
	"What promises are overdue and who made them?",
	"Summarise my pipeline forecast by stage.",
	"Which hot leads have not replied in the last week?",
];

const RECORD_LINK = /\[([^\]]+)\]\((deal|contact|company):([^)\s]+)\)/g;

function withRecordLinks(text: string): string {
	return text.replace(
		RECORD_LINK,
		(_match, label, kind, id) => `[${label}](#record-${kind}-${id})`,
	);
}

function isRecordKind(value: string): value is RecordKind {
	return value === "deal" || value === "contact" || value === "company";
}

export function AskChat() {
	const openRecord = useOpenRecord();
	const [turns, setTurnsState] = useState<Turn[]>([]);
	const turnsRef = useRef<Turn[]>([]);
	const [conversationId, setConversationId] = useState(() =>
		crypto.randomUUID(),
	);
	const conversationRef = useRef(conversationId);
	const [conversations, setConversations] = useState<Conversation[]>([]);
	const setTurns = (update: (current: Turn[]) => Turn[]) =>
		setTurnsState((current) => {
			const next = update(current);
			turnsRef.current = next;
			return next;
		});

	useMountEffect(() => {
		setConversations(loadConversations());
	});

	const saveConversation = () => {
		const saved = turnsRef.current.filter((turn) => turn.text !== "");
		const first = saved.find((turn) => turn.role === "user");
		if (!first) return;
		const entry: Conversation = {
			id: conversationRef.current,
			title: first.text.slice(0, 80),
			turns: saved,
			updatedAt: Date.now(),
		};
		setConversations((current) => {
			const next = [
				entry,
				...current.filter((item) => item.id !== entry.id),
			].slice(0, MAX_CONVERSATIONS);
			storeConversations(next);
			return next;
		});
	};

	const startConversation = () => {
		if (pending) return;
		const id = crypto.randomUUID();
		conversationRef.current = id;
		setConversationId(id);
		setTurns(() => []);
		setDraft("");
	};

	const openConversation = (id: string) => {
		if (pending) return;
		const conversation = conversations.find((item) => item.id === id);
		if (!conversation) return;
		conversationRef.current = id;
		setConversationId(id);
		setTurns(() => conversation.turns);
		nextId.current = Math.max(0, ...conversation.turns.map((turn) => turn.id));
		scrollDown();
	};
	const [draft, setDraft] = useState("");
	const [pending, setPending] = useState(false);
	const [step, setStep] = useState<string | null>(null);
	const endRef = useRef<HTMLDivElement>(null);
	const nextId = useRef(0);
	const scrollDown = () =>
		requestAnimationFrame(() =>
			endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }),
		);

	const setAnswer = (id: number, text: string) =>
		setTurns((current) =>
			current.map((turn) => (turn.id === id ? { ...turn, text } : turn)),
		);

	const stream = async (
		history: { role: "user" | "assistant"; text: string }[],
	) => {
		nextId.current += 1;
		const answerId = nextId.current;
		let streamed = "";
		setTurns((current) => [
			...current,
			{ id: answerId, role: "assistant", text: "" },
		]);
		const response = await fetch("/api/assist/ask-stream", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ history }),
		});
		if (!response.ok || !response.body) {
			const body = (await response.json().catch(() => null)) as {
				message?: string;
			} | null;
			throw new Error(body?.message ?? "The question did not go through.");
		}
		const reader = response.body
			.pipeThrough(new TextDecoderStream())
			.getReader();
		let buffer = "";
		for (;;) {
			const { done, value } = await reader.read();
			if (done) break;
			buffer += value;
			const lines = buffer.split("\n");
			buffer = lines.pop() ?? "";
			for (const line of lines) {
				const event = parseAskStreamEvent(line);
				if (!event) continue;
				if (event.type === "tool") {
					setStep(TOOL_LABEL.get(event.name) ?? "Looking through your CRM");
				} else if (event.type === "text") {
					streamed += event.delta;
					setStep(null);
					setAnswer(answerId, streamed);
					scrollDown();
				} else if (event.type === "done") {
					setAnswer(answerId, event.answer);
					scrollDown();
				} else {
					throw new Error(event.message);
				}
			}
		}
	};

	const send = (text: string) => {
		const question = text.trim();
		if (!question || pending) return;
		nextId.current += 1;
		const next = [
			...turns,
			{ id: nextId.current, role: "user" as const, text: question },
		];
		setTurns(() => next);
		setDraft("");
		setPending(true);
		setStep("Looking through your CRM");
		scrollDown();
		stream(next.map((turn) => ({ role: turn.role, text: turn.text })))
			.catch((error) => {
				toast.error(
					error instanceof Error ? error.message : "The question failed.",
				);
				setTurns((current) =>
					current.filter(
						(turn) => !(turn.role === "assistant" && turn.text === ""),
					),
				);
			})
			.finally(() => {
				setPending(false);
				setStep(null);
				saveConversation();
			});
	};

	const onAnswerClick = (event: React.MouseEvent<HTMLDivElement>) => {
		const anchor = (event.target as HTMLElement).closest("a");
		const href = anchor?.getAttribute("href") ?? "";
		const match = /^#record-(deal|contact|company)-(.+)$/.exec(href);
		if (!match?.[1] || !match[2] || !isRecordKind(match[1])) return;
		event.preventDefault();
		openRecord({ kind: match[1], id: match[2] });
	};

	return (
		<>
			<PageShellHeader>
				<PageShellHeading>
					<PageShellTitle>Ask your CRM</PageShellTitle>
					<PageShellDescription>
						Ask anything about your deals, conversations, promises and forecast.
						Answers come from your data and link to the records.
					</PageShellDescription>
				</PageShellHeading>
				<PageShellActions>
					{conversations.length > 0 ? (
						<Select
							value={
								conversations.some((item) => item.id === conversationId)
									? conversationId
									: ""
							}
							onValueChange={openConversation}
							disabled={pending}
						>
							<SelectTrigger className="w-56" aria-label="Past conversations">
								<SelectValue placeholder="Past conversations" />
							</SelectTrigger>
							<SelectContent>
								{conversations.map((item) => (
									<SelectItem key={item.id} value={item.id}>
										<span className="truncate">{item.title}</span>
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					) : null}
					<Button
						variant="outline"
						onClick={startConversation}
						disabled={pending || turns.length === 0}
					>
						New conversation
					</Button>
				</PageShellActions>
			</PageShellHeader>
			<PageShellContent className="flex min-h-0 flex-1 flex-col gap-4">
				<div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
					{turns.length === 0 ? (
						<div className="flex flex-col gap-3">
							<p className="text-muted-foreground text-sm">Try one of these:</p>
							<div className="flex flex-wrap gap-2">
								{SUGGESTIONS.map((suggestion) => (
									<Button
										key={suggestion}
										variant="outline"
										size="sm"
										onClick={() => send(suggestion)}
									>
										{suggestion}
									</Button>
								))}
							</div>
						</div>
					) : null}
					{turns
						.filter((turn) => turn.text !== "")
						.map((turn) => (
							<div
								key={turn.id}
								className={cn(
									"max-w-3xl rounded-lg px-4 py-3",
									turn.role === "user"
										? "self-end bg-primary text-primary-foreground"
										: "self-start border bg-card",
								)}
							>
								{turn.role === "user" ? (
									<p className="whitespace-pre-wrap text-sm">{turn.text}</p>
								) : (
									<div onClickCapture={onAnswerClick}>
										<Markdown className="text-sm/6">
											{withRecordLinks(turn.text)}
										</Markdown>
									</div>
								)}
							</div>
						))}
					{pending && step ? (
						<div className="flex items-center gap-2 self-start text-muted-foreground text-sm">
							<Spinner /> {step}…
						</div>
					) : null}
					<div ref={endRef} />
				</div>
				<form
					className="flex items-end gap-2"
					onSubmit={(event) => {
						event.preventDefault();
						send(draft);
					}}
				>
					<Textarea
						rows={2}
						value={draft}
						onChange={(event) => setDraft(event.target.value)}
						onKeyDown={(event) => {
							if (event.key === "Enter" && !event.shiftKey) {
								event.preventDefault();
								send(draft);
							}
						}}
						placeholder="Ask about deals, leads, promises or your forecast…"
						aria-label="Your question"
						className="min-h-0 flex-1"
					/>
					<Button type="submit" disabled={pending || !draft.trim()}>
						<Send data-icon="inline-start" />
						Ask
					</Button>
				</form>
			</PageShellContent>
		</>
	);
}

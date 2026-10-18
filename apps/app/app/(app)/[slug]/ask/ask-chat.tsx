"use client";

import Send from "@carbon/icons-react/es/Send";
import { Button } from "@crm/ui/components/button";
import { Markdown } from "@crm/ui/components/markdown";
import { Spinner } from "@crm/ui/components/spinner";
import { Textarea } from "@crm/ui/components/textarea";
import { cn } from "@crm/ui/lib/utils";
import { useMutation } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { toast } from "sonner";
import {
	type RecordKind,
	useOpenRecord,
} from "@/components/crm/record-sheet/record-stack";
import {
	PageShellContent,
	PageShellDescription,
	PageShellHeader,
	PageShellHeading,
	PageShellTitle,
} from "@/components/page-shell";
import { useTRPC } from "@/lib/trpc/client";

type Turn = { id: number; role: "user" | "assistant"; text: string };

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
	const trpc = useTRPC();
	const openRecord = useOpenRecord();
	const [turns, setTurns] = useState<Turn[]>([]);
	const [draft, setDraft] = useState("");
	const endRef = useRef<HTMLDivElement>(null);
	const nextId = useRef(0);
	const scrollDown = () =>
		requestAnimationFrame(() =>
			endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }),
		);
	const ask = useMutation(
		trpc.assist.ask.mutationOptions({
			onSuccess: (data) => {
				nextId.current += 1;
				const id = nextId.current;
				setTurns((current) => [
					...current,
					{ id, role: "assistant", text: data.answer },
				]);
				scrollDown();
			},
			onError: (error) => {
				toast.error(error.message);
				setTurns((current) => current.slice(0, -1));
			},
		}),
	);

	const send = (text: string) => {
		const question = text.trim();
		if (!question || ask.isPending) return;
		nextId.current += 1;
		const next = [
			...turns,
			{ id: nextId.current, role: "user" as const, text: question },
		];
		setTurns(next);
		setDraft("");
		scrollDown();
		ask.mutate({
			history: next.map((turn) => ({ role: turn.role, text: turn.text })),
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
					{turns.map((turn) => (
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
					{ask.isPending ? (
						<div className="flex items-center gap-2 self-start text-muted-foreground text-sm">
							<Spinner /> Looking through your CRM…
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
					<Button type="submit" disabled={ask.isPending || !draft.trim()}>
						<Send data-icon="inline-start" />
						Ask
					</Button>
				</form>
			</PageShellContent>
		</>
	);
}

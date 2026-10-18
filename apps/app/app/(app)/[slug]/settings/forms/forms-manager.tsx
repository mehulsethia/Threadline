"use client";

import { Button } from "@crm/ui/components/button";
import { Input } from "@crm/ui/components/input";
import { Label } from "@crm/ui/components/label";
import { Switch } from "@crm/ui/components/switch";
import { Textarea } from "@crm/ui/components/textarea";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { useTRPC } from "@/lib/trpc/client";

export function FormsManager() {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const forms = useQuery(trpc.forms.list.queryOptions());
	const refresh = () =>
		queryClient.invalidateQueries({ queryKey: trpc.forms.list.queryKey() });
	const [title, setTitle] = useState("Talk to sales");
	const [description, setDescription] = useState(
		"Tell us what you need and we will get back within one business day.",
	);
	const create = useMutation(
		trpc.forms.create.mutationOptions({
			onSuccess: () => {
				toast.success("Form created.");
				void refresh();
			},
			onError: (error) => toast.error(error.message),
		}),
	);
	const update = useMutation(
		trpc.forms.update.mutationOptions({ onSuccess: () => void refresh() }),
	);
	const remove = useMutation(
		trpc.forms.remove.mutationOptions({ onSuccess: () => void refresh() }),
	);
	const origin = globalThis.location?.origin ?? "";

	return (
		<div className="flex flex-col gap-6">
			<form
				className="flex flex-col gap-3 rounded-lg border bg-card p-6"
				onSubmit={(event) => {
					event.preventDefault();
					if (title.trim())
						create.mutate({
							title: title.trim(),
							description: description.trim() || null,
						});
				}}
			>
				<h2 className="font-medium text-base">New form</h2>
				<div className="flex flex-col gap-2">
					<Label htmlFor="form-title">Title</Label>
					<Input
						id="form-title"
						value={title}
						onChange={(e) => setTitle(e.target.value)}
						required
					/>
				</div>
				<div className="flex flex-col gap-2">
					<Label htmlFor="form-description">Description</Label>
					<Textarea
						id="form-description"
						rows={2}
						value={description}
						onChange={(e) => setDescription(e.target.value)}
					/>
				</div>
				<Button type="submit" disabled={create.isPending || !title.trim()}>
					Create form
				</Button>
			</form>

			<ul className="flex flex-col gap-3">
				{(forms.data ?? []).map((form) => {
					const url = `${origin}${form.path}`;
					return (
						<li
							key={form.id}
							className="flex flex-col gap-3 rounded-lg border bg-card p-6"
						>
							<div className="flex items-center justify-between gap-3">
								<h3 className="font-medium">{form.title}</h3>
								<div className="flex items-center gap-2 text-sm">
									<Label htmlFor={`active-${form.id}`}>Accepting</Label>
									<Switch
										id={`active-${form.id}`}
										checked={form.active}
										onCheckedChange={(active) =>
											update.mutate({ id: form.id, active })
										}
									/>
								</div>
							</div>
							<p className="text-muted-foreground text-sm">
								{form.submissions} submission{form.submissions === 1 ? "" : "s"}
							</p>
							<div className="flex flex-wrap items-center gap-2">
								<Input
									readOnly
									value={url}
									aria-label="Form link"
									className="min-w-0 flex-1"
								/>
								<Button
									variant="outline"
									size="sm"
									onClick={() => {
										void navigator.clipboard.writeText(url);
										toast.success("Link copied.");
									}}
								>
									Copy link
								</Button>
								<Button asChild variant="outline" size="sm">
									<a href={form.path} target="_blank" rel="noreferrer">
										Open
									</a>
								</Button>
								<Button
									variant="ghost"
									size="sm"
									disabled={remove.isPending}
									onClick={() => remove.mutate({ id: form.id })}
								>
									Delete
								</Button>
							</div>
						</li>
					);
				})}
			</ul>
		</div>
	);
}

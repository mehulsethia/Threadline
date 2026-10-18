import {
	type Db,
	IntakeSourceType,
	requireWorkspaceId,
	rootDb,
	runInWorkspace,
} from "@crm/db";
import { captureConversation } from "@crm/db/capture";
import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { z } from "zod";
import { AgentTriggerService } from "../agent/agent-trigger.service";
import { InjectDatabase } from "../database/database.constants";
import type {
	LeadFormOutput,
	leadFormCreateInput,
	leadFormUpdateInput,
	publicSubmission,
} from "./forms.contracts";

type LeadFormRow = {
	id: string;
	title: string;
	description: string | null;
	thankYou: string | null;
	active: boolean;
	submissions: number;
	createdAt: Date;
};

@Injectable()
export class FormsService {
	constructor(
		@InjectDatabase() private readonly db: Db,
		@Inject(AgentTriggerService) private readonly agent: AgentTriggerService,
	) {}

	private async slug(): Promise<string> {
		const org = await rootDb.organization.findUnique({
			where: { id: requireWorkspaceId() },
			select: { slug: true },
		});
		return org?.slug ?? "";
	}

	private shape(row: LeadFormRow, slug: string): LeadFormOutput {
		return {
			...row,
			path: `/f/${slug}/${row.id}`,
			createdAt: row.createdAt.toISOString(),
		};
	}

	async list(): Promise<LeadFormOutput[]> {
		const [rows, slug] = await Promise.all([
			this.db.leadForm.findMany({ orderBy: { createdAt: "desc" } }),
			this.slug(),
		]);
		return rows.map((row) => this.shape(row, slug));
	}

	async create(input: z.infer<typeof leadFormCreateInput>) {
		const row = await this.db.leadForm.create({
			data: {
				title: input.title,
				description: input.description ?? null,
				thankYou: input.thankYou ?? null,
			},
		});
		return this.shape(row, await this.slug());
	}

	async update(input: z.infer<typeof leadFormUpdateInput>) {
		const { id, ...data } = input;
		const row = await this.db.leadForm.update({ where: { id }, data });
		return this.shape(row, await this.slug());
	}

	async remove(id: string) {
		await this.db.leadForm.delete({ where: { id } });
		return { ok: true };
	}

	private async workspaceForSlug(
		slug: string,
	): Promise<{ id: string; name: string }> {
		const org = await rootDb.organization.findUnique({
			where: { slug },
			select: { id: true, name: true },
		});
		if (!org) throw new NotFoundException("Form not found.");
		return org;
	}

	async publicForm(slug: string, formId: string) {
		const org = await this.workspaceForSlug(slug);
		const form = await runInWorkspace(org.id, () =>
			this.db.leadForm.findFirst({
				where: { id: formId, active: true },
				select: { title: true, description: true, thankYou: true },
			}),
		);
		if (!form) throw new NotFoundException("Form not found.");
		return { ...form, workspace: org.name };
	}

	async submit(
		slug: string,
		formId: string,
		input: z.infer<typeof publicSubmission>,
	): Promise<{ ok: true; thankYou: string | null }> {
		const org = await this.workspaceForSlug(slug);
		return runInWorkspace(org.id, async () => {
			const form = await this.db.leadForm.findFirst({
				where: { id: formId, active: true },
				select: { id: true, title: true, thankYou: true },
			});
			if (!form) throw new NotFoundException("Form not found.");
			if (input.website) return { ok: true, thankYou: form.thankYou };

			await this.db.leadForm.update({
				where: { id: form.id },
				data: { submissions: { increment: 1 } },
			});
			const details = [
				input.company && `Company: ${input.company}`,
				`Email: ${input.email}`,
				input.phone && `Phone: ${input.phone}`,
			]
				.filter(Boolean)
				.join(". ");
			const captured = await captureConversation(this.db, {
				sourceType: IntakeSourceType.FORM_SUBMISSION,
				externalId: `form:${form.id}:${crypto.randomUUID()}`,
				sourceUri: `form://${form.id}`,
				title: `${form.title}: ${input.name}`,
				messages: [
					{
						lineNo: 1,
						timestamp: new Date(),
						sender: input.name,
						text: `${input.message}\n\n${details}.`,
					},
				],
			});
			if (captured.queued) {
				const queued = await this.agent.queueIntake(captured.jobId, {
					jobId: captured.jobId,
					me: org.name,
					leadEmail: input.email,
					leadPhone: input.phone || null,
				});
				if (queued) this.agent.poke();
			}
			return { ok: true, thankYou: form.thankYou };
		});
	}
}

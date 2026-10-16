import { ActivityType, db } from "@crm/db";
import { defineTool } from "eve/tools";
import { z } from "zod";
import { researchCompany } from "../../adk/research/company";

export default defineTool({
	description:
		"Performs live web research on a company using Google Search grounding on Vertex AI: overview, size signals, location, recent news, and citations.",
	inputSchema: z.object({
		companyId: z.string(),
	}),
	async execute({ companyId }) {
		const company = await db.company.findUnique({
			where: { id: companyId },
			select: {
				id: true,
				name: true,
				domain: true,
				website: true,
				city: true,
				ownerId: true,
			},
		});

		if (!company) {
			return { written: false as const, reason: "No such company." };
		}

		const result = await researchCompany({
			companyName: company.name,
			city: company.city,
			domain: company.domain,
		});

		if (!result) {
			return {
				written: false as const,
				reason: "Research returned no results.",
			};
		}

		const author =
			company.ownerId ??
			(await db.user.findFirst({ select: { id: true } }))?.id ??
			null;

		if (!author) {
			return { written: false as const, reason: "No user to attribute to." };
		}

		const bodySections: string[] = [];
		if (result.overview) bodySections.push(result.overview);
		if (result.sizeSignals)
			bodySections.push(`Size & Scale: ${result.sizeSignals}`);
		if (result.location) bodySections.push(`Location: ${result.location}`);
		if (result.recentNews)
			bodySections.push(`Recent News:\n${result.recentNews}`);
		if (result.sourceUrls.length > 0) {
			bodySections.push(
				`Sources:\n${result.sourceUrls.map((u) => `• ${u}`).join("\n")}`,
			);
		}

		const activity = await db.activity.create({
			data: {
				type: ActivityType.ENRICHMENT,
				subject: `Research brief — ${company.name}`,
				body: bodySections.join("\n\n"),
				occurredAt: new Date(),
				companyId: company.id,
				createdById: author,
				meta: {
					source: "google.search.grounded",
					latencyMs: result.latencyMs,
					estimatedCostUsd: result.estimatedCostUsd,
					citations: result.sourceUrls.length,
				},
			},
			select: { id: true },
		});

		await db.company.update({
			where: { id: companyId },
			data: { lastActivityAt: new Date() },
		});

		return {
			written: true as const,
			activityId: activity.id,
			latencyMs: result.latencyMs,
			estimatedCostUsd: result.estimatedCostUsd,
		};
	},
});

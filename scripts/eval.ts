/**
 * Intake accuracy evaluation against hand-made gold labels.
 *
 * Runs the real intake pipeline (Gemini on Vertex) over each fixture in a
 * dedicated, freshly migrated database, then scores what the job itself
 * created. Nothing is looked up by the expected answer, quotes must appear
 * verbatim in the source, and every PASS/FAIL is computed.
 *
 *   DATABASE_URL=postgresql://.../crm_eval bun scripts/eval.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { runAdkIntakeTask } from "../apps/agent/adk/intake/agent";
import { AgentTriggerService } from "../apps/api/src/agent/agent-trigger.service";
import { IntakeService } from "../apps/api/src/intake/intake.service";
import { ActivityType, db } from "../packages/db/src";
import { WORKSPACE_ID } from "../packages/db/src/workspace";

type Groups = string[][];

type GoldFixture = {
	id: string;
	sourceFile: string;
	contact: { name: string };
	company: { name: string | null; sellerName?: string };
	amount: { value: number; currency: string };
	stage: { value: string };
	nextTask: { groups: Groups };
	objections: Array<{ groups: Groups }>;
};

type Check = { field: string; expected: string; got: string; pass: boolean };

type FixtureResult = {
	id: string;
	sourceFile: string;
	jobStatus: string;
	checks: Check[];
	quotes: { total: number; verified: number; failures: string[] };
	inferences: { total: number; proposed: number; appliedFields: string[] };
};

const INFERENCE_KINDS = new Set(["agent.inference", "web.grounded"]);
const EVAL_EMAIL = "eval@threadline.example";
const EVAL_USER_ID = "user-eval";

function assertEvalDatabase(): void {
	const url = process.env.DATABASE_URL ?? "";
	const name = url.split("/").pop()?.split("?")[0] ?? "";
	if (!name.includes("eval")) {
		throw new Error(
			`Refusing to run: DATABASE_URL points at "${name}". Use a dedicated database whose name contains "eval".`,
		);
	}
}

function normalize(text: string): string {
	return text
		.normalize("NFC")
		.toLowerCase()
		.replace(/[‘’]/g, "'")
		.replace(/[“”]/g, '"')
		.replace(/\s+/g, " ")
		.trim();
}

function fullName(c: { firstName: string; lastName: string | null }): string {
	return `${c.firstName} ${c.lastName ?? ""}`.trim();
}

function matchesGroups(text: string, groups: Groups): boolean {
	const hay = normalize(text);
	return groups.every((alternatives) =>
		alternatives.some((alt) => hay.includes(alt.toLowerCase())),
	);
}

/** The quote inside an intake evidence item: `"<quote>" (speaker: X)`. */
function quoteOf(item: Record<string, unknown>): string | null {
	if (typeof item.quote === "string") return item.quote;
	if (typeof item.detail !== "string") return null;
	const match = item.detail.match(/^"([\s\S]*)" \(speaker: [^)]*\)$/);
	return match?.[1] ?? null;
}

async function ensureWorkspace(): Promise<void> {
	await db.organization.upsert({
		where: { id: WORKSPACE_ID },
		create: {
			id: WORKSPACE_ID,
			name: "Threadline Eval",
			slug: "threadline-eval",
			createdAt: new Date(),
		},
		update: {},
	});
	await db.user.upsert({
		where: { id: EVAL_USER_ID },
		create: {
			id: EVAL_USER_ID,
			name: "Eval Runner",
			email: EVAL_EMAIL,
			emailVerified: true,
			createdAt: new Date(),
			updatedAt: new Date(),
		},
		update: {},
	});
}

async function ingest(sourceFile: string): Promise<string> {
	const bytes = readFileSync(resolve(sourceFile));
	const intake = new IntakeService(db, new AgentTriggerService(db));

	const upload = await intake.uploadAndCreateJob(
		{
			originalname: sourceFile.split("/").pop() ?? sourceFile,
			buffer: bytes,
			mimetype: "text/plain",
			size: bytes.length,
		},
		{ autoStart: false, userId: EVAL_USER_ID },
	);
	const preview = await intake.previewParticipants({ jobId: upload.jobId });
	await intake.start({ jobId: upload.jobId, me: preview.me });

	const task = (
		await db.agentTask.findMany({
			where: { kind: "intake", finishedAt: null },
			orderBy: { createdAt: "desc" },
		})
	).find(
		(t) =>
			(t.payload as Record<string, unknown> | null)?.jobId === upload.jobId,
	);
	if (!task) throw new Error(`No intake task queued for ${sourceFile}.`);

	// biome-ignore lint/suspicious/noExplicitAny: the leased-task shape is internal to the agent.
	await runAdkIntakeTask(task as any);
	return upload.jobId;
}

async function scoreFixture(gold: GoldFixture): Promise<FixtureResult> {
	console.log(`\nIngesting ${gold.sourceFile}...`);
	const jobId = await ingest(gold.sourceFile);
	const job = await db.intakeJob.findUniqueOrThrow({ where: { id: jobId } });

	const deal = job.createdDealIds[0]
		? await db.deal.findUnique({
				where: { id: job.createdDealIds[0] },
				include: { company: true, contacts: { include: { contact: true } } },
			})
		: null;
	const contacts = await db.contact.findMany({
		where: { id: { in: job.createdContactIds } },
		include: { company: true },
	});
	const people = deal ? deal.contacts.map((dc) => dc.contact) : contacts;
	const contactIds = [
		...new Set([...people.map((p) => p.id), ...job.createdContactIds]),
	];

	const factWhere = {
		OR: [
			{ contactId: { in: contactIds } },
			...(deal ? [{ dealId: deal.id }] : []),
		],
	};
	const facts = await db.contactFact.findMany({ where: factWhere });
	const tasks = await db.activity.findMany({
		where: { ...factWhere, type: ActivityType.TASK },
	});

	const checks: Check[] = [];
	const names = people.map(fullName);
	checks.push({
		field: "contact",
		expected: gold.contact.name,
		got: names.join(", ") || "(none)",
		pass: names.some((n) => normalize(n) === normalize(gold.contact.name)),
	});

	const companyName =
		deal?.company?.name ??
		contacts.find((c) => c.company)?.company?.name ??
		null;
	checks.push({
		field: "company",
		expected: gold.company.name ?? `(none; not ${gold.company.sellerName})`,
		got: companyName ?? "(none)",
		pass:
			gold.company.name === null
				? !companyName ||
					normalize(companyName) !== normalize(gold.company.sellerName ?? "")
				: normalize(companyName ?? "") === normalize(gold.company.name),
	});

	const amount = deal?.amount == null ? null : Number(deal.amount);
	checks.push({
		field: "amount",
		expected: String(gold.amount.value),
		got: String(amount),
		pass: amount === gold.amount.value,
	});
	checks.push({
		field: "currency",
		expected: gold.amount.currency,
		got: deal?.currency ?? "(none)",
		pass: (deal?.currency ?? "").toUpperCase() === gold.amount.currency,
	});
	checks.push({
		field: "stage",
		expected: gold.stage.value,
		got: deal?.stage ?? "(none)",
		pass: deal?.stage === gold.stage.value,
	});

	const openTasks = tasks.filter((t) => !t.completedAt && t.subject);
	checks.push({
		field: "nextTask",
		expected: gold.nextTask.groups.map((g) => g.join(" or ")).join(" + "),
		got: openTasks.map((t) => t.subject).join(" / ") || "(none)",
		pass: openTasks.some((t) =>
			matchesGroups(t.subject ?? "", gold.nextTask.groups),
		),
	});

	const objectionFacts = facts.filter((f) =>
		/objection|requirement|concern|blocker|compliance/i.test(f.field),
	);
	gold.objections.forEach((objection, i) => {
		checks.push({
			field: `objection ${i + 1}`,
			expected: objection.groups.map((g) => g.join(" or ")).join(" + "),
			got: objectionFacts.map((f) => f.value).join(" / ") || "(none)",
			pass: objectionFacts.some((f) =>
				matchesGroups(f.value, objection.groups),
			),
		});
	});

	const source = normalize(readFileSync(resolve(gold.sourceFile), "utf8"));
	const quotes = { total: 0, verified: 0, failures: [] as string[] };
	const inferences = { total: 0, proposed: 0, appliedFields: [] as string[] };

	for (const fact of facts) {
		const evidence = Array.isArray(fact.evidence) ? fact.evidence : [];
		let inferred = false;
		for (const raw of evidence) {
			if (!raw || typeof raw !== "object") continue;
			const item = raw as Record<string, unknown>;
			if (typeof item.kind === "string" && INFERENCE_KINDS.has(item.kind)) {
				inferred = true;
			}
			const quote = quoteOf(item);
			if (!quote || item.kind === "web.grounded") continue;
			quotes.total++;
			if (source.includes(normalize(quote))) {
				quotes.verified++;
			} else {
				quotes.failures.push(`${fact.field}: "${quote.slice(0, 90)}"`);
			}
		}
		if (inferred) {
			inferences.total++;
			if (fact.status === "APPLIED") {
				inferences.appliedFields.push(`${fact.field} = ${fact.value}`);
			} else {
				inferences.proposed++;
			}
		}
	}

	return {
		id: gold.id,
		sourceFile: gold.sourceFile,
		jobStatus: job.status,
		checks,
		quotes,
		inferences,
	};
}

async function duplicateCheck(sourceFile: string) {
	const count = async () => ({
		contacts: await db.contact.count(),
		deals: await db.deal.count(),
		messages: await db.whatsAppMessage.count(),
		tasks: await db.activity.count({ where: { type: ActivityType.TASK } }),
	});
	const before = await count();
	console.log(`\nRe-importing ${sourceFile} to check idempotency...`);
	await ingest(sourceFile);
	const after = await count();
	return {
		contacts: after.contacts - before.contacts,
		deals: after.deals - before.deals,
		messages: after.messages - before.messages,
		tasks: after.tasks - before.tasks,
	};
}

function pct(n: number, d: number): string {
	return d === 0 ? "n/a" : `${((n / d) * 100).toFixed(1)}%`;
}

async function main() {
	assertEvalDatabase();
	await ensureWorkspace();

	const gold = JSON.parse(
		readFileSync(resolve("test/eval-gold-labels.json"), "utf8"),
	) as { fixtures: GoldFixture[] };

	const results: FixtureResult[] = [];
	for (const fixture of gold.fixtures) {
		results.push(await scoreFixture(fixture));
	}
	const dupes = await duplicateCheck("fixtures/saas-pipeline-us.txt");

	const checks = results.flatMap((r) => r.checks);
	const coreFields = ["contact", "company", "amount", "currency", "stage"];
	const core = checks.filter((c) => coreFields.includes(c.field));
	const taskChecks = checks.filter((c) => c.field === "nextTask");
	const objectionChecks = checks.filter((c) => c.field.startsWith("objection"));
	const passed = (list: Check[]) => list.filter((c) => c.pass).length;

	const quotesTotal = results.reduce((a, r) => a + r.quotes.total, 0);
	const quotesOk = results.reduce((a, r) => a + r.quotes.verified, 0);
	const infTotal = results.reduce((a, r) => a + r.inferences.total, 0);
	const infOk = results.reduce((a, r) => a + r.inferences.proposed, 0);
	const dupTotal = dupes.contacts + dupes.deals + dupes.messages + dupes.tasks;

	const summary = [
		["All scored fields", passed(checks), checks.length],
		[
			"Core fields (contact, company, amount, currency, stage)",
			passed(core),
			core.length,
		],
		["Next task", passed(taskChecks), taskChecks.length],
		["Objections", passed(objectionChecks), objectionChecks.length],
		["Evidence quotes found verbatim in the source", quotesOk, quotesTotal],
		["Inferences held as PROPOSED (not applied)", infOk, infTotal],
	] as const;

	for (const [label, n, d] of summary) {
		console.log(`${label}: ${pct(n, d)} (${n}/${d})`);
	}
	console.log(`Records duplicated on re-import: ${dupTotal}`, dupes);

	const fixtureSections = results
		.map((r) => {
			const rows = r.checks
				.map(
					(c) =>
						`| ${c.field} | ${c.expected} | ${c.got.replace(/\|/g, "/")} | ${c.pass ? "pass" : "**FAIL**"} |`,
				)
				.join("\n");
			const quoteMisses = r.quotes.failures.length
				? `\n\nQuotes not found verbatim:\n${r.quotes.failures.map((f) => `- ${f}`).join("\n")}`
				: "";
			const applied = r.inferences.appliedFields.length
				? `\n\nInferences that were APPLIED:\n${r.inferences.appliedFields.map((f) => `- ${f}`).join("\n")}`
				: "";
			return `### ${r.id} (\`${r.sourceFile}\`, job ${r.jobStatus})

| Field | Gold | Pipeline | Result |
| :--- | :--- | :--- | :--- |
${rows}

Quotes verbatim: ${r.quotes.verified}/${r.quotes.total}. Inferences proposed: ${r.inferences.proposed}/${r.inferences.total}.${quoteMisses}${applied}`;
		})
		.join("\n\n");

	const markdown = `# Threadline intake evaluation

Generated by \`bun run eval\` on ${new Date().toISOString().slice(0, 10)} against a freshly migrated database.

## Method

- **Gold labels** (\`test/eval-gold-labels.json\`) were written by hand from the fixture text, with the line numbers each label rests on. They were not derived from model output. Stage follows the rule written in that file.
- The real intake pipeline (Gemini on Vertex AI via ADK) runs on each fixture. The script scores only the records that intake job created; it never looks a record up by the expected answer.
- **Next task** and **objections** use keyword groups fixed in the gold file before the run (English or the conversation's language both count).
- **Quotes**: every evidence quote on the extracted facts must appear verbatim (case and whitespace normalised) in the source file. Grounded web citations are excluded.
- **Inferences**: facts whose evidence is \`agent.inference\` or \`web.grounded\` must not be APPLIED.
- Five fixtures is a small sample; treat these numbers as a smoke-level accuracy check, not a benchmark. Model output varies between runs.

## Results

| Metric | Result |
| :--- | :--- |
${summary.map(([label, n, d]) => `| ${label} | ${pct(n, d)} (${n}/${d}) |`).join("\n")}
| Records duplicated on re-importing \`saas-pipeline-us.txt\` | ${dupTotal} (contacts ${dupes.contacts}, deals ${dupes.deals}, messages ${dupes.messages}, tasks ${dupes.tasks}) |

## Per fixture

${fixtureSections}
`;

	writeFileSync(resolve("docs/EVAL.md"), markdown, "utf8");
	console.log("\nWrote docs/EVAL.md");
	await db.$disconnect();
}

main().catch(async (err) => {
	console.error("Evaluation failed:", err);
	await db.$disconnect();
	process.exit(1);
});

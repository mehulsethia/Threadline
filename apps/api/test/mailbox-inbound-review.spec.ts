import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { db, type MailboxSyncModel as MailboxSync } from "@crm/db";
import type { AgentTriggerService } from "../src/agent/agent-trigger.service";
import { CompanyDirectoryService } from "../src/companies/company-directory.service";
import { ActivityStampService } from "../src/crm/activity-stamp.service";
import { EnrichmentLogService } from "../src/crm/enrichment-log.service";
import type { EmailCaptureService } from "../src/mailbox/email-capture.service";
import { MailboxMatchService } from "../src/mailbox/mailbox-match.service";
import {
	type IncomingMessage,
	ThreadWriterService,
} from "../src/mailbox/thread-writer.service";
import { withDiscardedCrmEvents } from "./agent-trigger.stub";

const suffix = process.env.TEST_RUN_ID ?? "inbound-review-spec";
const domain = `inbound-${suffix}.test`;
const userId = `user-${suffix}`;
const mailbox = `rep-${suffix}@example.test`;
const stranger = `founder@${domain}`;
const freeMail = `lead.${suffix}@gmail.com`;
const roots = [`<work-${suffix}@mail.test>`, `<free-${suffix}@mail.test>`];

const agent = {
	contactCreated: async () => true,
	companyCreated: async () => undefined,
	withCrmEvents: withDiscardedCrmEvents,
	companyRequested: async () => true,
} as unknown as AgentTriggerService;

const stamp = new ActivityStampService(db);
const directory = new CompanyDirectoryService(agent);
const log = new EnrichmentLogService(db, stamp);
const match = new MailboxMatchService(db, directory, agent, log);
const capture = {
	captureThread: async () => undefined,
} as unknown as EmailCaptureService;
const threads = new ThreadWriterService(db, match, stamp, capture);

let row: MailboxSync;

function inbound(from: string, root: string): IncomingMessage {
	return {
		rfcMessageId: root,
		rootId: root,
		subject: "Can you quote us?",
		from: { email: from, name: "New Lead" },
		recipients: [{ email: mailbox, name: "Test Rep", kind: "to" }],
		body: "We need a quote for next quarter.",
		sentAt: new Date("2026-02-01T09:00:00Z"),
		gmailMessageId: null,
		outlookMessageId: null,
		outlookWebLink: null,
	};
}

async function clean() {
	await db.emailThread.deleteMany({ where: { rootMessageId: { in: roots } } });
	await db.contact.deleteMany({
		where: { email: { in: [stranger, freeMail] } },
	});
	await db.company.deleteMany({ where: { domain } });
	await db.mailboxSync.deleteMany({ where: { userId } });
	await db.user.deleteMany({ where: { id: userId } });
}

beforeAll(async () => {
	await clean();
	await db.user.create({
		data: { id: userId, name: "Test Rep", email: mailbox },
	});
	row = await db.mailboxSync.create({
		data: { userId, source: "gmail", autoCreate: true },
	});
});

afterAll(clean);

describe("an inbound email nobody has replied to", () => {
	it("files a stranger at a work domain, marked for review", async () => {
		const result = await threads.storeWithReason(
			row,
			{ mailbox, origin: "gmail" },
			inbound(stranger, roots[0] ?? ""),
			await threads.context(),
		);

		expect(result.stored).toBe(true);
		const contact = await db.contact.findFirst({
			where: { email: stranger },
			select: {
				pendingReview: true,
				company: { select: { domain: true, pendingReview: true } },
			},
		});
		expect(contact?.pendingReview).toBe(true);
		expect(contact?.company?.domain).toBe(domain);
		expect(contact?.company?.pendingReview).toBe(true);
	});

	it("files a free-mail sender as a contact with no company, marked for review", async () => {
		const result = await threads.storeWithReason(
			row,
			{ mailbox, origin: "gmail" },
			inbound(freeMail, roots[1] ?? ""),
			await threads.context(),
		);

		expect(result).toMatchObject({ stored: true });
		const contact = await db.contact.findFirst({
			where: { email: freeMail },
			select: { pendingReview: true, companyId: true },
		});
		expect(contact?.pendingReview).toBe(true);
		expect(contact?.companyId).toBeNull();
	});

	it("files nothing when email auto-create is off", async () => {
		await clean();
		await db.user.create({
			data: { id: userId, name: "Test Rep", email: mailbox },
		});
		const off = await db.mailboxSync.create({
			data: { userId, source: "gmail", autoCreate: false },
		});

		const result = await threads.storeWithReason(
			off,
			{ mailbox, origin: "gmail" },
			inbound(stranger, roots[0] ?? ""),
			await threads.context(),
		);

		expect(result).toEqual({ stored: false, reason: "auto-create-off" });
	});
});

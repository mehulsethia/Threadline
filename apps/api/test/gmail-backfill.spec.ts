import { describe, expect, it } from "bun:test";
import type { Db, MailboxSyncModel } from "@crm/db";
import { CAPTURE } from "../src/capture/capture-config";
import type { GmailClient } from "../src/google/gmail.client";
import { GmailSyncService } from "../src/google/gmail-sync.service";
import type { MailboxTokenService } from "../src/mailbox/mailbox-token.service";
import type { SyncStateService } from "../src/mailbox/sync-state.service";
import type { ThreadWriterService } from "../src/mailbox/thread-writer.service";

type ListCall = { after: Date; before: Date };

function message(id: string) {
	return {
		id,
		internalDate: String(Date.now() - 60_000),
		payload: {
			headers: [
				{ name: "Message-ID", value: `<${id}@mail.test>` },
				{ name: "From", value: "Klaus Weber <klaus@weber.test>" },
				{ name: "To", value: "rep@acme.test" },
				{ name: "Subject", value: "Angebot" },
			],
		},
	};
}

function harness(options: { cursor: string | null; storedMail: boolean }) {
	const listCalls: ListCall[] = [];
	const historyCalls: string[] = [];
	const stored: string[] = [];
	const settled: (string | null | undefined)[] = [];
	const notes: { title: string; body?: string }[] = [];

	const gmail = {
		profile: async () => ({
			outcome: "ok" as const,
			data: { emailAddress: "rep@acme.test", historyId: "900" },
		}),
		listMessages: async (_token: string, query: ListCall) => {
			listCalls.push(query);
			return {
				outcome: "ok" as const,
				data: { messages: [{ id: "m1" }, { id: "m2" }] },
			};
		},
		listHistory: async (_token: string, query: { startHistoryId: string }) => {
			historyCalls.push(query.startHistoryId);
			return {
				outcome: "ok" as const,
				data: { history: [], historyId: "901" },
			};
		},
		getMessage: async (_token: string, id: string) => ({
			outcome: "ok" as const,
			data: message(id),
		}),
	};

	const db = {
		notification: {
			create: async ({ data }: { data: { title: string; body?: string } }) => {
				notes.push(data);
			},
		},
		emailMessage: {
			findMany: async () => [],
			findFirst: async () => (options.storedMail ? { id: "existing" } : null),
		},
	};

	const service = new GmailSyncService(
		db as unknown as Db,
		gmail as unknown as GmailClient,
		{
			accessTokenFor: async () => ({ outcome: "ok", accessToken: "token" }),
		} as unknown as MailboxTokenService,
		{
			markRunning: async () => {},
			settle: async (_id: string, update: { cursor?: string | null }) => {
				settled.push(update.cursor);
			},
		} as unknown as SyncStateService,
		{
			context: async () => ({}),
			storeWithReason: async (
				_row: MailboxSyncModel,
				_options: { mailbox: string; origin: string },
				parsed: { rfcMessageId: string },
			) => {
				stored.push(parsed.rfcMessageId);
				return {
					stored: true,
					reason: "stored",
					companyId: "company-1",
					contactId: "contact-1",
				};
			},
		} as unknown as ThreadWriterService,
	);

	const row = {
		id: "sync-1",
		userId: "user-1",
		source: "gmail",
		cursor: options.cursor,
	} as unknown as MailboxSyncModel;

	return { service, row, listCalls, historyCalls, stored, settled, notes };
}

describe("Gmail backfill", () => {
	it("reads the last 7 days on the first sync, then watches from the current history id", async () => {
		const h = harness({ cursor: null, storedMail: false });

		const outcome = await h.service.sync(h.row);

		const [call] = h.listCalls;
		if (!call) throw new Error("The first sync did not list recent mail.");
		expect(h.listCalls).toHaveLength(1);
		expect(call.before.getTime() - call.after.getTime()).toBe(
			CAPTURE.email.backfillMs,
		);
		expect(h.stored).toHaveLength(2);
		expect(h.settled).toEqual(["900"]);
		expect(outcome.messagesWritten).toBe(2);
	});

	it("never backfills on a scheduled tick once a cursor exists", async () => {
		const h = harness({ cursor: "800", storedMail: false });

		await h.service.sync(h.row);

		expect(h.listCalls).toHaveLength(0);
		expect(h.historyCalls).toEqual(["800"]);
	});

	it("backfills on Check now when this mailbox has no stored mail yet", async () => {
		const h = harness({ cursor: "800", storedMail: false });

		await h.service.sync(h.row, { backfillIfEmpty: true });

		expect(h.listCalls).toHaveLength(1);
		expect(h.historyCalls).toHaveLength(0);
	});

	it("skips the backfill on Check now once mail is stored", async () => {
		const h = harness({ cursor: "800", storedMail: true });

		await h.service.sync(h.row, { backfillIfEmpty: true });

		expect(h.listCalls).toHaveLength(0);
		expect(h.historyCalls).toEqual(["800"]);
	});

	it("posts a sync report with counts and reasons after a manual sync", async () => {
		const h = harness({ cursor: null, storedMail: false });

		await h.service.sync(h.row, { backfillIfEmpty: true, report: true });

		expect(h.notes).toHaveLength(1);
		expect(h.notes[0]?.title).toBe("Gmail sync: 2 added, 0 skipped");
		expect(h.notes[0]?.body).toContain("Read 2 messages from the last 7 days");
	});
});

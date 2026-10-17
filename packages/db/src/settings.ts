import { z } from "zod";
import type { Db } from "./client";
import {
	DEFAULT_REPORTING_CURRENCY,
	isCurrencyCode,
	normalizeCurrency,
} from "./currency";

export const SETTINGS_ID = "app";

export const DEFAULT_AGENT_MODEL = {
	id: process.env.GEMINI_FAST_MODEL || "gemini-2.5-flash",
	contextWindowTokens: 1_000_000,
} as const;

export interface AgentModelSetting {
	id: string;
	contextWindowTokens: number;
	isDefault: boolean;
}

export async function readAgentModel(db: Db): Promise<AgentModelSetting> {
	const row = await db.appSetting.findUnique({
		where: { id: SETTINGS_ID },
		select: { agentModelId: true, agentModelContextWindow: true },
	});

	if (!row?.agentModelId) {
		return { ...DEFAULT_AGENT_MODEL, isDefault: true };
	}

	return {
		id: row.agentModelId,
		contextWindowTokens:
			row.agentModelContextWindow ?? DEFAULT_AGENT_MODEL.contextWindowTokens,
		isDefault: false,
	};
}

export async function writeAgentModel(
	db: Db,
	model: { id: string; contextWindowTokens: number } | null,
): Promise<void> {
	const fields = {
		agentModelId: model?.id ?? null,
		agentModelContextWindow: model?.contextWindowTokens ?? null,
	};

	await db.appSetting.upsert({
		where: { id: SETTINGS_ID },
		create: { id: SETTINGS_ID, ...fields },
		update: fields,
	});
}

export const CONTEXT_DEV_SIGNUP_URL = "https://link.context.dev/crm";

export const CONTEXT_DEV_DISCOUNT_CODE = "CRM";

export async function readContextDevKey(db: Db): Promise<string | null> {
	const row = await db.appSetting.findUnique({
		where: { id: SETTINGS_ID },
		select: { contextDevApiKey: true },
	});

	const key = row?.contextDevApiKey?.trim();
	if (!key || key === "skipped") return null;
	return key;
}

export async function writeContextDevKey(db: Db, key: string): Promise<void> {
	const contextDevApiKey = key.trim();

	await db.appSetting.upsert({
		where: { id: SETTINGS_ID },
		create: { id: SETTINGS_ID, contextDevApiKey },
		update: { contextDevApiKey },
	});
}

export async function readReportingCurrency(db: Db): Promise<string> {
	const row = await db.appSetting.findUnique({
		where: { id: SETTINGS_ID },
		select: { reportingCurrency: true },
	});

	const stored = normalizeCurrency(row?.reportingCurrency);

	return isCurrencyCode(stored) ? stored : DEFAULT_REPORTING_CURRENCY;
}

export async function writeReportingCurrency(
	db: Db,
	code: string,
): Promise<string> {
	const reportingCurrency = normalizeCurrency(code);

	await db.appSetting.upsert({
		where: { id: SETTINGS_ID },
		create: { id: SETTINGS_ID, reportingCurrency },
		update: { reportingCurrency },
	});

	return reportingCurrency;
}

export async function readRatesRefreshedAt(db: Db): Promise<Date | null> {
	const row = await db.appSetting.findUnique({
		where: { id: SETTINGS_ID },
		select: { ratesRefreshedAt: true },
	});

	return row?.ratesRefreshedAt ?? null;
}

export async function writeRatesRefreshedAt(
	db: Db,
	ratesRefreshedAt: Date,
): Promise<void> {
	await db.appSetting.upsert({
		where: { id: SETTINGS_ID },
		create: { id: SETTINGS_ID, ratesRefreshedAt },
		update: { ratesRefreshedAt },
	});
}

export const DEFAULT_ARCHIVE_RETENTION_DAYS = 180;

export const MIN_ARCHIVE_RETENTION_DAYS = 1;

export const MAX_ARCHIVE_RETENTION_DAYS = 3650;

export async function readArchiveRetentionDays(db: Db): Promise<number> {
	const row = await db.appSetting.findUnique({
		where: { id: SETTINGS_ID },
		select: { archiveRetentionDays: true },
	});

	return row?.archiveRetentionDays ?? DEFAULT_ARCHIVE_RETENTION_DAYS;
}

export async function writeArchiveRetentionDays(
	db: Db,
	days: number,
): Promise<number> {
	const archiveRetentionDays = Math.min(
		Math.max(Math.round(days), MIN_ARCHIVE_RETENTION_DAYS),
		MAX_ARCHIVE_RETENTION_DAYS,
	);

	await db.appSetting.upsert({
		where: { id: SETTINGS_ID },
		create: { id: SETTINGS_ID, archiveRetentionDays },
		update: { archiveRetentionDays },
	});

	return archiveRetentionDays;
}

export function maskKey(key: string): string {
	const trimmed = key.trim();
	return trimmed.length > 4 ? `••••${trimmed.slice(-4)}` : "••••";
}

export const DEFAULT_STAGE_SLAS = {
	UNQUALIFIED_TO_BUY: 3,
	QUALIFIED_TO_BUY: 5,
	DEMO_BOOKED: 4,
	CONTRACT_SENT: 5,
	DECISION_MAKER_BOUGHT_IN: 3,
} as const;

export type StageSlas = Record<string, number>;

// Days per stage as saved from the revival settings dialog.
const storedSlas = z.record(z.string(), z.number());

export async function readRevivalSlas(db: Db): Promise<StageSlas> {
	const row = await db.appSetting.findUnique({
		where: { id: SETTINGS_ID },
		select: { revivalSlas: true },
	});

	const stored = storedSlas.safeParse(row?.revivalSlas);
	if (stored.success) {
		return { ...DEFAULT_STAGE_SLAS, ...stored.data };
	}

	return { ...DEFAULT_STAGE_SLAS };
}

export async function writeRevivalSlas(
	db: Db,
	slas: StageSlas,
): Promise<StageSlas> {
	await db.appSetting.upsert({
		where: { id: SETTINGS_ID },
		create: { id: SETTINGS_ID, revivalSlas: slas },
		update: { revivalSlas: slas },
	});

	return readRevivalSlas(db);
}

export async function readPlaybook(db: Db): Promise<string> {
	const row = await db.appSetting.findUnique({
		where: { id: SETTINGS_ID },
		select: { playbook: true },
	});

	return row?.playbook ?? "";
}

export async function writePlaybook(db: Db, playbook: string): Promise<string> {
	await db.appSetting.upsert({
		where: { id: SETTINGS_ID },
		create: { id: SETTINGS_ID, playbook },
		update: { playbook },
	});

	return playbook;
}

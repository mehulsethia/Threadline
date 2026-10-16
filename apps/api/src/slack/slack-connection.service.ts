import {
	canManageConnections,
	isSlackConfigured,
	WORKSPACE_ID,
} from "@crm/auth";
import type { Db, Prisma } from "@crm/db";
import { schemas } from "@crm/validation";
import {
	BadRequestException,
	ForbiddenException,
	Injectable,
	NotFoundException,
} from "@nestjs/common";
import { AgentAccessService } from "../agent/agent-access.service";
import { AgentTriggerService } from "../agent/agent-trigger.service";
import { InjectDatabase } from "../database/database.constants";
import type {
	SlackChannelsInput,
	SlackChannelsResult,
	SlackCreateChannelInput,
	SlackCreateChannelResult,
	SlackDisconnectResult,
	SlackJoinChannelInput,
	SlackJoinChannelResult,
	SlackMatches,
	SlackRefreshPeopleResult,
	SlackSetAlertsChannelInput,
	SlackSetAlertsChannelResult,
	SlackStatus,
} from "./slack.contracts";
import { SlackChannelsService } from "./slack-channels.service";
import { SLACK, type SlackSyncState } from "./slack-config";
import { decryptToken } from "./slack-crypto";

const SLACK_WORKSPACE_RESOURCE_ID =
	schemas.agents.CAPABILITY_RESOURCE_IDS.slack;

@Injectable()
export class SlackConnectionService {
	constructor(
		@InjectDatabase() private readonly db: Db,
		private readonly agent: AgentTriggerService,
		private readonly slackChannels: SlackChannelsService,
		private readonly access: AgentAccessService,
	) {}

	async status(userId: string): Promise<SlackStatus> {
		const role = await this.access.assertMember(userId);
		const [account, install, agents, matches, memberCount, grant] =
			await Promise.all([
				this.db.account.findFirst({
					where: { providerId: "slack", accessToken: { not: null } },
					orderBy: { updatedAt: "desc" },
					select: { accountId: true, updatedAt: true, scope: true },
				}),
				this.db.slackInstallation.findFirst({
					where: {
						OR: [{ organizationId: WORKSPACE_ID }, { organizationId: null }],
					},
					orderBy: { createdAt: "desc" },
				}),
				this.db.agentDefinition.findMany({
					where: {
						status: { in: ["LIVE", "PAUSED"] },
						deletedAt: null,
						currentVersionId: { not: null },
						currentVersion: {
							manifest: {
								path: ["dataScope", "resources"],
								array_contains: [{ id: SLACK_WORKSPACE_RESOURCE_ID }],
							},
						},
					},
					orderBy: { updatedAt: "desc" },
					take: 30,
					select: { id: true, name: true, description: true, status: true },
				}),
				this.db.slackMemberMatch.findMany({
					where: {
						crmUser: { members: { some: { organizationId: WORKSPACE_ID } } },
					},
					select: { slackUserId: true, updatedAt: true },
				}),
				this.db.member.count({ where: { organizationId: WORKSPACE_ID } }),
				this.db.slackWorkspaceGrant.findFirst({
					select: { id: true, teamName: true },
				}),
			]);

		const matched = matches.filter((match) => match.slackUserId).length;
		const reviewed = matches.length;
		const inventoryFresh =
			account &&
			reviewed === memberCount &&
			matches.every((match) => match.updatedAt >= account.updatedAt);
		if (account && !inventoryFresh) {
			await this.agent.slackPeopleRequested(
				"Match workspace members to Slack accounts by exact email",
			);
		}

		const connected = Boolean(
			account || install || process.env.SLACK_BOT_TOKEN,
		);
		const workspace =
			install?.teamName ??
			grant?.teamName ??
			(process.env.SLACK_BOT_TOKEN ? "Dev Slack Workspace" : null);

		return {
			configured: isSlackConfigured() || Boolean(process.env.SLACK_BOT_TOKEN),
			connected,
			workspace,
			lastConnectedAt:
				account?.updatedAt.toISOString() ??
				install?.installedAt.toISOString() ??
				null,
			scopes: (account?.scope ?? install?.userScopes ?? "")
				.split(",")
				.map((scope) => scope.trim())
				.filter(Boolean),
			canInviteItself: Boolean(grant || install?.userToken),
			canManage: canManageConnections(role),
			alertsChannelId: install?.alertsChannelId ?? null,
			alertsChannelName: install?.alertsChannelName ?? null,
			agents,
			people: { matched, reviewed },
		};
	}

	async matches(userId: string): Promise<SlackMatches> {
		await this.access.assertMember(userId);
		const [members, syncing] = await Promise.all([
			this.db.member.findMany({
				where: { organizationId: WORKSPACE_ID },
				orderBy: { user: { name: "asc" } },
				select: {
					user: {
						select: {
							id: true,
							name: true,
							email: true,
							slackMemberMatch: {
								select: {
									slackUserId: true,
									slackHandle: true,
									slackEmail: true,
								},
							},
						},
					},
				},
			}),
			this.peopleSyncState(),
		]);

		return {
			rows: members.map(({ user }) => ({
				crmUserId: user.id,
				name: user.name,
				email: user.email,
				match: user.slackMemberMatch,
			})),
			sync: syncing,
		};
	}

	private async peopleSyncState(): Promise<SlackSyncState> {
		const pending = await this.db.agentTask.findFirst({
			where: { kind: "slack-people-match", finishedAt: null },
			orderBy: { createdAt: "desc" },
			select: { createdAt: true, startedAt: true, leasedUntil: true },
		});
		if (!pending) return "idle";

		const now = Date.now();
		const leaseHeld = pending.leasedUntil
			? pending.leasedUntil.getTime() > now
			: false;
		if (leaseHeld || pending.startedAt) return "syncing";

		return now - pending.createdAt.getTime() < SLACK.sync.stalledAfterMs
			? "syncing"
			: "stalled";
	}

	async refreshPeople(userId: string): Promise<SlackRefreshPeopleResult> {
		await this.access.assertMember(userId);
		await this.syncChannelsFromSlack();
		return { requested: true };
	}

	async channels(
		input: SlackChannelsInput,
		userId: string,
	): Promise<SlackChannelsResult> {
		await this.access.assertMember(userId);

		const take = input.limit ?? SLACK.channels.pageSize;
		const needle = input.query?.trim() ?? "";

		const count = await this.db.slackChannel.count({
			where: { available: true },
		});
		if (count === 0) {
			await this.syncChannelsFromSlack();
		}

		const where: Prisma.SlackChannelWhereInput = { available: true };
		if (needle) where.name = { contains: needle, mode: "insensitive" };

		const [rows, grant, sync] = await Promise.all([
			this.db.slackChannel.findMany({
				where,
				orderBy: [{ isMember: "desc" }, { name: "asc" }, { id: "asc" }],
				take: take + 1,
				cursor: input.cursor ? { id: input.cursor } : undefined,
				skip: input.cursor ? 1 : undefined,
				select: {
					id: true,
					name: true,
					memberCount: true,
					isPrivate: true,
					isMember: true,
					classifiedAt: true,
					inviteRequestedAt: true,
				},
			}),
			this.db.slackWorkspaceGrant.findFirst({ select: { id: true } }),
			this.peopleSyncState(),
		]);

		const page = rows.slice(0, take);

		return {
			canInviteItself: Boolean(grant),
			sync,
			nextCursor: rows.length > take ? (page.at(-1)?.id ?? null) : null,
			rows: page.map(({ classifiedAt, ...row }) => ({
				...row,
				classified: classifiedAt !== null,
				inviteRequestedAt: row.inviteRequestedAt?.toISOString() ?? null,
			})),
		};
	}

	async joinChannel(
		input: SlackJoinChannelInput,
		userId: string,
	): Promise<SlackJoinChannelResult> {
		await this.access.assertMember(userId);
		const channel = await this.db.slackChannel.findUnique({
			where: { id: input.channelId },
			select: { id: true, name: true, isMember: true, isPrivate: true },
		});
		if (!channel) throw new NotFoundException("No such Slack channel.");
		if (channel.isMember) return { queued: false, alreadyJoined: true };

		let botToken = process.env.SLACK_BOT_TOKEN;
		const install = await this.db.slackInstallation.findFirst({
			where: {
				OR: [{ organizationId: WORKSPACE_ID }, { organizationId: null }],
			},
			orderBy: { createdAt: "desc" },
		});
		if (install?.botToken) {
			try {
				botToken = decryptToken(install.botToken);
			} catch {
				botToken = install.botToken;
			}
		}

		if (botToken && !channel.isPrivate) {
			const res = await fetch("https://slack.com/api/conversations.join", {
				method: "POST",
				headers: {
					authorization: `Bearer ${botToken}`,
					"content-type": "application/json; charset=utf-8",
				},
				body: JSON.stringify({ channel: channel.id }),
			});
			const data = (await res.json()) as { ok: boolean };
			if (data.ok) {
				await this.db.slackChannel.update({
					where: { id: channel.id },
					data: { isMember: true },
				});
				return { queued: false, alreadyJoined: true };
			}
		}

		await this.agent.slackChannelJoinRequested(channel.id, channel.name);
		return { queued: true, alreadyJoined: false };
	}

	async setAlertsChannel(
		input: SlackSetAlertsChannelInput,
		userId: string,
	): Promise<SlackSetAlertsChannelResult> {
		await this.access.assertMember(userId);

		const install = await this.db.slackInstallation.findFirst({
			where: {
				OR: [{ organizationId: WORKSPACE_ID }, { organizationId: null }],
			},
			orderBy: { createdAt: "desc" },
		});

		let botToken = process.env.SLACK_BOT_TOKEN;
		if (install?.botToken) {
			try {
				botToken = decryptToken(install.botToken);
			} catch {
				botToken = install.botToken;
			}
		}

		let isMember = false;
		if (botToken) {
			try {
				const infoRes = await fetch(
					`https://slack.com/api/conversations.info?channel=${input.channelId}`,
					{ headers: { authorization: `Bearer ${botToken}` } },
				);
				const infoData = (await infoRes.json()) as {
					ok: boolean;
					channel?: { is_private?: boolean; is_member?: boolean };
				};

				if (infoData.ok && infoData.channel) {
					isMember = Boolean(infoData.channel.is_member);
					if (!isMember && !infoData.channel.is_private) {
						const joinRes = await fetch(
							"https://slack.com/api/conversations.join",
							{
								method: "POST",
								headers: {
									authorization: `Bearer ${botToken}`,
									"content-type": "application/json; charset=utf-8",
								},
								body: JSON.stringify({ channel: input.channelId }),
							},
						);
						const joinData = (await joinRes.json()) as { ok: boolean };
						if (joinData.ok) isMember = true;
					}
				}
			} catch {}
		}

		const installerId = install?.installerId || `dev_${WORKSPACE_ID}`;
		await this.db.slackInstallation.upsert({
			where: { installerId },
			create: {
				installerId,
				organizationId: WORKSPACE_ID,
				teamId: install?.teamId || "T_LOCAL",
				teamName: install?.teamName || "Workspace",
				alertsChannelId: input.channelId,
				alertsChannelName: input.channelName,
			},
			update: {
				alertsChannelId: input.channelId,
				alertsChannelName: input.channelName,
			},
		});

		await this.db.slackChannel.upsert({
			where: { id: input.channelId },
			create: {
				id: input.channelId,
				name: input.channelName,
				isMember,
				isPrivate: false,
				available: true,
			},
			update: {
				name: input.channelName,
				isMember,
			},
		});

		return {
			success: true,
			channelId: input.channelId,
			channelName: input.channelName,
			isMember,
		};
	}

	async createChannel(
		input: SlackCreateChannelInput,
		userId: string,
	): Promise<SlackCreateChannelResult> {
		await this.access.assertMember(userId);
		const existing = await this.db.slackChannel.findFirst({
			where: { name: input.name },
			select: { id: true },
		});
		if (existing) {
			throw new BadRequestException("A channel with that name already exists.");
		}

		return this.slackChannels.create(input.name, input.isPrivate);
	}

	async disconnect(userId: string): Promise<SlackDisconnectResult> {
		const role = await this.access.assertMember(userId);

		if (!canManageConnections(role)) {
			throw new ForbiddenException(
				"Only an owner or an admin can disconnect Slack.",
			);
		}

		const removed = await this.db.$transaction(async (tx) => {
			const accounts = await tx.account.deleteMany({
				where: { providerId: "slack" },
			});
			const installs = await tx.slackInstallation.deleteMany({
				where: {
					OR: [{ organizationId: WORKSPACE_ID }, { organizationId: null }],
				},
			});
			await tx.slackChannel.deleteMany({});
			await tx.slackWorkspaceGrant.deleteMany({});
			return accounts.count + installs.count;
		});

		if (removed === 0) throw new NotFoundException("Slack is not connected.");

		return { disconnected: true };
	}

	private async syncChannelsFromSlack() {
		let botToken = process.env.SLACK_BOT_TOKEN;
		const install = await this.db.slackInstallation.findFirst({
			where: {
				OR: [{ organizationId: WORKSPACE_ID }, { organizationId: null }],
			},
			orderBy: { createdAt: "desc" },
		});
		if (install?.botToken) {
			try {
				botToken = decryptToken(install.botToken);
			} catch {
				botToken = install.botToken;
			}
		}

		if (!botToken) return;

		try {
			const res = await fetch(
				"https://slack.com/api/conversations.list?types=public_channel,private_channel&limit=200",
				{
					headers: { authorization: `Bearer ${botToken}` },
				},
			);
			const data = (await res.json()) as {
				ok: boolean;
				channels?: Array<{
					id: string;
					name: string;
					is_private?: boolean;
					is_member?: boolean;
					num_members?: number;
				}>;
			};

			if (data.ok && data.channels) {
				for (const c of data.channels) {
					await this.db.slackChannel.upsert({
						where: { id: c.id },
						create: {
							id: c.id,
							name: c.name,
							isPrivate: Boolean(c.is_private),
							isMember: Boolean(c.is_member),
							memberCount: c.num_members ?? null,
							available: true,
							classifiedAt: new Date(),
						},
						update: {
							name: c.name,
							isPrivate: Boolean(c.is_private),
							isMember: Boolean(c.is_member),
							memberCount: c.num_members ?? null,
							classifiedAt: new Date(),
						},
					});
				}
			}
		} catch {}
	}
}

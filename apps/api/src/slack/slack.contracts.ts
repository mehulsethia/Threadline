import { z } from "zod";
import { SLACK, SLACK_SYNC_STATES } from "./slack-config";

export const slackChannelsInput = z.object({
	cursor: z.string().trim().min(1).max(64).nullish(),
	limit: z.number().int().min(1).max(SLACK.channels.maxPageSize).optional(),
	query: z.string().trim().max(120).optional(),
});

export type SlackChannelsInput = z.infer<typeof slackChannelsInput>;

export const slackJoinChannelInput = z.object({
	channelId: z.string().trim().min(1).max(64),
});

export type SlackJoinChannelInput = z.infer<typeof slackJoinChannelInput>;

export const slackCreateChannelInput = z.object({
	name: z
		.string()
		.trim()
		.min(1)
		.max(80)
		.regex(/^[a-z0-9-_]+$/, "Use lowercase letters, numbers and dashes."),
	isPrivate: z.boolean().default(false),
});

export type SlackCreateChannelInput = z.infer<typeof slackCreateChannelInput>;

export const slackCreateChannelReply = z.union([
	z.object({
		channel: z.object({
			id: z.string().trim().min(1).max(64),
			name: z.string().trim().min(1).max(120),
		}),
	}),
	z.object({ error: z.string().trim().min(1).max(500) }),
]);

export type SlackCreateChannelReply = z.infer<typeof slackCreateChannelReply>;

const slackSyncStateOutput = z.enum(SLACK_SYNC_STATES);

const slackAgentSummaryOutput = z.object({
	id: z.string(),
	name: z.string(),
	description: z.string().nullable(),
	status: z.enum([
		"DRAFT",
		"DEPLOYING",
		"LIVE",
		"PAUSED",
		"ARCHIVED",
		"DELETED",
	]),
});

export const slackStatusOutput = z.object({
	configured: z.boolean(),
	connected: z.boolean(),
	workspace: z.string().nullable(),
	lastConnectedAt: z.string().nullable(),
	scopes: z.array(z.string()),
	canInviteItself: z.boolean(),
	canManage: z.boolean(),
	alertsChannelId: z.string().nullable(),
	alertsChannelName: z.string().nullable(),
	agents: z.array(slackAgentSummaryOutput),
	people: z.object({
		matched: z.number(),
		reviewed: z.number(),
	}),
});

export type SlackStatus = z.infer<typeof slackStatusOutput>;

const slackMemberMatchOutput = z.object({
	slackUserId: z.string().nullable(),
	slackHandle: z.string().nullable(),
	slackEmail: z.string().nullable(),
});

export const slackMatchesOutput = z.object({
	rows: z.array(
		z.object({
			crmUserId: z.string(),
			name: z.string(),
			email: z.string(),
			match: slackMemberMatchOutput.nullable(),
		}),
	),
	sync: slackSyncStateOutput,
});

export type SlackMatches = z.infer<typeof slackMatchesOutput>;

export const slackChannelsOutput = z.object({
	canInviteItself: z.boolean(),
	sync: slackSyncStateOutput,
	nextCursor: z.string().nullable(),
	rows: z.array(
		z.object({
			id: z.string(),
			name: z.string(),
			memberCount: z.number().nullable(),
			isPrivate: z.boolean(),
			isMember: z.boolean(),
			classified: z.boolean(),
			inviteRequestedAt: z.string().nullable(),
		}),
	),
});

export type SlackChannelsResult = z.infer<typeof slackChannelsOutput>;

export const slackJoinChannelOutput = z.object({
	queued: z.boolean(),
	alreadyJoined: z.boolean(),
});

export type SlackJoinChannelResult = z.infer<typeof slackJoinChannelOutput>;

export const slackRefreshPeopleOutput = z.object({
	requested: z.boolean(),
});

export type SlackRefreshPeopleResult = z.infer<typeof slackRefreshPeopleOutput>;

export const slackCreateChannelOutput = z.object({
	channel: z.object({
		id: z.string(),
		name: z.string(),
	}),
});

export type SlackCreateChannelResult = z.infer<typeof slackCreateChannelOutput>;

export const slackDisconnectOutput = z.object({
	disconnected: z.boolean(),
});

export type SlackDisconnectResult = z.infer<typeof slackDisconnectOutput>;

export const slackSetAlertsChannelInput = z.object({
	channelId: z.string().trim().min(1).max(64),
	channelName: z.string().trim().min(1).max(120),
});

export type SlackSetAlertsChannelInput = z.infer<
	typeof slackSetAlertsChannelInput
>;

export const slackSetAlertsChannelOutput = z.object({
	success: z.boolean(),
	channelId: z.string(),
	channelName: z.string(),
	isMember: z.boolean(),
});

export type SlackSetAlertsChannelResult = z.infer<
	typeof slackSetAlertsChannelOutput
>;

/** A Block Kit block on a posted message; unknown fields ride along. */
export const slackBlock = z.looseObject({
	type: z.string().optional(),
	block_id: z.string().optional(),
});

export type SlackBlock = z.infer<typeof slackBlock>;

/** The interactivity payload Slack sends when someone presses a card button. */
export const slackBlockActionPayload = z.object({
	type: z.literal("block_actions"),
	user: z.object({
		id: z.string(),
		username: z.string().optional(),
		name: z.string().optional(),
	}),
	team: z.object({ id: z.string(), domain: z.string().optional() }),
	channel: z.object({ id: z.string() }),
	message: z
		.object({ ts: z.string(), blocks: z.array(slackBlock).optional() })
		.optional(),
	actions: z.array(z.object({ action_id: z.string(), value: z.string() })),
	response_url: z.string().optional(),
	trigger_id: z.string().optional(),
});

export type SlackBlockActionPayload = z.infer<typeof slackBlockActionPayload>;

/** The fields of an Events API body this app reads. */
export const slackEventBody = z.object({
	type: z.string().optional(),
	challenge: z.string().optional(),
});

/** A Socket Mode envelope; its payload is parsed by the receiver. */
export const slackSocketEnvelope = z.object({
	envelope_id: z.string().optional(),
	type: z.string().optional(),
	payload: z.unknown().optional(),
});

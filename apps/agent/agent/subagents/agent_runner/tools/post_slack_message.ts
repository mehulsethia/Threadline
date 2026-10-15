import { defineTool } from "eve/tools";
import { z } from "zod";
import { postRunSlackMessage } from "../../../lib/run-runtime";
import { requireTeamAgentAttribute } from "../../../lib/session-purpose";

const ENABLE_SLACK_TOOL = false;

export default defineTool({
	description:
		"Post one message to the exact Slack channel or person approved in the deployed version. The destination comes from the manifest and the action is idempotent across retries.",
	inputSchema: z.object({
		text: z.string().trim().min(1).max(4_000),
	}),
	async execute(input, ctx) {
		if (!ENABLE_SLACK_TOOL) {
			return { posted: false as const, reason: "Slack tool is disabled" };
		}
		return postRunSlackMessage(
			requireTeamAgentAttribute(ctx, "runId"),
			ctx.callId,
			input,
			ctx.abortSignal,
		);
	},
});


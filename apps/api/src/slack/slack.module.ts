import { Module } from "@nestjs/common";
import { AgentModule } from "../agent/agent.module";
import { TrpcModule } from "../trpc/trpc.module";
import { SlackController } from "./slack.controller";
import { SlackRouter } from "./slack.router";
import { SlackChannelsService } from "./slack-channels.service";
import { SlackConnectionService } from "./slack-connection.service";
import { SlackRevivalService } from "./slack-revival.service";
import { SlackSocketService } from "./slack-socket.service";

@Module({
	imports: [TrpcModule, AgentModule],
	controllers: [SlackController],
	providers: [
		SlackChannelsService,
		SlackConnectionService,
		SlackRevivalService,
		SlackSocketService,
		SlackRouter,
	],
	exports: [SlackConnectionService, SlackRevivalService],
})
export class SlackModule {}

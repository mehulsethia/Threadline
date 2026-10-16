import { Module } from "@nestjs/common";
import { AgentModule } from "../agent/agent.module";
import { SlackModule } from "../slack/slack.module";
import { RevivalRouter } from "./revival.router";
import { RevivalService } from "./revival.service";
import { RevivalCronController } from "./revival-cron.controller";

@Module({
	imports: [AgentModule, SlackModule],
	controllers: [RevivalCronController],
	providers: [RevivalService, RevivalRouter],
	exports: [RevivalService],
})
export class RevivalModule {}

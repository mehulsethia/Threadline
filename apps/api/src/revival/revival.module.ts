import { Module } from "@nestjs/common";
import { AgentModule } from "../agent/agent.module";
import { DealsModule } from "../deals/deals.module";
import { SlackModule } from "../slack/slack.module";
import { RevivalRouter } from "./revival.router";
import { RevivalService } from "./revival.service";
import { RevivalCronController } from "./revival-cron.controller";

@Module({
	imports: [AgentModule, DealsModule, SlackModule],
	controllers: [RevivalCronController],
	providers: [RevivalService, RevivalRouter],
	exports: [RevivalService],
})
export class RevivalModule {}

import { Module } from "@nestjs/common";
import { AgentModule } from "../agent/agent.module";
import { RevivalRouter } from "./revival.router";
import { RevivalService } from "./revival.service";

@Module({
	imports: [AgentModule],
	providers: [RevivalService, RevivalRouter],
	exports: [RevivalService],
})
export class RevivalModule {}

import { Module } from "@nestjs/common";
import { AgentModule } from "../agent/agent.module";
import { AssistRouter } from "./assist.router";
import { AssistService } from "./assist.service";
import { AssistStreamController } from "./assist-stream.controller";

@Module({
	imports: [AgentModule],
	controllers: [AssistStreamController],
	providers: [AssistService, AssistRouter],
})
export class AssistModule {}

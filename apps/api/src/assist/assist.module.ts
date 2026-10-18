import { Module } from "@nestjs/common";
import { AgentModule } from "../agent/agent.module";
import { AssistRouter } from "./assist.router";
import { AssistService } from "./assist.service";

@Module({ imports: [AgentModule], providers: [AssistService, AssistRouter] })
export class AssistModule {}

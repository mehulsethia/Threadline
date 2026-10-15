import { Module } from "@nestjs/common";
import { AgentModule } from "../agent/agent.module";
import { TrpcModule } from "../trpc/trpc.module";
import { IntakeController } from "./intake.controller";
import { IntakeRouter } from "./intake.router";
import { IntakeService } from "./intake.service";

@Module({
	imports: [AgentModule, TrpcModule],
	controllers: [IntakeController],
	providers: [IntakeService, IntakeRouter],
	exports: [IntakeService],
})
export class IntakeModule {}

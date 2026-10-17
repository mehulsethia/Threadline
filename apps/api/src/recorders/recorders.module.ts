import { Module } from "@nestjs/common";
import { AgentModule } from "../agent/agent.module";
import { RecordersRouter } from "./recorders.router";
import { RecordersService } from "./recorders.service";

@Module({
	imports: [AgentModule],
	providers: [RecordersService, RecordersRouter],
})
export class RecordersModule {}

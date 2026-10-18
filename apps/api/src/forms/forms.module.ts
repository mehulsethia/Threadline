import { Module } from "@nestjs/common";
import { AgentModule } from "../agent/agent.module";
import { FormsController } from "./forms.controller";
import { FormsRouter } from "./forms.router";
import { FormsService } from "./forms.service";

@Module({
	imports: [AgentModule],
	controllers: [FormsController],
	providers: [FormsService, FormsRouter],
})
export class FormsModule {}

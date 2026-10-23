import { Module } from "@nestjs/common";
import { TrpcModule } from "../trpc/trpc.module";
import { InboxRouter } from "./inbox.router";
import { InboxService } from "./inbox.service";

@Module({
	imports: [TrpcModule],
	providers: [InboxService, InboxRouter],
})
export class InboxModule {}

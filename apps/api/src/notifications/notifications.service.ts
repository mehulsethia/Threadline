import type { Db } from "@crm/db";
import { Injectable } from "@nestjs/common";
import { z } from "zod";
import { InjectDatabase } from "../database/database.constants";
import type { NotificationListOutput } from "./notifications.contracts";

const storedEntity = z
	.enum(["contact", "deal", "company"])
	.nullable()
	.catch(null);

@Injectable()
export class NotificationsService {
	constructor(@InjectDatabase() private readonly db: Db) {}

	async list(limit: number): Promise<NotificationListOutput> {
		const [rows, unread] = await Promise.all([
			this.db.notification.findMany({
				orderBy: { createdAt: "desc" },
				take: limit,
			}),
			this.db.notification.count({ where: { readAt: null } }),
		]);
		return {
			unread,
			items: rows.map((row) => ({
				id: row.id,
				kind: row.kind,
				title: row.title,
				body: row.body,
				entity: storedEntity.parse(row.entity),
				entityId: row.entityId,
				source: row.source,
				createdAt: row.createdAt.toISOString(),
				read: row.readAt !== null,
			})),
		};
	}

	async markRead(ids?: string[]): Promise<{ updated: number }> {
		const { count } = await this.db.notification.updateMany({
			where: { readAt: null, id: ids ? { in: ids } : undefined },
			data: { readAt: new Date() },
		});
		return { updated: count };
	}
}

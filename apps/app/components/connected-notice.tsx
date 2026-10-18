"use client";

import { useMountEffect } from "@crm/ui/hooks/use-mount-effect";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
	CONNECTED_PARAM,
	CONNECTION_SYNC_COPY,
	type ConnectedNoticeKey,
} from "@/lib/connection-sync-copy";

const NOTICES: Record<
	ConnectedNoticeKey,
	{ title: string; description: string }
> = {
	google: CONNECTION_SYNC_COPY.google.connected,
	meet: CONNECTION_SYNC_COPY.meet.connected,
	slack: CONNECTION_SYNC_COPY.slack.connected,
};

function noticeFor(params: URLSearchParams): ConnectedNoticeKey | null {
	if (params.get("installed") === "true") return "slack";
	const value = params.get(CONNECTED_PARAM);
	return value && value in NOTICES ? (value as ConnectedNoticeKey) : null;
}

export function ConnectedNotice() {
	const params = useSearchParams();
	const router = useRouter();
	const pathname = usePathname();

	useMountEffect(() => {
		const key = noticeFor(params);
		if (!key) return;
		const notice = NOTICES[key];
		toast.success(notice.title, {
			description: notice.description,
			duration: 10_000,
		});
		const next = new URLSearchParams(params);
		next.delete(CONNECTED_PARAM);
		next.delete("installed");
		const query = next.toString();
		router.replace(query ? `${pathname}?${query}` : pathname, {
			scroll: false,
		});
	});

	return null;
}

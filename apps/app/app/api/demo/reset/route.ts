import { timingSafeEqual } from "node:crypto";
import { seedDemoOrg } from "@crm/db/demo-seed";
import { type NextRequest, NextResponse } from "next/server";

function authorized(header: string | null, secret: string): boolean {
	const expected = Buffer.from(`Bearer ${secret}`);
	const given = Buffer.from(header ?? "");
	return given.length === expected.length && timingSafeEqual(given, expected);
}

// Called by Cloud Scheduler nightly. Fails closed: with no secret configured
// nobody can reset the demo.
export async function POST(req: NextRequest) {
	const secret = process.env.DEMO_RESET_SECRET;
	if (!secret) {
		return NextResponse.json(
			{ error: "Demo reset is not configured." },
			{ status: 503 },
		);
	}
	if (!authorized(req.headers.get("authorization"), secret)) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	try {
		await seedDemoOrg();
		return NextResponse.json({ success: true });
	} catch (err: unknown) {
		console.error("Demo reset failed:", err);
		return NextResponse.json({ error: "Reset failed." }, { status: 500 });
	}
}

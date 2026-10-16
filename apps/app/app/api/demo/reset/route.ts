import { type NextRequest, NextResponse } from "next/server";
import { seedDemoOrg } from "../../../../../../packages/db/prisma/seed-demo";

export async function POST(req: NextRequest) {
	const authHeader = req.headers.get("authorization");
	const expectedSecret = process.env.DEMO_RESET_SECRET;

	if (expectedSecret && authHeader !== `Bearer ${expectedSecret}`) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	try {
		await seedDemoOrg();
		return NextResponse.json({
			success: true,
			message: "Northwind Systems demo organization reset successfully.",
		});
	} catch (err: unknown) {
		const message = err instanceof Error ? err.message : String(err);
		return NextResponse.json(
			{ error: `Reset failed: ${message}` },
			{ status: 500 },
		);
	}
}

export async function GET(req: NextRequest) {
	return POST(req);
}

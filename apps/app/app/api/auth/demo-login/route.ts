import { createHmac, randomUUID } from "node:crypto";
import { SESSION_COOKIE_NAME } from "@crm/auth";
import { rootDb as db } from "@crm/db";
import { DEMO_ORG_ID, DEMO_ORG_SLUG, DEMO_USER_ID } from "@crm/db/demo-reset";
import { seedDemoOrg } from "@crm/db/demo-seed";
import { cookies } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";

const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 10;
const ipHits = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(ip: string): boolean {
	const now = Date.now();
	const entry = ipHits.get(ip);

	if (!entry || now > entry.resetAt) {
		ipHits.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
		return true;
	}

	if (entry.count >= MAX_REQUESTS_PER_WINDOW) {
		return false;
	}

	entry.count++;
	return true;
}

const isProduction = process.env.NODE_ENV === "production";

// Better Auth reads `__Secure-<prefix>.session_token` when secure cookies are
// on (production) and only accepts a value signed with BETTER_AUTH_SECRET.
const COOKIE_NAME = isProduction
	? `__Secure-${SESSION_COOKIE_NAME}`
	: SESSION_COOKIE_NAME;

function signedSessionToken(token: string, secret: string): string {
	const signature = createHmac("sha256", secret).update(token).digest("base64");
	return `${token}.${signature}`;
}

export async function POST(req: NextRequest) {
	const secret = process.env.BETTER_AUTH_SECRET;
	if (!secret) {
		return NextResponse.json(
			{ error: "Demo login is not configured." },
			{ status: 503 },
		);
	}

	const ip =
		req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
		req.headers.get("x-real-ip") ||
		"127.0.0.1";

	if (!checkRateLimit(ip)) {
		return NextResponse.json(
			{ error: "Too many demo login requests. Please try again in 1 minute." },
			{ status: 429 },
		);
	}

	let demoUser = await db.user.findUnique({
		where: { id: DEMO_USER_ID },
	});

	let demoOrg = await db.organization.findUnique({
		where: { id: DEMO_ORG_ID },
	});

	if (!demoUser || !demoOrg) {
		await seedDemoOrg();
		demoUser = await db.user.findUnique({ where: { id: DEMO_USER_ID } });
		demoOrg = await db.organization.findUnique({ where: { id: DEMO_ORG_ID } });
	}

	if (!demoUser || !demoOrg) {
		return NextResponse.json(
			{ error: "Failed to initialize demo organization." },
			{ status: 500 },
		);
	}

	const sessionToken = randomUUID();
	const sessionExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

	await db.session.create({
		data: {
			id: randomUUID(),
			token: sessionToken,
			userId: demoUser.id,
			expiresAt: sessionExpiry,
			activeOrganizationId: demoOrg.id,
			ipAddress: ip,
			userAgent: req.headers.get("user-agent") || "Judge Live Demo Browser",
		},
	});

	const cookieStore = await cookies();
	cookieStore.set(COOKIE_NAME, signedSessionToken(sessionToken, secret), {
		httpOnly: true,
		path: "/",
		sameSite: "lax",
		secure: isProduction,
		expires: sessionExpiry,
	});

	return NextResponse.json({
		success: true,
		redirectUrl: `/${DEMO_ORG_SLUG}/deals`,
	});
}

export async function GET(req: NextRequest) {
	const res = await POST(req);
	if (res.status === 200) {
		return NextResponse.redirect(new URL(`/${DEMO_ORG_SLUG}/deals`, req.url));
	}
	return res;
}

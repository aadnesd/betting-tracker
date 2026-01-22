import { NextResponse } from "next/server";
import { encode } from "next-auth/jwt";
import { findOrCreateOAuthUser } from "@/lib/db/queries";

/**
 * Test-only authentication route.
 * Creates a test user and returns a JWT token for Playwright tests.
 * Only available when PLAYWRIGHT env var is set.
 */
export async function POST(request: Request) {
  // Only allow in test environment
  if (!process.env.PLAYWRIGHT) {
    return NextResponse.json(
      { error: "Test auth only available in test environment" },
      { status: 403 }
    );
  }

  const { email } = await request.json();

  if (!email) {
    return NextResponse.json({ error: "Email is required" }, { status: 400 });
  }

  // Create or find the test user
  const { userId } = await findOrCreateOAuthUser({
    email,
  });

  const secureCookie = process.env.NODE_ENV !== "development";
  const cookieName = secureCookie
    ? "__Secure-authjs.session-token"
    : "authjs.session-token";

  // Create JWT token
  const token = await encode({
    token: {
      sub: userId,
      email: email,
      name: email.split("@")[0],
      id: userId,
    },
    secret: process.env.AUTH_SECRET!,
    salt: cookieName,
    maxAge: 30 * 24 * 60 * 60, // 30 days
  });

  const response = NextResponse.json({
    success: true,
    userId,
    cookieName,
    token,
  });

  response.headers.set("x-test-user-id", userId);
  response.cookies.set({
    name: cookieName,
    value: token,
    httpOnly: true,
    sameSite: "lax",
    secure: secureCookie,
    path: "/",
  });

  return response;
}

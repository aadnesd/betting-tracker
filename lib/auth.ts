import { headers } from "next/headers";
import type { Session } from "next-auth";
import { auth } from "@/app/(auth)/auth";
import { isTestEnvironment } from "@/lib/constants";

const TEST_SESSION_TTL_MS = 60 * 60 * 1000;

/**
 * Returns the authenticated session, with a Playwright-only fallback
 * using the x-test-user-id header.
 */
export async function getTestAwareSession(): Promise<Session | null> {
  const session = await auth();

  if (session?.user) {
    return session;
  }

  if (!isTestEnvironment) {
    return session ?? null;
  }

  const reqHeaders = await headers();
  const testUserId = reqHeaders.get("x-test-user-id");

  if (!testUserId) {
    return session ?? null;
  }

  return {
    user: {
      id: testUserId,
      name: "Playwright",
      email: "playwright@test.local",
      image: null,
    },
    expires: new Date(Date.now() + TEST_SESSION_TTL_MS).toISOString(),
  } satisfies Session;
}

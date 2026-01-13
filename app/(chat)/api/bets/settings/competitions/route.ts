import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/app/(auth)/auth";
import {
  getEnabledCompetitions,
  getUserSettings,
  upsertUserSettings,
} from "@/lib/db/queries";
import { AVAILABLE_COMPETITIONS, DEFAULT_COMPETITION_CODES } from "@/lib/db/schema";

/**
 * GET /api/bets/settings/competitions
 *
 * Returns the user's enabled competitions and available competition options.
 */
export async function GET() {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const settings = await getUserSettings({ userId: session.user.id });
  const enabled = settings?.enabledCompetitions ?? DEFAULT_COMPETITION_CODES;

  return NextResponse.json({
    enabled,
    available: AVAILABLE_COMPETITIONS,
    defaults: DEFAULT_COMPETITION_CODES,
  });
}

const updateCompetitionsSchema = z.object({
  competitions: z.array(z.string()).min(1, "At least one competition must be selected"),
});

/**
 * PATCH /api/bets/settings/competitions
 *
 * Updates the user's enabled competitions.
 * Body: { competitions: string[] }
 */
export async function PATCH(request: Request) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = updateCompetitionsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  // Validate that all codes are valid
  const validCodes: string[] = AVAILABLE_COMPETITIONS.map((c) => c.code);
  const invalidCodes = parsed.data.competitions.filter((c) => !validCodes.includes(c));
  if (invalidCodes.length > 0) {
    return NextResponse.json(
      { error: "Invalid competition codes", invalidCodes },
      { status: 400 }
    );
  }

  const result = await upsertUserSettings({
    userId: session.user.id,
    enabledCompetitions: parsed.data.competitions,
  });

  return NextResponse.json({
    success: true,
    enabled: result.enabledCompetitions ?? parsed.data.competitions,
  });
}

/**
 * POST /api/bets/settings/competitions/reset
 *
 * Resets to default competitions.
 */
export async function POST(request: Request) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Reset to defaults
  const result = await upsertUserSettings({
    userId: session.user.id,
    enabledCompetitions: [...DEFAULT_COMPETITION_CODES],
  });

  return NextResponse.json({
    success: true,
    enabled: result.enabledCompetitions ?? DEFAULT_COMPETITION_CODES,
    message: "Reset to default competitions",
  });
}

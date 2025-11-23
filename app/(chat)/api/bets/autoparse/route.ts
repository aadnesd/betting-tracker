import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/app/(auth)/auth";
import { parseMatchedBetFromScreenshots } from "@/lib/bet-parser";
import { getScreenshotById, updateScreenshotStatus } from "@/lib/db/queries";

const bodySchema = z.object({
  backScreenshotId: z.string().uuid(),
  layScreenshotId: z.string().uuid(),
});

export async function POST(request: Request) {
  const session = await auth();

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: z.infer<typeof bodySchema>;

  try {
    const json = await request.json();
    payload = bodySchema.parse(json);
  } catch {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  try {
    const [backShot, layShot] = await Promise.all([
      getScreenshotById({
        id: payload.backScreenshotId,
        userId: session.user.id,
      }),
      getScreenshotById({
        id: payload.layScreenshotId,
        userId: session.user.id,
      }),
    ]);

    if (!backShot || !layShot) {
      return NextResponse.json(
        { error: "Screenshots not found" },
        { status: 404 }
      );
    }

    const parsed = await parseMatchedBetFromScreenshots({
      backImageUrl: backShot.url,
      layImageUrl: layShot.url,
    });

    await Promise.all([
      updateScreenshotStatus({ id: backShot.id, status: "parsed" }),
      updateScreenshotStatus({ id: layShot.id, status: "parsed" }),
    ]);

    return NextResponse.json(parsed);
  } catch (error) {
    console.error("Failed to parse bets", error);
    const errorMessage =
      error instanceof Error ? error.message : "Failed to parse bets";

    return NextResponse.json(
      { error: errorMessage, needsReview: true },
      { status: 500 }
    );
  }
}

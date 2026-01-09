import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/app/(auth)/auth";
import { parseMatchedBetFromScreenshots } from "@/lib/bet-parser";
import { evaluateNeedsReview } from "@/lib/bet-review";
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
    return NextResponse.json({ error: "Screenshots not found" }, { status: 404 });
  }

  try {
    const parsed = await parseMatchedBetFromScreenshots({
      backImageUrl: backShot.url,
      layImageUrl: layShot.url,
    });

    const { needsReview } = evaluateNeedsReview({
      explicitFlag: parsed.needsReview,
      backConfidence: parsed.back.confidence,
      layConfidence: parsed.lay.confidence,
    });
    const status = needsReview ? "needs_review" : "parsed";

    await Promise.all([
      updateScreenshotStatus({
        id: backShot.id,
        status,
        parsedOutput: parsed.back,
        confidence: parsed.back.confidence ?? null,
        error: null,
      }),
      updateScreenshotStatus({
        id: layShot.id,
        status,
        parsedOutput: parsed.lay,
        confidence: parsed.lay.confidence ?? null,
        error: null,
      }),
    ]);

    return NextResponse.json({ ...parsed, needsReview });
  } catch (error) {
    console.error("Failed to parse bets", error);
    const errorMessage =
      error instanceof Error ? error.message : "Failed to parse bets";

    await Promise.all([
      updateScreenshotStatus({
        id: backShot.id,
        status: "error",
        error: errorMessage,
        parsedOutput: null,
        confidence: null,
      }),
      updateScreenshotStatus({
        id: layShot.id,
        status: "error",
        error: errorMessage,
        parsedOutput: null,
        confidence: null,
      }),
    ]);

    return NextResponse.json(
      { error: errorMessage, needsReview: true },
      { status: 500 }
    );
  }
}

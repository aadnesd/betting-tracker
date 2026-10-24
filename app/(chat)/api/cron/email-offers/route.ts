import { NextResponse } from "next/server";
import { isEmailConfigured } from "@/lib/email-offers/nango";
import { scanEmailOffers } from "@/lib/email-offers/scan";

export const maxDuration = 300;

export async function GET(request: Request) {
  if (
    !process.env.CRON_SECRET ||
    request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isEmailConfigured()) {
    return NextResponse.json({
      skipped: true,
      reason: "Email integration is not configured.",
    });
  }
  try {
    const result = await scanEmailOffers();
    return NextResponse.json(result, { status: result.errors ? 503 : 200 });
  } catch {
    return NextResponse.json(
      { error: "Email scan failed. Progress has been preserved." },
      { status: 503 }
    );
  }
}

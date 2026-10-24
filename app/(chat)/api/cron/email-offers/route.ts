import { NextResponse } from "next/server";
import { deliverOfferAlerts } from "@/lib/email-offers/alerts";
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
  // Retry queued delivery even if Gmail is unavailable or has no new emails.
  const delivery = await deliverOfferAlerts().catch(() => ({
    sent: 0,
    failed: 1,
    skipped: 0,
  }));
  if (!isEmailConfigured()) {
    return NextResponse.json({
      skipped: true,
      delivery,
      reason: "Email integration is not configured.",
    });
  }
  try {
    const result = await scanEmailOffers();
    return NextResponse.json(
      { ...result, delivery },
      { status: result.errors || delivery.failed ? 503 : 200 }
    );
  } catch {
    return NextResponse.json(
      { error: "Email scan failed. Progress has been preserved.", delivery },
      { status: 503 }
    );
  }
}

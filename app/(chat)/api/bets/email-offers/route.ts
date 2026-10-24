import { NextResponse } from "next/server";
import { normalizeAssessment } from "@/lib/email-offers/assess";
import { mailboxRequest } from "@/lib/email-offers/http";
import {
  listEmailOffers,
  listMailboxScans,
} from "@/lib/email-offers/repository";

export async function GET(request: Request) {
  return mailboxRequest(request, async (userId) => {
    const [offers, scans] = await Promise.all([
      listEmailOffers(userId),
      listMailboxScans(userId),
    ]);
    const now = new Date();
    return NextResponse.json({
      offers: offers.map((offer) => ({
        ...offer,
        assessment: normalizeAssessment(offer.assessment, now),
      })),
      scans: scans.map(({ mailboxEmail, checkedUntil, pageToken }) => ({
        mailboxEmail,
        checkedUntil,
        more: Boolean(pageToken),
      })),
    });
  });
}

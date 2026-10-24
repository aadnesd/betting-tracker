import { NextResponse } from "next/server";
import { mailboxRequest } from "@/lib/email-offers/http";
import { scanEmailOffers } from "@/lib/email-offers/scan";

export const maxDuration = 300;

export async function POST(request: Request) {
  return mailboxRequest(request, async (userId) =>
    NextResponse.json(await scanEmailOffers(userId))
  );
}

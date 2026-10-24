import { NextResponse } from "next/server";
import { mailboxRequest } from "@/lib/email-offers/http";
import { createMailClient } from "@/lib/email-offers/nango";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  return mailboxRequest(request, async (userId) =>
    NextResponse.json(
      await createMailClient().reconnectSession(userId, (await params).id)
    )
  );
}

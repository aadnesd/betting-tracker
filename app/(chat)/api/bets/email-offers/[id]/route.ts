import { NextResponse } from "next/server";
import { z } from "zod";
import { mailboxRequest } from "@/lib/email-offers/http";
import { updateEmailOfferStatus } from "@/lib/email-offers/repository";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  return mailboxRequest(request, async (userId) => {
    const id = z
      .string()
      .uuid()
      .parse((await params).id);
    const { status } = z
      .object({ status: z.enum(["new", "saved", "dismissed"]) })
      .parse(await request.json());
    const result = await updateEmailOfferStatus(userId, id, status);
    return result
      ? NextResponse.json(result)
      : NextResponse.json({ error: "Offer not found." }, { status: 404 });
  });
}

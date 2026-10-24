import { mailboxRequest } from "@/lib/email-offers/http";
import { createMailClient } from "@/lib/email-offers/nango";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  return mailboxRequest(request, async (userId) => {
    await createMailClient().disconnect(userId, (await params).id);
    return new Response(null, { status: 204 });
  });
}

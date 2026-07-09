import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/app/(auth)/auth";
import { getAccountById, upsertUserSettings } from "@/lib/db/queries";

const payloadSchema = z.object({
  accountId: z.string().uuid().nullable(),
});

export async function PATCH(request: Request) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: z.infer<typeof payloadSchema>;
  try {
    body = payloadSchema.parse(await request.json());
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid payload", details: error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  let account = null;
  if (body.accountId) {
    account = await getAccountById({
      id: body.accountId,
      userId: session.user.id,
    });

    if (!account) {
      return NextResponse.json(
        { error: "Exchange account not found" },
        { status: 404 }
      );
    }

    if (account.kind !== "exchange") {
      return NextResponse.json(
        { error: "Default lay exchange must be an exchange account" },
        { status: 400 }
      );
    }

    if (account.status !== "active") {
      return NextResponse.json(
        { error: "Default lay exchange must be active" },
        { status: 400 }
      );
    }
  }

  const settings = await upsertUserSettings({
    userId: session.user.id,
    defaultLayExchangeAccountId: account?.id ?? null,
  });

  return NextResponse.json({
    success: true,
    defaultLayExchangeAccountId: settings.defaultLayExchangeAccountId ?? null,
  });
}

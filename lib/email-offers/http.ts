import "server-only";

import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { getTestAwareSession } from "@/lib/auth";
import { MailboxError } from "./nango";

export async function mailboxRequest(
  request: Request,
  operation: (userId: string) => Promise<Response>
) {
  const session = await getTestAwareSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (request.method !== "GET") {
    const origin = request.headers.get("origin");
    // Next can expose an internal URL behind its adapter or a reverse proxy.
    // The browser's Host header identifies the public origin and includes port.
    const host = request.headers.get("host") ?? new URL(request.url).host;
    let validOrigin = true;
    if (origin) {
      try {
        validOrigin = new URL(origin).host === host;
      } catch {
        validOrigin = false;
      }
    }
    if (!validOrigin) {
      return NextResponse.json(
        { error: "Invalid request origin" },
        { status: 403 }
      );
    }
  }
  try {
    return await operation(session.user.id);
  } catch (error) {
    if (error instanceof MailboxError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      );
    }
    if (error instanceof ZodError || error instanceof SyntaxError) {
      return NextResponse.json(
        { error: "Invalid request or mailbox response." },
        { status: 400 }
      );
    }
    return NextResponse.json(
      {
        error:
          "The email request failed. Try again later. Scan progress has been preserved.",
      },
      { status: 502 }
    );
  }
}

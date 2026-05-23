import { NextResponse } from "next/server";
import { auth } from "@/app/(auth)/auth";
import {
  createAuditEntry,
  disconnectGmailConnection,
  getGmailConnectionByUserId,
} from "@/lib/db/queries";

export async function GET() {
  const session = await auth();

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const connection = await getGmailConnectionByUserId({
    userId: session.user.id,
  });

  return NextResponse.json({
    connected: connection?.status === "connected",
    connection: connection
      ? {
          gmailEmail: connection.gmailEmail,
          status: connection.status,
          lastSyncedAt: connection.lastSyncedAt,
          lastError: connection.lastError,
        }
      : null,
  });
}

export async function DELETE() {
  const session = await auth();

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const connection = await disconnectGmailConnection({
    userId: session.user.id,
  });

  if (connection) {
    await createAuditEntry({
      userId: session.user.id,
      entityType: "gmail_connection",
      entityId: connection.id,
      action: "status_change",
      changes: { status: "disconnected" },
      notes: "Disconnected Gmail promotion intake",
    });
  }

  return NextResponse.json({ success: true });
}

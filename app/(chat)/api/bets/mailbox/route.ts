import { NextResponse } from "next/server";
import { mailboxRequest } from "@/lib/email-offers/http";
import {
  createMailClient,
  isEmailConfigured,
  MailboxError,
} from "@/lib/email-offers/nango";

export async function GET(request: Request) {
  return mailboxRequest(request, async (userId) => {
    if (!isEmailConfigured()) {
      return NextResponse.json({ configured: false, connections: [] });
    }
    const client = createMailClient();
    const connections = await client.listConnections(userId);
    return NextResponse.json({
      configured: true,
      connections: await Promise.all(
        connections.map(async (connection) => {
          try {
            return await client.mailbox(connection);
          } catch (error) {
            if (!(error instanceof MailboxError)) {
              throw error;
            }
            return {
              id: connection.connection_id,
              createdAt: connection.created,
              email: null,
              needsReconnect: false,
              unavailable: true,
            };
          }
        })
      ),
    });
  });
}

export async function POST(request: Request) {
  return mailboxRequest(request, async (userId) =>
    NextResponse.json(await createMailClient().connectSession(userId))
  );
}

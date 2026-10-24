import "server-only";

import { z } from "zod";
import type { Mailbox } from "./types";
import { emailPageSchema } from "./types";

const APPLICATION = "betting-tracker";
const connectionSchema = z.object({
  connection_id: z.string().min(1),
  provider_config_key: z.string(),
  created: z.string(),
  tags: z.record(z.string()).nullish(),
  errors: z.array(z.object({ type: z.string() })).nullish(),
});
export type MailConnection = z.infer<typeof connectionSchema>;

export class MailboxError extends Error {
  readonly status: number;
  readonly upstreamStatus?: number;
  constructor(status: number, message: string, upstreamStatus?: number) {
    super(message);
    this.status = status;
    this.upstreamStatus = upstreamStatus;
    this.name = "MailboxError";
  }
}

export function isEmailConfigured() {
  return Boolean(
    process.env.NANGO_SECRET_KEY ||
      process.env.NANGO_API_KEY ||
      process.env.NANGO_TOOLBOX_SECRET_KEY
  );
}

export function createMailClient() {
  const secret =
    process.env.NANGO_SECRET_KEY ||
    process.env.NANGO_API_KEY ||
    process.env.NANGO_TOOLBOX_SECRET_KEY;
  if (!secret) {
    throw new MailboxError(503, "Email integration is not configured.");
  }
  const baseUrl = process.env.NANGO_SERVER_URL || "https://api.nango.dev";
  const integrationId = process.env.NANGO_MAILBOX_INTEGRATION || "google-mail";

  async function call(path: string, init: RequestInit = {}) {
    const response = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
        ...init.headers,
      },
      signal: AbortSignal.timeout(45_000),
      cache: "no-store",
    });
    if (!response.ok) {
      if (response.status === 429) {
        throw new MailboxError(
          429,
          "Mailbox rate limit reached. Try again later."
        );
      }
      throw new MailboxError(
        502,
        "Nango could not complete the mailbox request. Check the connection or try again later.",
        response.status
      );
    }
    return response;
  }

  async function session(path: string, body: unknown) {
    const response = await call(path, {
      method: "POST",
      body: JSON.stringify(body),
    });
    const { data } = z
      .object({ data: z.object({ token: z.string(), expires_at: z.string() }) })
      .parse(await response.json());
    return { sessionToken: data.token, expiresAt: data.expires_at };
  }

  async function listConnections(userId?: string) {
    const all: MailConnection[] = [];
    // Nango's first page is 0, unlike Gmail's opaque continuation tokens.
    for (let page = 0; ; page++) {
      const query = new URLSearchParams({
        "tags[application]": APPLICATION,
        limit: "100",
        page: String(page),
      });
      if (userId) {
        query.set("tags[end_user_id]", userId);
      }
      const response = await call(`/connections?${query}`);
      const { connections } = z
        .object({ connections: z.array(connectionSchema) })
        .parse(await response.json());
      // Verify the tags again locally, even when Nango filtered the request.
      all.push(
        ...connections.filter(
          (c) =>
            c.provider_config_key === integrationId &&
            c.tags?.application === APPLICATION &&
            Boolean(c.tags.end_user_id) &&
            (!userId || c.tags.end_user_id === userId)
        )
      );
      if (connections.length < 100) {
        return all;
      }
      if (page >= 99) {
        throw new MailboxError(
          503,
          "Too many mailbox connections to scan in one run."
        );
      }
    }
  }

  async function ownedConnection(userId: string, id: string) {
    const connection = (await listConnections(userId)).find(
      (c) => c.connection_id === id
    );
    if (!connection) {
      throw new MailboxError(404, "Mailbox connection not found.");
    }
    return connection;
  }

  async function mailbox(connection: MailConnection): Promise<Mailbox> {
    const needsReconnect = (connection.errors ?? []).some(
      (error) => error.type === "auth"
    );
    const result = {
      id: connection.connection_id,
      createdAt: connection.created,
      needsReconnect,
      email: null as string | null,
    };
    if (needsReconnect) {
      return result;
    }
    // https://developers.google.com/workspace/gmail/api/reference/rest/v1/users/getProfile
    const response = await call("/proxy/gmail/v1/users/me/profile", {
      headers: {
        "Provider-Config-Key": integrationId,
        "Connection-Id": connection.connection_id,
        Retries: "3",
        "Retry-On": "429",
      },
    }).catch((error: unknown) => {
      if (error instanceof MailboxError && error.upstreamStatus === 401) {
        return null;
      }
      throw error;
    });
    if (!response) {
      return { ...result, needsReconnect: true };
    }
    result.email = z
      .object({ emailAddress: z.string().email() })
      .parse(await response.json())
      .emailAddress.toLowerCase();
    return result;
  }

  return {
    listConnections,
    ownedConnection,
    mailbox,
    connectSession: (userId: string) =>
      session("/connect/sessions", {
        tags: { application: APPLICATION, end_user_id: userId },
        allowed_integrations: [integrationId],
      }),
    async reconnectSession(userId: string, id: string) {
      await ownedConnection(userId, id);
      return session("/connect/sessions/reconnect", {
        integration_id: integrationId,
        connection_id: id,
      });
    },
    async disconnect(userId: string, id: string) {
      await ownedConnection(userId, id);
      try {
        await call(
          `/connections/${encodeURIComponent(id)}?${new URLSearchParams({ provider_config_key: integrationId })}`,
          { method: "DELETE" }
        );
      } catch (error) {
        if (!(error instanceof MailboxError && error.upstreamStatus === 404)) {
          throw error;
        }
      }
    },
    async readPage(
      connectionId: string,
      input: { after: string; before: string; cursor?: string }
    ) {
      const response = await call("/action/trigger", {
        method: "POST",
        headers: {
          "Provider-Config-Key": integrationId,
          "Connection-Id": connectionId,
        },
        body: JSON.stringify({ action_name: "list-offer-emails", input }),
      });
      return emailPageSchema.parse(await response.json());
    },
  };
}

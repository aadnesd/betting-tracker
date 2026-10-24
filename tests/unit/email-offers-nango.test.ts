import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMailClient, MailboxError } from "@/lib/email-offers/nango";

vi.mock("server-only", () => ({}));
const connection = {
  connection_id: "own",
  provider_config_key: "google-mail",
  created: "2026-10-24T00:00:00Z",
  tags: { application: "betting-tracker", end_user_id: "user-1" },
};
const fetchMock = vi.fn<typeof fetch>();
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });

describe("Nango mailbox authorization", () => {
  beforeEach(() => {
    vi.stubEnv("NANGO_API_KEY", "test-secret");
    vi.stubEnv("NANGO_SECRET_KEY", "");
    vi.stubEnv("NANGO_TOOLBOX_SECRET_KEY", "");
    vi.stubEnv("NANGO_MAILBOX_INTEGRATION", "google-mail");
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("tags connect sessions with the server's application and user", async () => {
    fetchMock.mockResolvedValueOnce(
      json({ data: { token: "short-lived", expires_at: "later" } })
    );
    expect(await createMailClient().connectSession("user-1")).toEqual({
      sessionToken: "short-lived",
      expiresAt: "later",
    });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.nango.dev/connect/sessions");
    expect(JSON.parse(init!.body as string)).toEqual({
      tags: connection.tags,
      allowed_integrations: ["google-mail"],
    });
  });

  it("checks user, application and integration even if the remote filter returns unrelated rows", async () => {
    fetchMock.mockResolvedValueOnce(
      json({
        connections: [
          connection,
          {
            ...connection,
            connection_id: "foreign-user",
            tags: { ...connection.tags, end_user_id: "user-2" },
          },
          {
            ...connection,
            connection_id: "foreign-app",
            tags: { ...connection.tags, application: "taki" },
          },
          {
            ...connection,
            connection_id: "foreign-provider",
            provider_config_key: "github",
          },
          { ...connection, connection_id: "untagged", tags: null },
        ],
      })
    );
    expect(
      (await createMailClient().listConnections("user-1")).map(
        (c) => c.connection_id
      )
    ).toEqual(["own"]);
    expect(String(fetchMock.mock.calls[0][0])).toContain(
      "tags%5Bend_user_id%5D=user-1"
    );
  });

  it("paginates connections before finding the caller's mailbox", async () => {
    fetchMock.mockResolvedValueOnce(
      json({
        connections: Array.from({ length: 100 }, () => ({
          ...connection,
          tags: null,
        })),
      })
    );
    fetchMock.mockResolvedValueOnce(json({ connections: [connection] }));
    expect(await createMailClient().listConnections("user-1")).toHaveLength(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain("page=0");
    expect(String(fetchMock.mock.calls[1][0])).toContain("page=1");
  });

  it.each(["reconnect", "disconnect"])(
    "refuses a foreign connection for %s",
    async (operation) => {
      fetchMock.mockResolvedValueOnce(json({ connections: [] }));
      const client = createMailClient();
      await expect(
        operation === "reconnect"
          ? client.reconnectSession("user-1", "foreign")
          : client.disconnect("user-1", "foreign")
      ).rejects.toMatchObject({ status: 404 });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    }
  );

  it("does not try to read a mailbox whose tokens require reconnecting", async () => {
    expect(
      await createMailClient().mailbox({
        ...connection,
        errors: [{ type: "auth" }],
      })
    ).toMatchObject({ needsReconnect: true, email: null });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("turns a newly expired credential into a reconnect state", async () => {
    fetchMock.mockResolvedValueOnce(json({}, 401));
    expect(await createMailClient().mailbox(connection)).toMatchObject({
      needsReconnect: true,
    });
  });

  it("reports retry-later on rate limits without returning provider content", async () => {
    fetchMock.mockResolvedValueOnce(
      json({ private: "mail content and token" }, 429)
    );
    await expect(createMailClient().mailbox(connection)).rejects.toEqual(
      new MailboxError(429, "Mailbox rate limit reached. Try again later.")
    );
  });

  it("treats a concurrently deleted connection as disconnected", async () => {
    fetchMock
      .mockResolvedValueOnce(json({ connections: [connection] }))
      .mockResolvedValueOnce(json({}, 404));
    await expect(
      createMailClient().disconnect("user-1", "own")
    ).resolves.toBeUndefined();
  });

  it("does not configure a client without a server-side key", () => {
    vi.stubEnv("NANGO_API_KEY", "");
    expect(() => createMailClient()).toThrow("not configured");
  });
});

import { describe, expect, it, vi } from "vitest";
import action from "./list-offer-emails.js";

const input = {
  after: "2026-10-01T00:00:00Z",
  before: "2026-10-24T00:00:00Z",
  cursor: "page-2",
};
const message = {
  id: "m1",
  threadId: "t1",
  internalDate: "1792800000000",
  snippet: "A free bet",
  payload: {
    mimeType: "multipart/mixed",
    headers: [
      { name: "From", value: "offers@example.com" },
      { name: "Subject", value: "Free bet" },
    ],
    parts: [
      { mimeType: "text/plain", body: { data: "c3ludGhldGlj" } },
      {
        mimeType: "image/png",
        filename: "tracking.png",
        body: { data: "private-image" },
      },
    ],
  },
};
function mock(get: ReturnType<typeof vi.fn>) {
  return { get } as unknown as Parameters<typeof action.exec>[0];
}

describe("Gmail offer reader", () => {
  it("uses the fixed search window and cursor, returning text without image or attachment reads", async () => {
    const get = vi
      .fn()
      .mockResolvedValueOnce({
        data: { messages: [{ id: "m1" }], nextPageToken: "page-3" },
      })
      .mockResolvedValueOnce({ data: message });
    const result = await action.exec(mock(get), input);
    expect(get.mock.calls[0]?.[0]).toMatchObject({
      params: { maxResults: "10", pageToken: "page-2" },
      retries: 3,
      retryOn: [403, 429],
    });
    expect(get.mock.calls[0]?.[0].params.q).toContain(
      "after:1790812800 before:1792800000"
    );
    expect(result.nextCursor).toBe("page-3");
    expect(result.messages[0]?.body).toEqual({
      mimeType: "text/plain",
      data: "c3ludGhldGlj",
    });
    expect(JSON.stringify(result)).not.toContain("private-image");
    expect(get).toHaveBeenCalledTimes(2);
  });

  it("skips a message deleted after listing without losing the next-page cursor", async () => {
    const get = vi
      .fn()
      .mockResolvedValueOnce({
        data: {
          messages: [{ id: "gone" }, { id: "m1" }],
          nextPageToken: "page-3",
        },
      })
      .mockRejectedValueOnce({ response: { status: 404 } })
      .mockResolvedValueOnce({ data: message });
    const result = await action.exec(mock(get), input);
    expect(result.messages).toHaveLength(1);
    expect(result.nextCursor).toBe("page-3");
  });

  it("fails a rate-limited page so the app retries it without advancing progress", async () => {
    const get = vi
      .fn()
      .mockResolvedValueOnce({ data: { messages: [{ id: "m1" }] } })
      .mockRejectedValueOnce({ response: { status: 429 } });
    await expect(action.exec(mock(get), input)).rejects.toMatchObject({
      response: { status: 429 },
    });
  });
});

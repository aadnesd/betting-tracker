import { createAction } from "nango";
import { z } from "zod";

type Part = {
  mimeType?: string;
  filename?: string;
  body?: { data?: string };
  parts?: Part[];
};

function findBody(part: Part, mimeType: string): Part | undefined {
  if (part.mimeType === mimeType && !part.filename && part.body?.data) {
    return part;
  }
  for (const child of part.parts ?? []) {
    const found = findBody(child, mimeType);
    if (found) {
      return found;
    }
  }
  return;
}

const action = createAction({
  description:
    "Read one bounded page of recent promotional emails without modifying Gmail or downloading attachments.",
  version: "1.0.0",
  scopes: ["https://www.googleapis.com/auth/gmail.readonly"],
  input: z.object({
    after: z.iso
      .datetime({ offset: true })
      .describe('Start of search window. Example: "2026-10-01T00:00:00Z"'),
    before: z.iso
      .datetime({ offset: true })
      .describe('End of search window. Example: "2026-10-24T00:00:00Z"'),
    cursor: z
      .string()
      .optional()
      .describe("Gmail next-page token from the previous response."),
  }),
  output: z.object({
    messages: z.array(
      z.object({
        id: z.string(),
        threadId: z.string(),
        receivedAt: z.iso.datetime(),
        sender: z.string(),
        subject: z.string(),
        snippet: z.string(),
        body: z.object({ mimeType: z.string(), data: z.string() }).optional(),
      })
    ),
    nextCursor: z.string().optional(),
  }),
  exec: async (nango, input) => {
    if (new Date(input.after) >= new Date(input.before)) {
      throw new nango.ActionError({
        type: "invalid_window",
        message: "after must precede before",
      });
    }
    const q = `after:${Math.floor(Date.parse(input.after) / 1000)} before:${Math.floor(Date.parse(input.before) / 1000)} -in:spam -in:trash -in:sent {freebet "free bet" "free bets" gratisspill gratisspel "bet and get" bonus cashback oddsboost "odds boost" "boosted odds" "risk free" "risk-free" "pengene tilbake" kampanje kampanj tilbud promotion}`;
    // https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/list
    const list = await nango.get<{
      messages?: { id: string }[];
      nextPageToken?: string;
    }>({
      endpoint: "/gmail/v1/users/me/messages",
      params: {
        q,
        maxResults: "10",
        ...(input.cursor ? { pageToken: input.cursor } : {}),
      },
      retries: 3,
      retryOn: [403, 429],
    });
    const messages = [];
    for (const message of list.data.messages ?? []) {
      // https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/get
      const response = await nango
        .get<{
          id: string;
          threadId: string;
          internalDate: string;
          snippet?: string;
          payload: Part & { headers?: { name: string; value: string }[] };
        }>({
          endpoint: `/gmail/v1/users/me/messages/${encodeURIComponent(message.id)}`,
          params: { format: "full" },
          retries: 3,
          retryOn: [403, 429],
        })
        .catch((error: unknown) => {
          // Mail can be deleted between listing and reading. Other errors must
          // fail the page, preserving the app's checkpoint for a later retry.
          if (
            error &&
            typeof error === "object" &&
            "response" in error &&
            error.response &&
            typeof error.response === "object" &&
            "status" in error.response &&
            error.response.status === 404
          ) {
            return null;
          }
          throw error;
        });
      if (!response) {
        continue;
      }
      const mail = response.data;
      const header = (name: string) =>
        mail.payload.headers?.find((h) => h.name.toLowerCase() === name)
          ?.value ?? "";
      const part =
        findBody(mail.payload, "text/plain") ??
        findBody(mail.payload, "text/html");
      messages.push({
        id: mail.id,
        threadId: mail.threadId,
        receivedAt: new Date(Number(mail.internalDate)).toISOString(),
        sender: header("from").slice(0, 1000),
        subject: header("subject").slice(0, 1000),
        snippet: (mail.snippet ?? "").slice(0, 2000),
        ...(part?.body?.data
          ? {
              body: {
                mimeType: part.mimeType!,
                data: part.body.data.slice(0, 80_000),
              },
            }
          : {}),
      });
    }
    return {
      messages,
      ...(list.data.nextPageToken
        ? { nextCursor: list.data.nextPageToken }
        : {}),
    };
  },
});

export default action;

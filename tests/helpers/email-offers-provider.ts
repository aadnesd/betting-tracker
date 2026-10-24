// Local Nango protocol fixture for the opt-in HTTP/browser flow test.
// Run against a disposable local database. The AI model remains real.
import { createServer } from "node:http";

const userId = "12345678-1234-4234-8234-123456789abc";
let receivedAt = new Date();
const messages: { chat_id: string; text: string }[] = [];
let failNext = false;

createServer(async (req, res) => {
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
  }
  const body = raw ? JSON.parse(raw) : {};
  const url = new URL(req.url!, "http://127.0.0.1:3017");
  res.setHeader("Content-Type", "application/json");
  const reply = (data: unknown, status = 200) => {
    res.statusCode = status;
    res.end(JSON.stringify(data));
  };
  if (url.pathname === "/test/reset") {
    receivedAt = new Date();
    messages.length = 0;
    failNext = false;
    return reply({ receivedAt: receivedAt.toISOString() });
  }
  if (url.pathname === "/test/messages") {
    return reply(messages);
  }
  if (url.pathname === "/test/fail-next") {
    failNext = true;
    return reply({ ok: true });
  }
  if (url.pathname === "/connections") {
    return reply({
      connections: [
        {
          connection_id: "gmail-fixture",
          provider_config_key: "google-mail",
          created: "2026-10-24T00:00:00Z",
          tags: { application: "betting-tracker", end_user_id: userId },
        },
      ],
    });
  }
  if (url.pathname === "/proxy/gmail/v1/users/me/profile") {
    return reply({ emailAddress: "fixture@example.com" });
  }
  if (url.pathname === "/proxy/getMe") {
    return reply({ ok: true, result: { username: "BettingTrackerTestBot" } });
  }
  if (url.pathname === "/proxy/sendMessage") {
    if (failNext) {
      failNext = false;
      return reply(
        { ok: false, error_code: 429, parameters: { retry_after: 60 } },
        429
      );
    }
    messages.push(body);
    return reply({ ok: true, result: { message_id: messages.length } });
  }
  if (url.pathname === "/action/trigger") {
    const history =
      new Date(body.input.after).getTime() < Date.now() - 86_400_000;
    const expiry = new Date(Date.now() + 2 * 86_400_000).toISOString();
    const text = `bet365 sportsbook offer: claim a 100 NOK free bet before ${expiry}. This personal promotion is available to the recipient as an existing verified customer, with no additional eligibility conditions or regional restrictions. No deposit and no qualifying bet required. Activate by choosing Claim in your Offers page. Use the free bet on any pre-match single sportsbook bet with decimal odds at least 1.50. Maximum free bet stake 100 NOK. Free bet stake is not returned with winnings. Winnings are withdrawable cash with zero wagering requirements and no winnings cap. No excluded sports or markets. Activate and use before the expiry above, which is UTC. One claim per customer. These are the complete promotional terms; no other promotional conditions apply.`;
    return reply({
      messages: [
        {
          id: history ? "historical-fixture" : "new-fixture",
          threadId: "synthetic-thread",
          sender: "bet365 <offers@bet365.com>",
          subject: "Your 100 NOK free bet",
          receivedAt: history
            ? new Date(Date.now() - 10 * 86_400_000).toISOString()
            : receivedAt.toISOString(),
          snippet: text,
          body: {
            mimeType: "text/plain",
            data: Buffer.from(text).toString("base64url"),
          },
        },
        ...(history
          ? []
          : [
              {
                id: "incomplete-fixture",
                threadId: "incomplete-thread",
                sender: "bet365 <offers@bet365.com>",
                subject: "A bonus for you",
                receivedAt: receivedAt.toISOString(),
                snippet:
                  "Get a 100 NOK bonus. Full eligibility, expiry and wagering terms are only shown after clicking the link.",
              },
              {
                id: "receipt-fixture",
                threadId: "receipt-thread",
                sender: "bet365 <support@bet365.com>",
                subject: "Deposit confirmation",
                receivedAt: receivedAt.toISOString(),
                snippet:
                  "Your deposit of 100 NOK succeeded. This is a receipt. No bonus or promotional reward is included.",
              },
            ]),
      ],
      ...(history ? { nextCursor: "history-still-pending" } : {}),
    });
  }
  return reply({ error: "Unknown fixture endpoint" }, 404);
}).listen(3017, "127.0.0.1");

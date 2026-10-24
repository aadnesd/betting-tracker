import { z } from "zod";

export const offerAssessmentSchema = z.object({
  isOffer: z.boolean(),
  confidence: z
    .number()
    .min(0)
    .max(1)
    .describe(
      "Confidence in identifying the promotion and extracting its advertised terms, not authenticity or profitability."
    ),
  title: z.string().max(200),
  bookmaker: z.string().max(100).nullable(),
  type: z.enum([
    "free_bet",
    "bet_and_get",
    "deposit_bonus",
    "odds_boost",
    "cashback",
    "other",
  ]),
  rewardAmount: z.number().positive().max(1_000_000).nullable(),
  currency: z.enum(["NOK", "EUR", "GBP", "USD", "SEK", "DKK"]).nullable(),
  qualifyingStake: z.number().nonnegative().max(1_000_000).nullable(),
  minOdds: z.number().min(1).max(100_000).nullable(),
  wageringMultiplier: z.number().nonnegative().max(10_000).nullable(),
  expiresAt: z.string().datetime({ offset: true }).nullable(),
  verdict: z.enum(["worth_checking", "review", "skip"]),
  reasoning: z.string().max(2000),
  terms: z.array(z.string().max(1000)).max(15),
  unknowns: z
    .array(z.string().max(500))
    .max(15)
    .describe(
      "Material promotional conditions missing or ambiguous in the email. Empty when the promotional terms are complete. Routine external checks of authenticity, live odds, commission or account status belong in reasoning."
    ),
});

export type OfferAssessment = z.infer<typeof offerAssessmentSchema>;

export const emailPageSchema = z.object({
  messages: z
    .array(
      z.object({
        id: z.string().min(1),
        threadId: z.string().min(1),
        receivedAt: z.string().datetime({ offset: true }),
        sender: z.string().max(1000),
        subject: z.string().max(1000),
        snippet: z.string().max(2000),
        body: z
          .object({ mimeType: z.string(), data: z.string().max(80_000) })
          .optional(),
      })
    )
    .max(20),
  nextCursor: z.string().optional(),
});

export type OfferEmail = z.infer<typeof emailPageSchema>["messages"][number];
export type Mailbox = {
  id: string;
  email: string | null;
  needsReconnect: boolean;
  createdAt: string;
  unavailable?: boolean;
};

export type EmailOfferView = {
  id: string;
  mailboxEmail: string;
  messageId: string;
  threadId: string;
  sender: string;
  subject: string;
  receivedAt: string;
  assessment: OfferAssessment;
  status: "new" | "saved" | "dismissed";
};

export function gmailMessageUrl(mailboxEmail: string, threadId: string) {
  return `https://mail.google.com/mail/u/?authuser=${encodeURIComponent(mailboxEmail)}#all/${encodeURIComponent(threadId)}`;
}

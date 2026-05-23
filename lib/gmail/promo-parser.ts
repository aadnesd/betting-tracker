import "server-only";

import { generateObject } from "ai";
import { z } from "zod";
import { myProvider } from "@/lib/ai/providers";
import { isTestEnvironment } from "@/lib/constants";
import type { Account } from "@/lib/db/schema";

const promoKinds = [
  "free_bet",
  "deposit_bonus",
  "odds_boost",
  "refund",
  "cashback",
  "enhanced_odds",
  "other",
] as const;

const parsedEmailPromoSchema = z.object({
  interesting: z.boolean(),
  promoKind: z.enum(promoKinds),
  title: z.string().min(1),
  summary: z.string().min(1),
  accountNameGuess: z.string().nullable(),
  accountId: z.string().uuid().nullable(),
  confidence: z.number().min(0).max(1),
  expiresAt: z.string().datetime().nullable(),
  minOdds: z.number().nullable(),
  maxStake: z.number().nullable(),
  currency: z.string().length(3).nullable(),
  terms: z.object({
    offer: z.string().nullable(),
    qualifyingActions: z.array(z.string()),
    restrictions: z.array(z.string()),
    wageringRequirement: z.string().nullable(),
    sourceTerms: z.string().nullable(),
  }),
  needsReviewReason: z.string().nullable(),
});

export type ParsedEmailPromo = z.infer<typeof parsedEmailPromoSchema>;

export async function parseEmailPromo({
  subject,
  sender,
  body,
  accounts,
}: {
  subject: string;
  sender?: string | null;
  body: string;
  accounts: Account[];
}): Promise<ParsedEmailPromo> {
  if (isTestEnvironment) {
    return {
      interesting: true,
      promoKind: "free_bet",
      title: "Test free bet offer",
      summary: "A test bookmaker is offering a free bet with minimum odds.",
      accountNameGuess: accounts[0]?.name ?? null,
      accountId: accounts[0]?.id ?? null,
      confidence: accounts[0] ? 0.9 : 0.7,
      expiresAt: null,
      minOdds: 1.8,
      maxStake: 50,
      currency: accounts[0]?.currency ?? "NOK",
      terms: {
        offer: "Free bet test fixture",
        qualifyingActions: ["Place a qualifying bet"],
        restrictions: ["Minimum odds 1.80"],
        wageringRequirement: null,
        sourceTerms: "Test environment stub response",
      },
      needsReviewReason: accounts[0] ? null : "No account matched",
    };
  }

  const accountContext = accounts.map((account) => ({
    id: account.id,
    name: account.name,
    kind: account.kind,
    currency: account.currency,
  }));

  const { object } = await generateObject({
    model: myProvider.languageModel("chat-model"),
    schema: parsedEmailPromoSchema,
    messages: [
      {
        role: "system",
        content:
          "You extract betting promotion terms from bookmaker emails for a matched-betting tracker. " +
          "Only mark interesting=true when the email contains a concrete betting offer, bonus, free bet, odds boost, refund, cashback, or wagering requirement. " +
          "Link accountId only when the bookmaker clearly matches one of the provided bookmaker accounts. " +
          "Return concise summaries and preserve the important rules, expiry, min odds, max stake, currency, and wagering requirements.",
      },
      {
        role: "user",
        content:
          `Subject: ${subject}\n` +
          `Sender: ${sender ?? "unknown"}\n\n` +
          `Known bookmaker accounts:\n${JSON.stringify(accountContext, null, 2)}\n\n` +
          `Email body:\n${body.slice(0, 16_000)}`,
      },
    ],
  });

  return parsedEmailPromoSchema.parse(object);
}

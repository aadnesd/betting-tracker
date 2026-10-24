import type { OfferAssessment } from "./types";
import { gmailMessageUrl } from "./types";

export function isAlertWorthy(a: OfferAssessment, now: Date) {
  return (
    a.isOffer &&
    a.verdict === "worth_checking" &&
    a.confidence >= 0.8 &&
    a.rewardAmount !== null &&
    a.currency !== null &&
    a.unknowns.length === 0 &&
    a.expiresAt !== null &&
    new Date(a.expiresAt).getTime() > now.getTime()
  );
}

export function offerAlertText(offer: {
  assessment: OfferAssessment;
  mailboxEmail: string;
  threadId: string;
}) {
  const a = offer.assessment;
  // Plain text, bounded fields, and a constructed Gmail URL. Never render email HTML.
  return [
    "Good offer you should take a look at",
    `${a.bookmaker || "Bookmaker"}: ${a.title.slice(0, 200)}`,
    `Advertised reward: ${a.currency} ${a.rewardAmount}`,
    ...(a.qualifyingStake !== null
      ? [`Qualifying stake: ${a.currency} ${a.qualifyingStake}`]
      : []),
    ...(a.minOdds !== null ? [`Minimum odds: ${a.minOdds}`] : []),
    ...(a.wageringMultiplier !== null
      ? [`Wagering: ${a.wageringMultiplier}x`]
      : []),
    `Expires: ${a.expiresAt}`,
    a.reasoning.slice(0, 600),
    ...a.terms.slice(0, 3).map((term) => `• ${term.slice(0, 250)}`),
    "Check eligibility and live odds before using it. This is not a profit guarantee.",
    gmailMessageUrl(offer.mailboxEmail, offer.threadId),
  ].join("\n");
}

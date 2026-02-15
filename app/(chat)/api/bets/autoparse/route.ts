import { NextResponse } from "next/server";
import { z } from "zod";
import { getTestAwareSession } from "@/lib/auth";
import type { ParsedBet, ParsedPair } from "@/lib/bet-parser";
import {
  isOcrConfigured,
  parseMatchedBetFromScreenshots,
  parseMatchedBetWithOcr,
} from "@/lib/bet-parser";
import {
  type AgentAccount,
  type AgentParsedPair,
  parseMatchedBetWithAgent,
} from "@/lib/bet-parser-agent";
import { evaluateNeedsReview } from "@/lib/bet-review";
import {
  getAccountByName,
  getScreenshotById,
  listAccountsByUser,
  updateScreenshotStatus,
} from "@/lib/db/queries";
import { linkBetToMatch, type MatchLinkResult } from "@/lib/match-linking";

/**
 * Performance timer utility for diagnosing API slowness.
 * Records elapsed time for named phases.
 */
function createTimer() {
  const startTime = Date.now();
  const phases: Record<string, number> = {};
  let lastMark = startTime;

  return {
    mark(name: string) {
      const now = Date.now();
      phases[name] = now - lastMark;
      lastMark = now;
    },
    log(prefix: string) {
      const totalMs = Date.now() - startTime;
      const phaseStr = Object.entries(phases)
        .map(([name, ms]) => `${name}=${ms}ms`)
        .join(", ");
      console.log(`[${prefix}] Total: ${totalMs}ms | Phases: ${phaseStr}`);
    },
  };
}

const bodySchema = z.object({
  backScreenshotId: z.string().uuid(),
  layScreenshotId: z.string().uuid(),
});

/**
 * Attempts to match a parsed exchange/bookmaker name against user's existing accounts.
 * Returns the accountId if matched, otherwise null.
 */
async function matchAccountForBet({
  userId,
  exchangeName,
  kind,
}: {
  userId: string;
  exchangeName: string;
  kind: "bookmaker" | "exchange";
}): Promise<string | null> {
  if (!exchangeName || exchangeName.trim().length === 0) {
    return null;
  }

  const account = await getAccountByName({
    userId,
    name: exchangeName,
    kind,
  });

  return account?.id ?? null;
}

/**
 * Enriches a parsed bet with account matching results.
 * Sets accountId if match found, otherwise sets unmatchedAccount flag.
 */
function enrichBetWithAccountMatch(
  bet: ParsedBet,
  accountId: string | null
): ParsedBet {
  return {
    ...bet,
    accountId,
    unmatchedAccount: accountId === null,
  };
}

export async function POST(request: Request) {
  const timer = createTimer();
  const session = await getTestAwareSession();
  timer.mark("auth");

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: z.infer<typeof bodySchema>;

  try {
    const json = await request.json();
    payload = bodySchema.parse(json);
  } catch {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }
  timer.mark("parsePayload");

  const [backShot, layShot] = await Promise.all([
    getScreenshotById({
      id: payload.backScreenshotId,
      userId: session.user.id,
    }),
    getScreenshotById({
      id: payload.layScreenshotId,
      userId: session.user.id,
    }),
  ]);
  timer.mark("fetchScreenshots");

  if (!backShot || !layShot) {
    return NextResponse.json(
      { error: "Screenshots not found" },
      { status: 404 }
    );
  }

  try {
    // Fetch user's accounts for context-aware parsing
    const userAccounts = await listAccountsByUser({ userId: session.user.id });
    const agentAccounts: AgentAccount[] = userAccounts.map((a) => ({
      id: a.id,
      name: a.name,
      kind: a.kind as "bookmaker" | "exchange",
      currency: a.currency,
    }));
    timer.mark("fetchAccounts");

    // Use OCR-based parsing if Azure Document Intelligence is configured (faster)
    // Otherwise fall back to vision LLM approach
    const useOcr = isOcrConfigured();
    const hasAccounts = agentAccounts.length > 0;

    // Use agent-based parser when OCR is configured (accounts in context for better matching)
    // Fall back to legacy parsers when OCR is not available
    console.log(
      `[bets/autoparse] Using ${useOcr ? (hasAccounts ? "Agent + OCR" : "OCR + LLM") : "Vision LLM"} approach ` +
        `(${agentAccounts.length} accounts)`
    );

    let enrichedBack: ParsedBet;
    let enrichedLay: ParsedBet;
    let parsed: ParsedPair | AgentParsedPair;

    if (useOcr && hasAccounts) {
      // Use agent-based parser with account context
      const agentResult = await parseMatchedBetWithAgent({
        backImageUrl: backShot.url,
        layImageUrl: layShot.url,
        accounts: agentAccounts,
      });
      parsed = agentResult;
      enrichedBack = agentResult.back;
      enrichedLay = agentResult.lay;
      timer.mark(
        `aiParsing (Agent OCR: ${agentResult.ocrDurationMs}ms, LLM: ${agentResult.llmDurationMs}ms)`
      );
    } else if (useOcr) {
      // Use OCR + LLM without account context (no accounts to match)
      const ocrResult = await parseMatchedBetWithOcr({
        backImageUrl: backShot.url,
        layImageUrl: layShot.url,
      });
      parsed = ocrResult;
      // No accounts exist, so no matching needed
      enrichedBack = {
        ...ocrResult.back,
        accountId: null,
        unmatchedAccount: true,
      };
      enrichedLay = {
        ...ocrResult.lay,
        accountId: null,
        unmatchedAccount: true,
      };
      timer.mark(
        `aiParsing (OCR: ${ocrResult.ocrDurationMs}ms, LLM: ${ocrResult.llmDurationMs}ms)`
      );
    } else {
      // Fall back to vision LLM (no OCR configured)
      parsed = await parseMatchedBetFromScreenshots({
        backImageUrl: backShot.url,
        layImageUrl: layShot.url,
      });
      timer.mark("aiParsing");

      // Match parsed exchange/bookmaker names against user's existing accounts
      const [backAccountId, layAccountId] = await Promise.all([
        matchAccountForBet({
          userId: session.user.id,
          exchangeName: parsed.back.exchange,
          kind: "bookmaker",
        }),
        matchAccountForBet({
          userId: session.user.id,
          exchangeName: parsed.lay.exchange,
          kind: "exchange",
        }),
      ]);
      timer.mark("accountMatching");

      // Enrich bets with account matching results
      enrichedBack = enrichBetWithAccountMatch(parsed.back, backAccountId);
      enrichedLay = enrichBetWithAccountMatch(parsed.lay, layAccountId);
    }

    // Attempt to link the bet to a football match from synced matches
    // Uses team names from market/selection to find candidates
    let matchLinkResult: MatchLinkResult = {
      matchId: null,
      matchConfidence: null,
      matchCandidates: 0,
      normalizedSelection: null,
    };

    try {
      matchLinkResult = await linkBetToMatch({
        market: parsed.back.market,
        selection: parsed.back.selection,
        betDate: parsed.back.placedAt ?? null,
      });
      timer.mark("matchLinking");

      if (matchLinkResult.matchId) {
        console.log(
          `[bets/autoparse] Linked to match ${matchLinkResult.matchId} ` +
            `(confidence: ${matchLinkResult.matchConfidence}, candidates: ${matchLinkResult.matchCandidates})`
        );
      } else if (matchLinkResult.matchCandidates > 0) {
        console.log(
          `[bets/autoparse] ${matchLinkResult.matchCandidates} candidate matches found but no confident link`
        );
      }
    } catch (error) {
      console.warn("[bets/autoparse] Match linking failed (non-fatal):", error);
      timer.mark("matchLinking (failed)");
    }

    // Flag for review if any account is unmatched (user may need to create accounts)
    const hasUnmatchedAccounts =
      enrichedBack.unmatchedAccount || enrichedLay.unmatchedAccount;

    const matchConfidenceLow = matchLinkResult.matchConfidence === "low";
    const matchNeedsReview =
      matchConfidenceLow ||
      (matchLinkResult.matchCandidates > 0 && !matchLinkResult.matchId);

    const { needsReview } = evaluateNeedsReview({
      explicitFlag:
        parsed.needsReview || hasUnmatchedAccounts || matchNeedsReview,
      backConfidence: parsed.back.confidence,
      layConfidence: parsed.lay.confidence,
    });

    const status = needsReview ? "needs_review" : "parsed";

    // Build notes for unmatched accounts
    const unmatchedNotes: string[] = [];
    if (enrichedBack.unmatchedAccount) {
      unmatchedNotes.push(
        `Bookmaker "${parsed.back.exchange}" not found in your accounts. Consider creating it.`
      );
    }
    if (enrichedLay.unmatchedAccount) {
      unmatchedNotes.push(
        `Exchange "${parsed.lay.exchange}" not found in your accounts. Consider creating it.`
      );
    }

    const matchNotes: string[] = [];
    if (matchLinkResult.matchCandidates > 0 && !matchLinkResult.matchId) {
      matchNotes.push(
        `Found ${matchLinkResult.matchCandidates} candidate matches but none were linked.`
      );
    } else if (matchLinkResult.matchId && matchConfidenceLow) {
      matchNotes.push("Match link confidence is low. Please verify the match.");
    }

    const notes =
      unmatchedNotes.length > 0 || matchNotes.length > 0
        ? [parsed.notes, ...unmatchedNotes, ...matchNotes]
            .filter(Boolean)
            .join("\n")
        : parsed.notes;

    await Promise.all([
      updateScreenshotStatus({
        id: backShot.id,
        status,
        parsedOutput: enrichedBack,
        confidence: enrichedBack.confidence ?? null,
        error: null,
      }),
      updateScreenshotStatus({
        id: layShot.id,
        status,
        parsedOutput: enrichedLay,
        confidence: enrichedLay.confidence ?? null,
        error: null,
      }),
    ]);
    timer.mark("updateStatus");
    timer.log("bets/autoparse");

    return NextResponse.json({
      back: enrichedBack,
      lay: enrichedLay,
      needsReview,
      notes,
      // Match linking results
      matchId: matchLinkResult.matchId,
      matchConfidence: matchLinkResult.matchConfidence,
      matchCandidates: matchLinkResult.matchCandidates,
      normalizedSelection: matchLinkResult.normalizedSelection,
    });
  } catch (error) {
    console.error("Failed to parse bets", error);
    const errorMessage =
      error instanceof Error ? error.message : "Failed to parse bets";

    await Promise.all([
      updateScreenshotStatus({
        id: backShot.id,
        status: "error",
        error: errorMessage,
        parsedOutput: null,
        confidence: null,
      }),
      updateScreenshotStatus({
        id: layShot.id,
        status: "error",
        error: errorMessage,
        parsedOutput: null,
        confidence: null,
      }),
    ]);

    return NextResponse.json(
      { error: errorMessage, needsReview: true },
      { status: 500 }
    );
  }
}

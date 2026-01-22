import { Buffer } from "node:buffer";
import { put } from "@vercel/blob";
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  createAuditEntry,
  createMatchedBetRecord,
  getOrCreateAccount,
  listAccountsByUser,
  saveBackBet,
  saveLayBet,
  saveScreenshotUpload,
  validateShortcutApiKey,
} from "@/lib/db/queries";
import { computeNetExposureInputs } from "@/lib/bet-calculations";
import { convertAmountToNok } from "@/lib/fx-rates";
import { isTestEnvironment } from "@/lib/constants";
import {
  parseMatchedBetWithAgent,
  type AgentAccount,
} from "@/lib/bet-parser-agent";
import {
  isOcrConfigured,
  parseMatchedBetWithOcr,
  parseMatchedBetFromScreenshots,
} from "@/lib/bet-parser";
import { linkBetToMatch } from "@/lib/match-linking";
import { evaluateNeedsReview, formatNeedsReviewNote } from "@/lib/bet-review";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB per spec
const ALLOWED_TYPES = ["image/jpeg", "image/png"];

/**
 * Error codes for iOS Shortcut API responses.
 * See specs/ios-shortcut-api.md for full documentation.
 */
const ErrorCodes = {
  MISSING_IMAGES: "MISSING_IMAGES",
  INVALID_IMAGE_TYPE: "INVALID_IMAGE_TYPE",
  IMAGE_TOO_LARGE: "IMAGE_TOO_LARGE",
  INVALID_API_KEY: "INVALID_API_KEY",
  RATE_LIMITED: "RATE_LIMITED",
  PARSE_FAILED: "PARSE_FAILED",
  INTERNAL_ERROR: "INTERNAL_ERROR",
} as const;

function errorResponse(
  code: keyof typeof ErrorCodes,
  message: string,
  status: number,
  retryAfter?: number
) {
  const headers: Record<string, string> = {};
  if (retryAfter) {
    headers["Retry-After"] = retryAfter.toString();
  }
  return NextResponse.json(
    { success: false, error: code, message },
    { status, headers }
  );
}

/**
 * Extract Bearer token from Authorization header.
 */
function extractBearerToken(request: Request): string | null {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return null;
  }
  return authHeader.slice(7);
}

/**
 * Validate a file from FormData.
 */
function validateFile(file: unknown): {
  valid: true;
  file: File;
} | {
  valid: false;
  error: keyof typeof ErrorCodes;
  message: string;
} {
  if (!(file instanceof File)) {
    return {
      valid: false,
      error: "MISSING_IMAGES",
      message: "File must be provided",
    };
  }

  if (!ALLOWED_TYPES.includes(file.type)) {
    return {
      valid: false,
      error: "INVALID_IMAGE_TYPE",
      message: `Image must be PNG or JPEG, got ${file.type}`,
    };
  }

  if (file.size > MAX_FILE_SIZE) {
    return {
      valid: false,
      error: "IMAGE_TOO_LARGE",
      message: `Image exceeds 10MB limit (${Math.round(file.size / 1024 / 1024)}MB)`,
    };
  }

  return { valid: true, file };
}

/**
 * Upload a file to blob storage and return the URL.
 */
async function uploadFile(file: File, userId: string): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();

  if (isTestEnvironment) {
    const base64 = Buffer.from(arrayBuffer).toString("base64");
    const encodedName = encodeURIComponent(file.name);
    return `data:${file.type};name=${encodedName};base64,${base64}`;
  }

  const key = `${userId}/${Date.now()}-${file.name}`;
  const result = await put(key, arrayBuffer, {
    access: "public",
    contentType: file.type,
  });
  return result.url;
}

function safeDate(value?: string | null) {
  if (!value) {
    return null;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * POST /api/bets/shortcut
 * 
 * Single-request endpoint for iOS Shortcuts to submit matched bets.
 * Chains: upload → parse → link → save in one atomic operation.
 * 
 * Auth: Bearer token (per-user API key)
 * Body: FormData with `back` and `lay` image files, optional `promoType` and `notes`
 * 
 * See specs/ios-shortcut-api.md for full documentation.
 */
export async function POST(request: Request) {
  // 1. Extract and validate API key
  const apiKey = extractBearerToken(request);
  if (!apiKey) {
    return errorResponse(
      "INVALID_API_KEY",
      "Authorization header with Bearer token is required",
      401
    );
  }

  const keyValidation = await validateShortcutApiKey(apiKey);
  if (!keyValidation.valid) {
    if (keyValidation.error === "rate_limited") {
      return errorResponse(
        "RATE_LIMITED",
        "Too many requests. Please wait before submitting again.",
        429,
        keyValidation.retryAfter
      );
    }
    return errorResponse(
      "INVALID_API_KEY",
      "The provided API key is invalid or has been revoked",
      401
    );
  }

  const userId = keyValidation.userId;

  // 2. Parse and validate FormData
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return errorResponse(
      "MISSING_IMAGES",
      "Request must be multipart/form-data with image files",
      400
    );
  }

  const backFile = formData.get("back");
  const layFile = formData.get("lay");
  const promoType = formData.get("promoType");
  const notes = formData.get("notes");

  // Validate both files
  const backValidation = validateFile(backFile);
  if (!backValidation.valid) {
    return errorResponse(backValidation.error, backValidation.message, 400);
  }

  const layValidation = validateFile(layFile);
  if (!layValidation.valid) {
    return errorResponse(layValidation.error, layValidation.message, 400);
  }

  try {
    // 3. Upload images to blob storage
    const [backUrl, layUrl] = await Promise.all([
      uploadFile(backValidation.file, userId),
      uploadFile(layValidation.file, userId),
    ]);

    // 4. Save screenshot records
    const [backShot, layShot] = await Promise.all([
      saveScreenshotUpload({
        userId,
        kind: "back",
        url: backUrl,
        filename: backValidation.file.name,
        contentType: backValidation.file.type,
        size: backValidation.file.size,
      }),
      saveScreenshotUpload({
        userId,
        kind: "lay",
        url: layUrl,
        filename: layValidation.file.name,
        contentType: layValidation.file.type,
        size: layValidation.file.size,
      }),
    ]);

    // 5. Fetch user accounts for context-aware parsing
    const userAccounts = await listAccountsByUser({ userId });
    const agentAccounts: AgentAccount[] = userAccounts.map((a) => ({
      id: a.id,
      name: a.name,
      kind: a.kind as "bookmaker" | "exchange",
      currency: a.currency,
    }));

    // 6. Parse the screenshots with AI
    const useOcr = isOcrConfigured();
    const hasAccounts = agentAccounts.length > 0;

    let parsed;
    if (useOcr && hasAccounts) {
      parsed = await parseMatchedBetWithAgent({
        backImageUrl: backUrl,
        layImageUrl: layUrl,
        accounts: agentAccounts,
      });
    } else if (useOcr) {
      parsed = await parseMatchedBetWithOcr({
        backImageUrl: backUrl,
        layImageUrl: layUrl,
      });
    } else {
      parsed = await parseMatchedBetFromScreenshots({
        backImageUrl: backUrl,
        layImageUrl: layUrl,
      });
    }

    // 7. Attempt match linking
    let matchId: string | null = null;
    let matchConfidence: string | null = null;
    let matchCandidates = 0;
    let normalizedSelection: "HOME_TEAM" | "AWAY_TEAM" | "DRAW" | null = null;
    let linkedMatch: {
      id: string;
      homeTeam: string;
      awayTeam: string;
      matchDate: string;
      competition: string;
    } | null = null;

    try {
      const matchResult = await linkBetToMatch({
        market: parsed.back.market,
        selection: parsed.back.selection,
        betDate: parsed.back.placedAt ?? null,
      });

      matchId = matchResult.matchId;
      matchConfidence = matchResult.matchConfidence;
      matchCandidates = matchResult.matchCandidates;
      normalizedSelection = matchResult.normalizedSelection ?? null;

      if (matchResult.matchId && matchResult.linkedMatch) {
        linkedMatch = {
          id: matchResult.matchId,
          homeTeam: matchResult.linkedMatch.homeTeam,
          awayTeam: matchResult.linkedMatch.awayTeam,
          matchDate: matchResult.linkedMatch.matchDate?.toISOString() ?? "",
          competition: matchResult.linkedMatch.competition ?? "",
        };
      }
    } catch (error) {
      console.warn("[shortcut] Match linking failed (non-fatal):", error);
    }

    // 8. Determine if review is needed
    const hasUnmatchedAccounts =
      !parsed.back.accountId || !parsed.lay.accountId;
    const matchNeedsReview =
      matchConfidence === "low" ||
      (matchCandidates > 0 && !matchId);

    const reviewInfo = evaluateNeedsReview({
      explicitFlag:
        parsed.needsReview || hasUnmatchedAccounts || matchNeedsReview,
      backConfidence: parsed.back.confidence,
      layConfidence: parsed.lay.confidence,
    });

    const needsReview = reviewInfo.needsReview;
    const status = needsReview ? "needs_review" : "matched";

    // Build review reasons for response
    const reviewReasons: string[] = [];
    if (reviewInfo.lowConfidence && reviewInfo.lowConfidence.length > 0) {
      for (const item of reviewInfo.lowConfidence) {
        reviewReasons.push(`Low confidence in ${item.leg}.${item.field} extraction (${item.score.toFixed(2)})`);
      }
    }
    if (!parsed.back.accountId) {
      reviewReasons.push(
        `Bookmaker "${parsed.back.exchange}" not found in your accounts`
      );
    }
    if (!parsed.lay.accountId) {
      reviewReasons.push(
        `Exchange "${parsed.lay.exchange}" not found in your accounts`
      );
    }
    if (matchNeedsReview && matchCandidates > 0 && !matchId) {
      reviewReasons.push(
        `Found ${matchCandidates} candidate matches but none were linked`
      );
    }

    // 9. Resolve or create accounts
    const backExchange = parsed.back.exchange?.trim() || "Unknown";
    const layExchange = parsed.lay.exchange?.trim() || "bfb247";
    const backCurrency = parsed.back.currency?.toUpperCase() ?? "NOK";
    const layCurrency = parsed.lay.currency?.toUpperCase() ?? "NOK";

    const [backAccount, layAccount] = await Promise.all([
      parsed.back.accountId
        ? Promise.resolve({ id: parsed.back.accountId })
        : getOrCreateAccount({
            userId,
            name: backExchange,
            kind: "bookmaker",
            currency: backCurrency,
          }),
      parsed.lay.accountId
        ? Promise.resolve({ id: parsed.lay.accountId })
        : getOrCreateAccount({
            userId,
            name: layExchange,
            kind: "exchange",
            currency: layCurrency,
          }),
    ]);

    // 10. Save bets
    const backBet = await saveBackBet({
      userId,
      screenshotId: backShot.id,
      market: parsed.back.market,
      selection: parsed.back.selection,
      normalizedSelection,
      odds: parsed.back.odds,
      stake: parsed.back.stake,
      exchange: backExchange,
      matchId,
      accountId: backAccount.id,
      currency: backCurrency,
      placedAt: safeDate(parsed.back.placedAt),
      settledAt: null,
      profitLoss: null,
      confidence: parsed.back.confidence ?? null,
      status,
    });

    const layBet = await saveLayBet({
      userId,
      screenshotId: layShot.id,
      market: parsed.lay.market,
      selection: parsed.lay.selection,
      normalizedSelection,
      odds: parsed.lay.odds,
      stake: parsed.lay.stake,
      exchange: layExchange,
      matchId,
      accountId: layAccount.id,
      currency: layCurrency,
      placedAt: safeDate(parsed.lay.placedAt),
      settledAt: null,
      profitLoss: null,
      confidence: parsed.lay.confidence ?? null,
      status,
    });

    // 11. Calculate net exposure
    const { backProfit, layLiability } = computeNetExposureInputs({
      backStake: parsed.back.stake,
      backOdds: parsed.back.odds,
      layStake: parsed.lay.stake,
      layOdds: parsed.lay.odds,
      layLiabilityProvided: parsed.lay.liability,
    });

    const [backProfitNok, layLiabilityNok] = await Promise.all([
      convertAmountToNok(backProfit, backCurrency),
      convertAmountToNok(layLiability, layCurrency),
    ]);

    const netExposure = layLiabilityNok - backProfitNok;

    // 12. Create matched bet record
    const promoTypeValue =
      typeof promoType === "string" && promoType.trim()
        ? promoType.trim()
        : "None";
    const notesValue =
      typeof notes === "string" && notes.trim() ? notes.trim() : null;

    const auditNote = formatNeedsReviewNote(reviewInfo);
    const mergedNotes = [notesValue, auditNote].filter(Boolean).join("\n\n");

    const matchedBet = await createMatchedBetRecord({
      userId,
      backBetId: backBet.id,
      layBetId: layBet.id,
      matchId,
      market: parsed.back.market,
      selection: parsed.back.selection,
      normalizedSelection,
      promoId: null,
      promoType: promoTypeValue,
      status,
      netExposure: Math.round(netExposure * 100) / 100,
      notes: mergedNotes || null,
    });

    // 13. Create audit entries
    await Promise.allSettled([
      createAuditEntry({
        userId,
        entityType: "back_bet",
        entityId: backBet.id,
        action: "create",
        changes: {
          market: parsed.back.market,
          selection: parsed.back.selection,
          odds: parsed.back.odds,
          stake: parsed.back.stake,
          source: "shortcut",
        },
        notes: null,
      }),
      createAuditEntry({
        userId,
        entityType: "lay_bet",
        entityId: layBet.id,
        action: "create",
        changes: {
          market: parsed.lay.market,
          selection: parsed.lay.selection,
          odds: parsed.lay.odds,
          stake: parsed.lay.stake,
          source: "shortcut",
        },
        notes: null,
      }),
      createAuditEntry({
        userId,
        entityType: "matched_bet",
        entityId: matchedBet.id,
        action: "create",
        changes: {
          market: parsed.back.market,
          selection: parsed.back.selection,
          status,
          source: "shortcut",
          netExposure,
        },
        notes: mergedNotes || null,
      }),
    ]);

    // 14. Return success response
    return NextResponse.json({
      success: true,
      matchedBetId: matchedBet.id,
      status,
      market: parsed.back.market,
      selection: parsed.back.selection,
      back: {
        bookmaker: backExchange,
        odds: parsed.back.odds,
        stake: parsed.back.stake,
        currency: backCurrency,
      },
      lay: {
        exchange: layExchange,
        odds: parsed.lay.odds,
        stake: parsed.lay.stake,
        liability: layLiability,
        currency: layCurrency,
      },
      netExposure: Math.round(netExposure * 100) / 100,
      linkedMatch,
      needsReview,
      reviewReasons: reviewReasons.length > 0 ? reviewReasons : undefined,
      notes: notesValue,
    });
  } catch (error) {
    console.error("[shortcut] Failed to process bet:", error);
    const message =
      error instanceof Error ? error.message : "Failed to process bet";
    return errorResponse("PARSE_FAILED", message, 500);
  }
}

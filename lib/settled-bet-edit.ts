export type SettlementOutcome = "won" | "lost" | "push";

/**
 * Comma-separated list of user IDs allowed to edit settled bets.
 * Special value "*" allows every authenticated user.
 */
const SETTLED_EDIT_ALLOWLIST_ENV = "SETTLED_BET_EDIT_USER_IDS";
/**
 * Optional comma-separated list of user emails allowed to edit settled bets.
 * Special value "*" allows every authenticated user.
 */
const SETTLED_EDIT_EMAIL_ALLOWLIST_ENV = "SETTLED_BET_EDIT_USER_EMAILS";

function parseCsvAllowlist(raw: string | undefined) {
  return (raw ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

function getSettledEditAllowlist() {
  const idEntries = parseCsvAllowlist(process.env[SETTLED_EDIT_ALLOWLIST_ENV]);
  const emailEntries = parseCsvAllowlist(
    process.env[SETTLED_EDIT_EMAIL_ALLOWLIST_ENV]
  );

  // Backward-compatible convenience: treat email-like entries in the ID
  // allowlist as email entries.
  const legacyEmailEntries = idEntries.filter((entry) => entry.includes("@"));
  const userIdEntries = idEntries.filter((entry) => !entry.includes("@"));

  const normalizedEmailEntries = [...emailEntries, ...legacyEmailEntries].map(
    (entry) => entry.toLowerCase()
  );
  const allowAll =
    userIdEntries.includes("*") || normalizedEmailEntries.includes("*");

  return {
    allowAll,
    isConfigured: userIdEntries.length > 0 || normalizedEmailEntries.length > 0,
    userIds: new Set(userIdEntries.filter((entry) => entry !== "*")),
    emails: new Set(normalizedEmailEntries.filter((entry) => entry !== "*")),
  };
}

export function canUserEditSettledBets(
  user:
    | { userId?: string | null | undefined; email?: string | null | undefined }
    | string
    | null
    | undefined
) {
  const userId = typeof user === "string" || user == null ? user : user.userId;
  const email =
    typeof user === "string" || user == null ? null : (user.email ?? null);

  if (!userId) {
    return false;
  }

  const { allowAll, isConfigured, userIds, emails } = getSettledEditAllowlist();

  if (!isConfigured) {
    // Default: owners can edit their own settled bets unless a restrictive
    // allowlist is explicitly configured.
    return true;
  }

  if (allowAll || userIds.has(userId)) {
    return true;
  }

  if (!email) {
    return false;
  }

  return emails.has(email.toLowerCase());
}

export function deriveSettlementOutcomeFromProfitLoss({
  kind,
  profitLoss,
}: {
  kind: "back" | "lay";
  profitLoss: number | null | undefined;
}): SettlementOutcome | null {
  if (profitLoss === null || profitLoss === undefined) {
    return null;
  }

  if (profitLoss === 0) {
    return "push";
  }

  if (kind === "back") {
    return profitLoss > 0 ? "won" : "lost";
  }

  return profitLoss > 0 ? "won" : "lost";
}

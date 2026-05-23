# Gmail Promotion Intake Specification

## Decision

Use a first-party Gmail API integration for production ingestion, then use the
AI SDK/OpenAI model layer to classify and extract promotion terms into the
tracker's own database.

OpenAI's hosted Gmail connector is useful for ad hoc agent access and validates
that Gmail can be exposed as a tool, but it is not the right persistence layer
for this app. The tracker needs durable user consent, deduplication by Gmail
message ID, an audit trail, account linking, background sync, and a review page
inside the product. Those are application responsibilities.

## Current Implementation Slice

- Users connect Gmail from `/bets/promo-inbox`.
- The app requests Gmail read access through Google OAuth.
- Access and refresh tokens are stored encrypted in `GmailConnection`.
- Manual sync calls Gmail search/read APIs for recent promotion-like emails.
- Each new Gmail message is parsed with structured AI output.
- Parsed offers are stored in `EmailPromoCandidate`.
- The promo inbox summarizes interesting and needs-review candidates.
- Candidates can link to existing bookmaker accounts when the parser matches a
  known account confidently.

## Google/Gmail Requirements

### OAuth scopes

Start with:

```text
openid
email
profile
https://www.googleapis.com/auth/gmail.readonly
```

`gmail.readonly` is sufficient for message search/read. If we later want the app
to label processed messages, archive messages, or mark messages as read, move to
`gmail.modify`; that raises verification and user-trust cost.

### Environment variables

```text
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
GMAIL_REDIRECT_URI
GMAIL_TOKEN_ENCRYPTION_KEY
```

`GMAIL_TOKEN_ENCRYPTION_KEY` must decode to 32 bytes. A hex-encoded key can be
generated with:

```bash
openssl rand -hex 32
```

If `GMAIL_REDIRECT_URI` is absent, the app derives
`/api/bets/gmail/callback` from the request URL.

### Verification impact

Reading Gmail content is sensitive user data. If this ships beyond test users,
the Google OAuth consent screen, privacy policy, data retention policy, and
possibly Google's restricted/sensitive scope review must be handled before broad
production use.

## Data Model

### GmailConnection

One row per tracker user:

- Gmail address and connection status
- encrypted access token
- encrypted refresh token
- token expiry
- last sync/error state
- Gmail history/watch state for future push sync

### EmailPromoCandidate

One row per Gmail message candidate:

- Gmail message/thread ID
- sender, subject, snippet, received time
- hash of parsed body for audit/dedupe
- linked `Account` when confident
- promo kind
- AI title and summary
- extracted terms, min odds, max stake, expiry, currency
- confidence and review status

Statuses:

- `interesting`: likely actionable
- `needs_review`: low confidence or unmatched account
- `ignored`: scanned but not useful
- `converted`: user accepted it into a FreeBet/DepositBonus record

## Sync Flow

1. User clicks **Connect Gmail**.
2. Google redirects back to `/api/bets/gmail/callback`.
3. The app exchanges the code for tokens, fetches Gmail profile, encrypts
   tokens, and stores `GmailConnection`.
4. User clicks **Sync Gmail**.
5. `/api/bets/gmail/sync` searches recent emails with a conservative promotion
   query.
6. Already-seen Gmail message IDs are skipped.
7. New messages are fetched, plaintext is extracted, and the model parses:
   - whether the email is interesting
   - promotion kind
   - account match
   - summary and terms
   - expiry, min odds, max stake, currency
8. Candidates appear on `/bets/promo-inbox`.

## AI Extraction Contract

The parser must return structured output matching:

```typescript
{
  interesting: boolean;
  promoKind:
    | "free_bet"
    | "deposit_bonus"
    | "odds_boost"
    | "refund"
    | "cashback"
    | "enhanced_odds"
    | "other";
  title: string;
  summary: string;
  accountNameGuess: string | null;
  accountId: string | null;
  confidence: number;
  expiresAt: string | null;
  minOdds: number | null;
  maxStake: number | null;
  currency: string | null;
  terms: {
    offer: string | null;
    qualifyingActions: string[];
    restrictions: string[];
    wageringRequirement: string | null;
    sourceTerms: string | null;
  };
  needsReviewReason: string | null;
}
```

Only pass bookmaker accounts to the parser. Exchange accounts should not be
linked to bookmaker-originated promotions.

## OpenAI Connector Fit

OpenAI's Gmail connector can search and read Gmail through model tools when the
end user authorizes it. That is valuable for a ChatGPT workspace agent or an
interactive assistant asking a one-off question like "find my latest promo
email." For this tracker, the app still needs its own Gmail OAuth connection
because:

- sync must run when the user is not chatting
- parsed results must be stored in first-party tables
- candidates need review/conversion workflow
- auditability matters for financial tracking
- account linking depends on local app data

Use OpenAI connectors later only for an optional interactive agent surface that
can answer questions over already-authorized email. Do not make the hosted
connector the source of truth for ingestion.

## Future Phases

### Phase 2: Convert candidates to promo records

Add actions on `EmailPromoCandidate`:

- create `FreeBet`
- create `DepositBonus`
- link to an existing promo
- ignore
- edit extracted terms before conversion

### Phase 3: Push notifications

Use Gmail `users.watch` with Google Pub/Sub:

- store `historyId`
- receive Pub/Sub notifications
- call Gmail history APIs to fetch changed messages
- renew watch before expiration

Manual sync should remain as a fallback and debugging tool.

### Phase 4: Safer search and source controls

- User-editable allowed senders/domains per account
- Per-account keywords
- Scan window controls
- Ignore-list for noisy senders

### Phase 5: Notifications

Notify users when:

- a high-confidence free bet or deposit bonus appears
- a promo expires soon
- an account cannot be matched
- Gmail sync fails

## Security Notes

- Never send OAuth tokens to the browser.
- Encrypt tokens at rest.
- Store only extracted email text needed for audit; avoid full raw email bodies.
- Keep the Gmail query narrow to bookmaker/promotion terms.
- Allow disconnect at any time.
- Treat model output as a draft until the user converts it into a tracked promo.

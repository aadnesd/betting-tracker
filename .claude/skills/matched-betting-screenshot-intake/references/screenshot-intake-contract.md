# Screenshot Intake Contract

## Endpoint Sequence

Upload screenshots:

```http
POST /api/bets/screenshots
Content-Type: multipart/form-data
```

Fields:

- `back`: bookmaker screenshot image.
- `lay`: exchange screenshot image.

Parse screenshots:

```http
POST /api/bets/autoparse
Content-Type: application/json
```

```json
{
  "backScreenshotId": "uploaded-back-id",
  "layScreenshotId": "uploaded-lay-id"
}
```

Save matched set:

```http
POST /api/bets/create-matched
Content-Type: application/json
```

The save payload includes screenshot IDs, reviewed `market`, `selection`, optional match link fields, `needsReview`, notes, and parsed `back` and `lay` bet objects.

## Expected Parse Output

Autoparse returns:

- `back`: parsed bookmaker leg.
- `lay`: parsed exchange leg.
- `needsReview`: true when confidence or match/account linking requires review.
- `notes`: optional parser notes.
- `matchId`: nullable linked football match UUID.
- `matchConfidence`: `high`, `medium`, `low`, or null.
- `matchCandidates`: optional count of candidate matches.

Parsed bet fields include market, selection, odds, stake, exchange/account name, currency, placed date, confidence, and optional account ID.

## Status Expectations

- Clear complete pair -> matched set status `matched`.
- Low confidence or user-flagged review -> status `needs_review`.
- Missing back or lay leg -> status `draft`.
- Non-betting or invalid image -> screenshot or parse status `error`.

## Test Fixtures

Use deterministic local fixtures when testing:

- `tests/test-images/bet2.png`
- `tests/test-images/bet3.png`
- `tests/test-images/cat.png` for invalid/non-betting image behavior.

## Source References

- `specs/ai-autoparse.md`
- `specs/clipboard-paste-intake.md`
- `components/bets/screenshot-intake-form.tsx`
- `components/bets/bet-ingest-form.tsx`
- `app/(chat)/api/bets/screenshots/route.ts`
- `app/(chat)/api/bets/autoparse/route.ts`
- `app/(chat)/api/bets/create-matched/route.ts`
- `tests/routes/bets.test.ts`
- `tests/unit/bets-api.test.ts`

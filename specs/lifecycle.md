# Lifecycle & Reconciliation Spec

## State Machine
- Draft → Placed → Matched → Settled
- Needs_review can apply at any stage

## Auto-Settlement

When a matched bet is linked to a football match (via `matchId`), the system can automatically settle the bet once the match finishes.

### Trigger
Auto-settlement runs after the daily match sync cron (`/api/cron/sync-matches`) completes syncing finished matches.

### Criteria for Auto-Settlement
A bet is eligible when:
1. Status is `matched` (not draft, settled, or needs_review)
2. Has a linked `matchId`
3. The linked match has status `FINISHED`
4. Match has valid scores (`homeScore` and `awayScore` not null)

### Settlement Flow
1. **Detect** - Query `findBetsReadyForAutoSettlement()` to get eligible bets
2. **Resolve Outcome** - For each bet, call `resolveOutcome(market, selection, matchResult)` to determine win/loss/push
3. **Calculate P&L** - Call `calculateMatchedBetProfitLoss()` with back/lay odds, stakes, and free bet flag
4. **Apply Settlement** - Update matched bet and leg statuses to `settled`, set `profitLoss` on each leg, set `settledAt` timestamps
5. **Update Balances** - Create adjustment transactions for accounts (same as manual settlement)
6. **Audit** - Create audit entries with action `auto_settle_applied`

### Confidence Handling
- **High confidence outcomes** (clear win/loss/push) → Auto-settle immediately
- **Low/unknown confidence** (unrecognized market type, ambiguous selection) → Flag as `needs_review` with note explaining why

### API Endpoint
`POST /api/cron/auto-settle` - Protected by `CRON_SECRET`, runs after match sync or on its own schedule.

Returns:
```json
{
  "processed": 5,
  "settled": 4,
  "flaggedForReview": 1,
  "errors": 0
}
```

## Reconciliation
- Detect missing lay/back, odds drift, partial match, currency mismatch.
- Provide a reconciliation queue with actions:
  - edit bet
  - attach missing leg
  - mark resolved

## Audit
- Keep a timeline of changes and notes.

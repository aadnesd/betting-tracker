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

## Manual Settlement

For bets that cannot be auto-settled (non-football markets, unlinked bets, or when user wants manual control):

### Individual Bets View
- List all back and lay bets separately (not grouped as matched sets)
- One bet per row showing: type, account, market, selection, odds, stake, status, date
- Sortable by date, filterable by status/account
- Quick settlement actions available inline

### Settlement Options
Users can manually settle any bet with one of three outcomes:

1. **Won**
   - Back bet: Profit = stake × (odds - 1)
   - Lay bet: Profit = stake
   - Creates adjustment transaction crediting account

2. **Lost**
   - Back bet: Loss = -stake
   - Lay bet: Loss = -stake × (odds - 1)
   - Creates adjustment transaction debiting account

3. **Push** (void/refund)
   - Back bet: Profit = 0 (stake returned)
   - Lay bet: Profit = 0 (stake returned)
   - No account transaction needed

### Settlement Flow
1. User selects outcome from dropdown (Won/Lost/Push)
2. System calculates P&L based on bet type and odds
3. Preview shows calculated impact on account balance
4. Confirmation updates:
   - Bet status → 'settled'
   - Sets profitLoss and settledAt
   - Creates account adjustment transaction
   - Updates profit analytics
   - Creates audit entry with action 'manual_settle'

### Standalone Bets
Users can create individual bets without a matched pair:
- Used for free bets, value bets, or first half of a match before laying
- Saved with status 'placed', not linked to matched set
- Can be settled independently
- Can later be linked to a matched set if user adds corresponding hedge

### Delete Functionality
- Individual bets can be deleted from detail page
- If bet is part of matched set: offer cascade options
  - Delete entire matched set
  - Just unlink this bet (set becomes draft)
- Reverses settlement transactions if bet was settled
- Creates audit entry

## Reconciliation
- Detect missing lay/back, odds drift, partial match, currency mismatch.
- Provide a reconciliation queue with actions:
  - edit bet
  - attach missing leg
  - mark resolved

## Audit
- Keep a timeline of changes and notes.

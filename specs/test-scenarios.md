# Test Scenarios — Matched Betting Tracker

Test images are in `tests/test-images/` (e.g., `bet2.png`, `bet3.png`).

## AI Autoparse

### Happy Path
- GIVEN a clear betting screenshot (e.g., `bet2.png`)
- WHEN parsed via `/api/bets/autoparse`
- THEN all fields extracted with confidence > 0.8
- AND status = "parsed"

### Low Confidence
- GIVEN a blurry or partial screenshot
- WHEN parsed
- THEN status = "needs_review"
- AND confidence < 0.7 for affected fields
- AND UI highlights low-confidence fields in yellow

### Parse Failure
- GIVEN a non-betting image (e.g., a photo of a cat)
- WHEN parsed
- THEN status = "error"
- AND error message explains failure

## Screenshot Upload

### Valid Upload
- GIVEN a PNG/JPEG under 10MB
- WHEN uploaded via `/api/bets/screenshots`
- THEN screenshot saved with status = "uploaded"
- AND returns screenshot ID

### Invalid Upload
- GIVEN a file over 10MB or wrong type
- WHEN upload attempted
- THEN returns 400 with validation error

## Matched Set Creation

### Complete Pair
- GIVEN parsed back bet + parsed lay bet
- WHEN saved via `/api/bets/create-matched`
- THEN MatchedSet created with status = "matched"
- AND both bet IDs linked
- AND netExposure calculated correctly

### Missing Leg
- GIVEN only back bet (no lay)
- WHEN save attempted
- THEN MatchedSet created with status = "draft"
- AND appears in reconciliation queue

## Reconciliation

### Odds Drift
- GIVEN back odds 2.0, lay odds 2.5 (>10% drift)
- WHEN matched set reviewed
- THEN warning displayed
- AND action: "Confirm or edit odds"

### Currency Mismatch
- GIVEN back in GBP, lay in EUR
- WHEN matched set created
- THEN FX conversion applied
- AND base currency (NOK) exposure shown

## Bet Lifecycle

### Draft → Placed → Settled
- GIVEN a bet in draft status
- WHEN status updated to "placed"
- THEN placedAt timestamp set
- WHEN status updated to "settled"
- THEN settledAt timestamp set
- AND profit/loss calculated

### Needs Review Flag
- GIVEN any bet
- WHEN user flags for review
- THEN status = "needs_review"
- AND appears in reconciliation queue

## Reporting

### Weekly Summary
- GIVEN bets settled in current week
- WHEN weekly report viewed
- THEN shows total profit, ROI, qualifying loss
- AND breakdown by bookmaker

### Exposure Alert
- GIVEN net exposure > threshold (e.g., 5000 NOK)
- WHEN dashboard viewed
- THEN exposure warning displayed

## Import/Export

### CSV Import
- GIVEN valid CSV with bet data
- WHEN imported
- THEN bets created with status = "placed"
- AND row-level errors reported without failing whole import

### CSV Export
- GIVEN settled matched sets
- WHEN exported
- THEN CSV includes: matchedSetId, backBet, layBet, netProfit, settledAt

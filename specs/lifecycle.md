# Lifecycle & Reconciliation Spec

## State Machine
- Draft → Placed → Matched → Settled
- Needs_review can apply at any stage

## Reconciliation
- Detect missing lay/back, odds drift, partial match, currency mismatch.
- Provide a reconciliation queue with actions:
  - edit bet
  - attach missing leg
  - mark resolved

## Audit
- Keep a timeline of changes and notes.

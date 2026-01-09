# AI Autoparse Spec

## Flow
1. Upload back + lay screenshots.
2. Autoparse both images into structured bet parts.
3. Review screen for corrections.
4. Save matched set with back + lay legs.

## API Contracts (Existing)
- Upload: `app/(chat)/api/bets/screenshots/route.ts`
- Parse: `app/(chat)/api/bets/autoparse/route.ts`
- Save: `app/(chat)/api/bets/create-matched/route.ts`

## Requirements
- Persist confidence per field and highlight low confidence in UI.
- Allow manual override on any field.
- Support “needs review” status when low confidence or user flags.
- Save both legs plus matched set; include notes.
- Preserve screenshot metadata for audit trail.

## Fields
- market, selection, odds, stake, exchange, currency, placedAt
- confidence: map of field -> score

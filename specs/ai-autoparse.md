# AI Autoparse Spec

## Flow
1. Upload back + lay screenshots.
2. Autoparse both images into structured bet parts.
3. **Link to football match** (if applicable) for auto-settlement.
4. Review screen for corrections.
5. Save matched set with back + lay legs.

## API Contracts (Existing)
- Upload: `app/(chat)/api/bets/screenshots/route.ts`
- Parse: `app/(chat)/api/bets/autoparse/route.ts`
- Save: `app/(chat)/api/bets/create-matched/route.ts`

## Requirements
- Persist confidence per field and highlight low confidence in UI.
- Allow manual override on any field.
- Support "needs review" status when low confidence or user flags.
- Save both legs plus matched set; include notes.
- Preserve screenshot metadata for audit trail.
- **Link parsed bet to synced football match when possible.**

## Fields
- market, selection, odds, stake, exchange, currency, placedAt
- confidence: map of field -> score
- **matchId**: linked football match UUID (nullable)
- **accountId**: linked bookmaker/exchange account UUID (nullable)

---

## Automatic Football Match Linking

### Overview
After AI parsing extracts structured bet data, the system should automatically link the bet to a football match from the synced `FootballMatch` table. This enables:
- Display of live match status on bet detail page
- Auto-settlement when match completes (via P7 settlement logic)
- Historical match data for reporting

### Team Name Extraction
The AI parser extracts:
- **market**: Full match name (e.g., "Elche CF - Real Madrid", "Man Utd v Man City")
- **selection**: The picked outcome (e.g., "Real Madrid", "Man City", "Draw", "Over 2.5")

For Match Odds markets, the selection typically contains a team name that can be used for searching.

### Match Search Strategy
1. **Normalize team names**: Handle common abbreviations (Man Utd → Manchester United, Man City → Manchester City, etc.)
2. **Search synced matches**: Query `FootballMatch` table for upcoming/recent matches involving the normalized team name(s)
3. **Date context**: If bet screenshot contains a date, prefer matches on or near that date

### Match Selection Logic

#### Case 1: No matches found
- Set `matchId = null`
- No flag needed (match may be in an unsynced competition)

#### Case 2: Single match found
- Auto-link with high confidence
- Set `matchId` to the found match

#### Case 3: Multiple matches found (Ambiguity Resolution)
When multiple candidate matches are returned (e.g., searching "Man City" returns both "Man Utd vs Man City" and "Bodø/Glimt vs Man City"), use LLM to resolve:

**LLM Prompt Structure:**
```
Given this parsed bet:
- Market: "{market}" 
- Selection: "{selection}"
- Bet Date: "{placedAt or 'unknown'}"

And these candidate football matches:
1. {homeTeam} vs {awayTeam} ({competition}, {matchDate})
2. {homeTeam} vs {awayTeam} ({competition}, {matchDate})
...

Which match is this bet for? Return the match number (1, 2, etc.) or 0 if none match confidently.
Consider: team names in market should match the fixture, and bet date should be before match date.
```

**LLM Response Handling:**
- If LLM returns a match number → set `matchId` to that match
- If LLM returns 0 → set `matchId = null`, optionally add note for manual review
- If LLM fails → fall back to null, don't block parsing

### API Response Extension
The autoparse response should include:

```typescript
interface AutoparseResponse {
  back: ParsedBet;
  lay: ParsedBet;
  needsReview: boolean;
  notes: string | null;
  
  // New fields for match linking
  matchId: string | null;        // UUID of linked FootballMatch
  matchConfidence: 'high' | 'medium' | 'low' | null;
  matchCandidates?: number;      // How many candidates were found
}
```

### Performance Considerations
- Match search should use database indexes on team names
- LLM call for disambiguation adds ~2-3 seconds (use fast model like Gemini 2.0 Flash)
- Cache team name normalization mappings
- Total autoparse time budget: <15 seconds including OCR + LLM parse + match link

### Edge Cases
- **Non-football bets**: Skip match linking for non-football markets (detect via market type or competition patterns)
- **In-play bets**: Match should already be TIMED or IN_PLAY status
- **Postponed/cancelled matches**: Still link if team names match; settlement will handle status
- **Cup competitions**: Same teams may play multiple times (league + cup); use date proximity

### Team Name Normalization Dictionary
Common abbreviations to handle:
```
Man Utd, Man United → Manchester United
Man City → Manchester City  
Spurs → Tottenham Hotspur
Arsenal → Arsenal FC
Chelsea → Chelsea FC
Liverpool → Liverpool FC
Newcastle → Newcastle United
West Ham → West Ham United
Wolves → Wolverhampton Wanderers
Brighton → Brighton & Hove Albion
Villa → Aston Villa
Palace → Crystal Palace
Forest → Nottingham Forest
Bournemouth → AFC Bournemouth
Fulham → Fulham FC
Brentford → Brentford FC
Everton → Everton FC
Leeds → Leeds United
Leicester → Leicester City
Southampton → Southampton FC
```

### Implementation Phases
1. **Phase 1**: Basic team name search, auto-link on single match
2. **Phase 2**: Add LLM disambiguation for multiple matches  
3. **Phase 3**: Add team name normalization dictionary
4. **Phase 4**: Confidence scoring and review flag for low-confidence links

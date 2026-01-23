# Data Model Spec

## Core Entities
- Accounts: bookmaker/exchange profiles; commission, currency, status, limits.
- Bets: event, market, selection, odds, stake, currency, placedAt, status.
- MatchedSets: backBetId, layBetId, promoType, status, netExposure, notes.
- Promos: type, minOdds, maxStake, expiry, terms.
- FreeBets: promotional credits with optional unlock requirements (stake/bet count).
- DepositBonuses: bonuses with wagering requirements (see `deposit-bonuses.md`).
- Transactions: deposits, withdrawals, bonuses, adjustments.
- Screenshots: kind (back/lay), url, filename, contentType, size, status, parsedOutput, confidence.

## Relationships
- MatchedSets reference exactly one back bet and one lay bet.
- Bets belong to one Account (bookmaker or exchange).
- Screenshots can link to Bets and MatchedSets via saved bet rows.

## Statuses
- Bet: draft | placed | matched | settled | needs_review | error
- MatchedSet: draft | matched | settled | needs_review
- Screenshot: uploaded | parsed | needs_review | error

## Currency/FX
- Store bet currency; compute normalized exposure in base currency (NOK currently).

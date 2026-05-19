# Quick Add Contract

## UI Validation

The form blocks submit when:

- `market` is empty.
- `selection` is empty.
- `back.odds` or `lay.odds` is missing or `<= 1`.
- `back.stake` or `lay.stake` is missing or `<= 0`.
- bookmaker or exchange is missing.
- no active bookmaker or no active exchange exists.

## API

Endpoint:

```http
POST /api/bets/quick-add
Content-Type: application/json
```

Payload shape:

```json
{
  "market": "Arsenal vs Chelsea",
  "selection": "Arsenal to Win",
  "matchId": "optional-football-match-uuid",
  "normalizedSelection": "HOME_TEAM",
  "promoType": "Free Bet",
  "freeBetId": "optional-free-bet-uuid",
  "back": {
    "odds": 2.5,
    "stake": 100,
    "bookmaker": "bet365",
    "currency": "NOK"
  },
  "lay": {
    "odds": 2.52,
    "stake": 99.2,
    "exchange": "bfb247",
    "currency": "NOK"
  },
  "notes": "Optional user note"
}
```

`matchId` and `freeBetId` must be UUIDs when present. `normalizedSelection` must be `HOME_TEAM`, `AWAY_TEAM`, or `DRAW`.

## Server Behavior

The route:

- Requires an authenticated user.
- Creates manual placeholder screenshots for `back` and `lay`.
- Resolves or creates bookmaker and exchange accounts.
- Resolves `promoType` into a promo when provided.
- Saves both bet legs with status `matched`.
- Computes net exposure as back profit minus lay liability, converted to NOK.
- Creates a matched set with status `matched`.
- Marks `freeBetId` as used when provided.
- Creates audit entries for back bet, lay bet, and matched bet.
- Revalidates dashboard cache.

## Common Failure Signals

- `401 Unauthorized`: user is not signed in.
- `400 Invalid payload`: missing required field, invalid UUID, bad currency code, or invalid enum.
- `500 Failed to create matched bet`: server-side persistence or FX conversion failure.

## Source References

- `components/bets/quick-add-form.tsx`
- `app/(chat)/api/bets/quick-add/route.ts`
- `tests/unit/bets-api.test.ts`, `quick-add route` describe block

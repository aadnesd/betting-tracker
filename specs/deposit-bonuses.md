# Deposit Bonuses Specification

## Overview

Deposit bonuses are promotional offers from bookmakers where the user deposits money and receives bonus funds (e.g., "Deposit 1000 NOK, receive 100% bonus"). Unlike free bets which are immediately usable credits, deposit bonuses come with **wagering requirements** that must be fulfilled before the bonus can be withdrawn.

**Examples:**
- "Deposit 1000 NOK, get 100% bonus (1000 NOK)" with 6x wagering at minimum 1.80 odds
- "Deposit 500 SEK, get 500 SEK bonus" with 10x wagering at minimum 1.50 odds
- "First deposit bonus: 100% up to €200" with 8x turnover requirement

## User Stories

As a matched bettor, I want to:
1. **Register a deposit bonus** when I claim it from a bookmaker
2. **Link the bonus to a deposit transaction** for tracking the trigger
3. **See wagering progress** as I place bets on that account
4. **Know the minimum odds** required for bets to count toward wagering
5. **Track multiple bonuses** across different bookmakers
6. **Mark a bonus as cleared** when requirements are met
7. **Calculate the true value** of the bonus after wagering costs

## Data Model

### DepositBonus Table

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| id | UUID | Yes | Primary key |
| createdAt | Timestamp | Yes | Creation time |
| userId | UUID | Yes | Owner (FK → User) |
| accountId | UUID | Yes | Bookmaker account (FK → Account) |
| name | String | Yes | Display name (e.g., "Bet365 Welcome Bonus") |
| depositAmount | Decimal | Yes | The deposit amount that triggered the bonus |
| bonusAmount | Decimal | Yes | The bonus amount received |
| currency | String(3) | Yes | Currency code (NOK, SEK, EUR, etc.) |
| wageringMultiplier | Decimal | Yes | Multiplier for wagering (e.g., 6 for 6x) |
| wageringBase | Enum | Yes | What the multiplier applies to: `deposit`, `bonus`, `deposit_plus_bonus` |
| wageringRequirement | Decimal | Yes | Total amount to wager (computed: base × multiplier) |
| wageringProgress | Decimal | Yes | Amount wagered so far (default: 0) |
| minOdds | Decimal | Yes | Minimum odds for bets to count |
| maxBetPercent | Decimal | No | Max bet as % of bonus (e.g., 25% = max bet 250 on 1000 bonus) |
| expiresAt | Timestamp | No | When the bonus expires |
| status | Enum | Yes | `active`, `cleared`, `forfeited`, `expired` |
| linkedTransactionId | UUID | No | FK → AccountTransaction (the triggering deposit) |
| clearedAt | Timestamp | No | When wagering was completed |
| notes | String | No | Optional notes |

### Enum: wageringBase
- `deposit` – Wager X times the deposit amount
- `bonus` – Wager X times the bonus amount
- `deposit_plus_bonus` – Wager X times (deposit + bonus)

### Enum: status
- `active` – Bonus claimed, wagering in progress
- `cleared` – Wagering complete, bonus is withdrawable
- `forfeited` – User forfeited the bonus (e.g., withdrew early)
- `expired` – Bonus expired before clearing

### BonusQualifyingBet Table

Links settled bets to the bonus wagering progress.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| id | UUID | Yes | Primary key |
| createdAt | Timestamp | Yes | Creation time |
| depositBonusId | UUID | Yes | FK → DepositBonus |
| betId | UUID | Yes | FK → BackBet or MatchedBet |
| betType | Enum | Yes | `back` or `matched` |
| stake | Decimal | Yes | The stake amount that counted |
| odds | Decimal | Yes | The odds of the bet |
| qualified | Boolean | Yes | Whether this bet met the min odds requirement |

## Wagering Progress Tracking

### Automatic Tracking

When a bet is **settled** on an account with an active deposit bonus:

1. Check if bet odds ≥ bonus minOdds
2. If qualified:
   - Add stake to `wageringProgress`
   - Create `BonusQualifyingBet` record
3. If `wageringProgress >= wageringRequirement`:
   - Update status to `cleared`
   - Set `clearedAt` timestamp

### Manual Override

Users can manually adjust progress if automatic tracking missed bets (e.g., bets placed before bonus was registered).

### Which Bets Count?

- **Matched bet sets**: The back bet stake counts (not the lay stake on the exchange)
- **Individual back bets**: The full stake counts
- **Settled bets only**: Pending bets don't contribute until settled
- **Won or lost**: Both outcomes count (it's about wagering, not winning)
- **Void/cancelled**: Don't count toward progress

## Linking to Deposits

When creating a bonus, the user can optionally link it to an existing deposit transaction:

1. Show recent deposits for the selected account
2. User selects the triggering deposit
3. Store `linkedTransactionId` for audit trail

This provides:
- Clear record of which deposit triggered which bonus
- Ability to see bonus/deposit relationship in transaction history
- Validation that deposit amount matches bonus terms

## UI Requirements

### Navigation
- Extend existing "Free Bets & Promotions" page (`/bets/settings/promos`)
- Add tab or section for "Deposit Bonuses"
- Or create unified "Bonuses" section with sub-categories

### Promotions Page Updates

Add new section alongside existing free bets:

```
┌─────────────────────────────────────────────────────────────┐
│ Free Bets & Promotions                                      │
├─────────────────────────────────────────────────────────────┤
│ [Free Bets (12)]  [Deposit Bonuses (3)]                     │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ Active Deposit Bonuses (2)                                  │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Bet365 Welcome Bonus            1000 NOK bonus          │ │
│ │ Deposit: 1000 NOK               Expires: 15 Feb 2026    │ │
│ │ Wager: 4200 / 6000 NOK @ 1.80+  ████████░░░░░ 70%       │ │
│ └─────────────────────────────────────────────────────────┘ │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Unibet Reload Bonus             500 SEK bonus           │ │
│ │ Deposit: 500 SEK                Expires: 28 Jan 2026    │ │
│ │ Wager: 800 / 5000 SEK @ 1.50+   ██░░░░░░░░░░░ 16%       │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Summary Cards

Add/update summary cards:
- **Active Deposit Bonuses**: Count of active bonuses
- **Bonus Value Available**: Sum of bonus amounts in active bonuses
- **Wagering Remaining**: Total wagering left across all bonuses
- **Expiring Soon**: Bonuses expiring within 7 days

### Create Deposit Bonus Form (`/bets/settings/promos/new-deposit-bonus`)

**Required fields:**
- Name (text)
- Account (dropdown of bookmaker accounts)
- Deposit amount (number + currency)
- Bonus amount (number)
- Wagering multiplier (number, e.g., 6)
- Wagering base (radio: Deposit / Bonus / Deposit + Bonus)
- Minimum odds (number, e.g., 1.80)
- Expires at (date picker, optional)

**Optional fields:**
- Max bet % (number)
- Link to deposit (dropdown of recent deposits on selected account)
- Notes (textarea)

**Computed display:**
- "Total wagering requirement: 6000 NOK" (updates live as user fills form)

### Deposit Bonus Detail Page (`/bets/settings/promos/deposit-bonus/[id]`)

**Header:**
- Bonus name and status badge
- Account name
- Bonus amount (prominent)

**Progress Card:**
```
┌─────────────────────────────────────────────────────────────┐
│ Wagering Progress                                           │
│                                                             │
│ ████████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  70%          │
│                                                             │
│ 4,200 NOK / 6,000 NOK wagered                               │
│ 1,800 NOK remaining                                         │
│                                                             │
│ Requirements: 6x deposit @ 1.80+ odds                       │
│ Expires: 15 February 2026 (23 days left)                    │
└─────────────────────────────────────────────────────────────┘
```

**Bonus Details Card:**
- Deposit amount that triggered the bonus
- Bonus amount received
- Wagering multiplier and base
- Minimum odds
- Max bet limit (if set)
- Linked deposit transaction (with link to view)

**Qualifying Bets List:**
- Table of bets that contributed to wagering
- Columns: Date, Event, Stake, Odds, Qualified (✓/✗)
- Filter: Show all / Only qualified / Only unqualified
- Sort by date (newest first)

**Actions:**
- Edit bonus details
- Mark as forfeited (with confirmation)
- Manually adjust progress
- Delete (with confirmation)

### Integration Points

#### Account Transaction List
- Show linked bonus badge on deposit transactions
- Click through to bonus detail

#### Bet Settlement Flow
- When settling a bet, check for active bonuses on that account
- Show which bonuses the bet will contribute to
- After settlement, update bonus progress automatically

#### Dashboard
- Add "Active Bonuses" widget showing:
  - Number of active deposit bonuses
  - Total bonus value at stake
  - Next expiring bonus

## API Endpoints

### Deposit Bonuses
- `GET /api/bets/deposit-bonuses` — List user's deposit bonuses
- `POST /api/bets/deposit-bonuses` — Create deposit bonus
- `GET /api/bets/deposit-bonuses/[id]` — Get bonus details with qualifying bets
- `PATCH /api/bets/deposit-bonuses/[id]` — Update bonus
- `DELETE /api/bets/deposit-bonuses/[id]` — Delete bonus
- `POST /api/bets/deposit-bonuses/[id]/adjust-progress` — Manually adjust progress

### Qualifying Bets
- `GET /api/bets/deposit-bonuses/[id]/qualifying-bets` — List qualifying bets
- `POST /api/bets/deposit-bonuses/[id]/qualifying-bets` — Manually add a bet

## Calculations

### Wagering Requirement
```
wageringRequirement = wageringMultiplier × (
  wageringBase === 'deposit' ? depositAmount :
  wageringBase === 'bonus' ? bonusAmount :
  depositAmount + bonusAmount
)
```

### Progress Percentage
```
progressPercent = min(100, (wageringProgress / wageringRequirement) × 100)
```

### Remaining Wagering
```
remainingWagering = max(0, wageringRequirement - wageringProgress)
```

### Expected Bonus Value (Advanced)
After wagering, the true value considering matched betting costs:
```
// Assuming ~2% loss per matched bet cycle
wageringCost = wageringRequirement × 0.02
expectedValue = bonusAmount - wageringCost
```

Example: 1000 NOK bonus with 6000 NOK wagering
- Wagering cost: 6000 × 0.02 = 120 NOK
- Expected value: 1000 - 120 = 880 NOK

## Status Transitions

```
       ┌─────────┐
       │ active  │◄──── User claims bonus
       └────┬────┘
            │
    ┌───────┴───────┐
    │               │
    ▼               ▼
┌─────────┐   ┌───────────┐
│ cleared │   │ forfeited │◄── User withdraws early
└─────────┘   └───────────┘
    ▲               
    │               
(wagering         ┌─────────┐
 complete)        │ expired │◄── Time limit reached
                  └─────────┘
```

## Validation Rules

1. **Deposit amount** must be positive
2. **Bonus amount** must be positive
3. **Wagering multiplier** must be ≥ 1
4. **Minimum odds** must be ≥ 1.01
5. **Max bet percent** if set, must be between 1 and 100
6. **Expiry date** if set, must be in the future
7. **Account** must be a bookmaker (not an exchange)

## Migration Path

1. Add `DepositBonus` and `BonusQualifyingBet` tables
2. Create API endpoints
3. Update promos page with tabs/sections
4. Build create/edit forms
5. Build detail page with progress tracking
6. Integrate with bet settlement for automatic progress updates
7. Add dashboard widgets

## Future Enhancements

- **Auto-detection**: Parse bonus terms from screenshots
- **Notifications**: Alert when bonus is about to expire
- **Optimal strategy**: Suggest optimal matched bets based on remaining wagering
- **Multi-currency**: Track bonuses in different currencies with NOK conversion
- **Rollover tracking**: Some bonuses have multiple stages (e.g., 3x then 5x)
- **Bonus abuse alerts**: Warning if placing bets that might trigger bookmaker restrictions
- **Historical analytics**: Track total bonus value extracted over time

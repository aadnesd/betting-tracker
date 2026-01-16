# Individual Bet Management Spec

## Overview
Users need to view, manage, and settle individual bets independently from matched sets. This supports scenarios where bets are placed without a corresponding hedge (free bets, value bets, partial positions) or when users want granular control over settlement.

## User Stories

### As a user, I want to:
1. View all my individual bets (back and lay) in a single list
2. Create standalone bets without requiring a matched pair
3. Manually settle individual bets when they complete
4. See how settlement affects my account balances
5. Delete or edit individual bets
6. Track which bets are part of matched sets vs standalone

## Pages & Routes

### `/bets/all` - Individual Bets List
**Purpose:** Display all back and lay bets separately, one per row

**Layout:**
```
Header: "All Bets" | Filters: [Status] [Account] [Date Range] [Search]
Table:
  - Type (Back/Lay badge with color)
  - Account (bookmaker/exchange name)
  - Market | Selection
  - Odds | Stake
  - Status (placed/settled badge)
  - P/L (if settled, color-coded)
  - Placed Date
  - Actions (Settle dropdown, Delete icon)
```

**Data:**
- Query: `listAllBetsByUser({ userId, status?, accountId?, fromDate?, toDate? })`
- Returns: Array of back and lay bets with account info, matched set reference if linked
- Sort: Newest first (placedAt DESC)
- Pagination: 50 per page

**Filters:**
- Status: All / Placed / Settled
- Account: All / [user's accounts]
- Date Range: Last 7 days / Last 30 days / Last 90 days / Custom

### `/bets/new/standalone` - Create Standalone Bet
**Purpose:** Add a single bet without matched pair

**Form Fields:**
- Bet Type: Back / Lay (radio buttons)
- Account: Dropdown (filtered by bet type - bookmakers for back, exchanges for lay)
- Market: Text input (e.g., "Match Odds", "Over/Under 2.5")
- Selection: Text input (e.g., "Home Win", "Over 2.5")
- Odds: Decimal input (min: 1.01)
- Stake: Decimal input (min: 0.01)
- Currency: Dropdown (defaults to account currency)
- Placed Date: Date-time picker (defaults to now)
- Match: Optional match picker (links to football match if applicable)
- Notes: Textarea

**Validation:**
- All fields required except Match and Notes
- Odds must be ≥ 1.01
- Stake must be > 0
- Account must match bet type

**Behavior:**
- Creates Back or Lay bet with status 'placed'
- Not linked to any matched set (standalone)
- Creates audit entry
- Redirects to `/bets/all` with success toast

### `/bets/back/[id]` & `/bets/lay/[id]` - Individual Bet Detail
**Purpose:** View and manage a single bet

**Display Sections:**
1. **Bet Info Card**
   - Type badge (Back/Lay)
   - Account name + balance
   - Market | Selection
   - Odds × Stake = Potential Win
   - Status badge
   - Placed date
   - Screenshot thumbnail (if exists)

2. **Settlement Section** (if status = 'placed')
   - Outcome dropdown: Won / Lost / Push
   - Calculated P/L preview (updates on selection)
   - Account balance impact preview
   - "Settle Bet" button (primary)

3. **Settlement Info** (if status = 'settled')
   - Outcome badge (Won/Lost/Push with color)
   - Profit/Loss amount (color-coded)
   - Settled date
   - Link to account transaction

4. **Linked Match** (if matchId exists)
   - Match card with teams, score, status
   - Link to match detail

5. **Matched Set** (if part of matched set)
   - Link to matched set detail
   - Other leg info (counterpart bet)

6. **Audit History**
   - Timeline of changes (created, edited, settled, etc.)

**Actions:**
- **Settle** (if placed): Opens settlement modal
- **Edit** (if placed): Navigate to edit page
- **Delete**: Opens confirmation dialog with cascade options

## Settlement Logic

### P&L Calculation

**Back Bet Settlement:**
```typescript
function settleBackBet(outcome: 'won' | 'lost' | 'push', stake: number, odds: number): number {
  switch (outcome) {
    case 'won':
      return stake * (odds - 1);  // Profit only, stake returned separately
    case 'lost':
      return -stake;               // Lose entire stake
    case 'push':
      return 0;                    // Stake returned, no profit/loss
  }
}
```

**Lay Bet Settlement:**
```typescript
function settleLayBet(outcome: 'won' | 'lost' | 'push', stake: number, odds: number): number {
  switch (outcome) {
    case 'won':
      return stake;                 // Win the backer's stake
    case 'lost':
      return -stake * (odds - 1);   // Lose the liability
    case 'push':
      return 0;                     // No stake change
  }
}
```

### Settlement Process

1. **User selects outcome** from dropdown
2. **System calculates P/L** using functions above
3. **Preview modal shows:**
   - Selected outcome
   - Calculated profit/loss
   - Current account balance
   - New balance after settlement
   - Transaction that will be created

4. **On confirmation:**
   ```typescript
   // Update bet record
   await db.update(backBet/layBet)
     .set({
       status: 'settled',
       profitLoss: calculatedPL.toFixed(2),
       settledAt: new Date(),
     });

   // Create account transaction
   if (profitLoss !== 0) {
     await createAccountTransaction({
       userId,
       accountId: bet.accountId,
       type: 'adjustment',
       amount: profitLoss.toFixed(2),
       currency: bet.currency,
       occurredAt: new Date(),
       notes: `Manual settlement: ${outcome} - ${bet.market} ${bet.selection}`,
     });
   }

   // Create audit entry
   await createAuditEntry({
     userId,
     entityType: bet.kind === 'back' ? 'back_bet' : 'lay_bet',
     entityId: bet.id,
     action: 'manual_settle',
     changes: { outcome, profitLoss },
     notes: `Manually settled as ${outcome}`,
   });
   ```

5. **Update linked matched set** (if applicable):
   - If both legs are now settled, set matched set status to 'settled'
   - Calculate and store combined P/L on matched set

## Database Changes

### Audit Actions
Add new action type to enum:
```typescript
export type AuditAction =
  | "create"
  | "update"
  | "delete"
  | "status_change"
  | "reconcile"
  | "attach_leg"
  | "auto_settle_detected"
  | "auto_settle_applied"
  | "manual_settle";  // NEW
```

### New Queries

```typescript
// List all individual bets
export async function listAllBetsByUser({
  userId,
  status,
  accountId,
  fromDate,
  toDate,
  limit = 50,
}: {
  userId: string;
  status?: 'placed' | 'settled';
  accountId?: string;
  fromDate?: Date;
  toDate?: Date;
  limit?: number;
}): Promise<IndividualBet[]>;

// Settle a bet manually
export async function settleBackBet({
  id,
  userId,
  outcome,
}: {
  id: string;
  userId: string;
  outcome: 'won' | 'lost' | 'push';
}): Promise<void>;

export async function settleLayBet({
  id,
  userId,
  outcome,
}: {
  id: string;
  userId: string;
  outcome: 'won' | 'lost' | 'push';
}): Promise<void>;

// Delete individual bet
export async function deleteBackBet({
  id,
  userId,
  unlinkFromMatchedSet,
}: {
  id: string;
  userId: string;
  unlinkFromMatchedSet?: boolean;
}): Promise<void>;

export async function deleteLayBet({
  id,
  userId,
  unlinkFromMatchedSet,
}: {
  id: string;
  userId: string;
  unlinkFromMatchedSet?: boolean;
}): Promise<void>;
```

## UI Components

### `<IndividualBetRow>`
Displays a single bet in the list table with inline settlement controls.

**Props:**
```typescript
interface IndividualBetRowProps {
  bet: BackBet | LayBet;
  account: { name: string; kind: string };
  matchedSet?: { id: string; status: string };
  onSettle: (outcome: 'won' | 'lost' | 'push') => Promise<void>;
  onDelete: () => Promise<void>;
}
```

### `<SettlementModal>`
Preview and confirm settlement outcome.

**Props:**
```typescript
interface SettlementModalProps {
  bet: BackBet | LayBet;
  account: Account;
  onConfirm: (outcome: 'won' | 'lost' | 'push') => Promise<void>;
  onCancel: () => void;
}
```

### `<StandaloneBetForm>`
Form for creating individual bets.

**Props:**
```typescript
interface StandaloneBetFormProps {
  accounts: Account[];
  freeBets?: FreeBet[];
  onSubmit: (bet: CreateBetParams) => Promise<void>;
}
```

## Analytics Impact

When a bet is manually settled:

1. **Account Balance**: Updated via adjustment transaction
2. **Profit/Loss Reports**: Include settled bet in calculations
3. **ROI Metrics**: Contribute to overall performance
4. **Matched Set Status**: If both legs settled, update matched set to 'settled'
5. **Exposure**: Remove from open exposure calculations

## Edge Cases

1. **Settling half of matched set**: 
   - Allowed - user might settle lay before back completes
   - Matched set stays in 'matched' status until both legs settled

2. **Deleting settled bet**:
   - Must reverse settlement transaction
   - Update account balance
   - Remove from profit analytics

3. **Free bets**:
   - If bet used a free bet, don't return stake on win
   - P/L calculation: won = stake × (odds - 1) - stake = stake × (odds - 2)

4. **Zero stake bets**:
   - Not allowed - validation requires stake > 0

## Testing Requirements

### Unit Tests
- P/L calculation functions for all outcomes (won/lost/push)
- Back bet settlement logic
- Lay bet settlement logic
- Free bet P/L calculations
- Settlement transaction creation
- Audit entry creation
- Matched set status updates

### Integration Tests
- Create standalone bet → appears in list
- Settle bet → updates balance, creates transaction, updates analytics
- Delete bet → removes from DB, reverses settlement if needed
- Filter/search functionality
- Settlement preview calculations

### E2E Tests
- Full settlement workflow from list page
- Create standalone bet → settle → verify balance change
- Settle one leg of matched set → verify set status
- Delete bet with cascade options

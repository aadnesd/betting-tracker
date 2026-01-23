# Wallets Specification

## Overview

Wallets are payment intermediaries used to fund bookmaker/exchange accounts and withdraw winnings. Unlike betting accounts, wallets don't hold bets — they're used for money transfers.

**Examples:**
- **Fiat e-wallets**: Revolut, Wise, PayPal, Skrill, Neteller
- **Crypto wallets**: Exodus, MetaMask, Trust Wallet
- **Hybrid**: Jeton (supports both fiat and crypto)

## Currency Display Rules

**Individual balances**: Always displayed in their native currency (USD, GBP, BTC, ETH, etc.)

**Aggregated totals**: Converted to NOK using the FX Rates API for consistent comparison

The FX Rates API ([fxratesapi.com](https://fxratesapi.com/docs/currency-list)) supports both fiat and crypto:
- **Fiat**: USD, EUR, GBP, SEK, DKK, and 150+ others
- **Crypto**: BTC, ETH, USDT, USDC, SOL, DOT, AVAX, MATIC, LTC, ADA, BNB, XRP, DAI, BUSD, ARB, OP

This means wallet balances in BTC or USDT can be included in the total capital calculation alongside fiat accounts.

## User Stories

As a matched bettor, I want to:
1. Track balances across all my payment wallets
2. Record deposits from bank → wallet
3. Record transfers from wallet → bookmaker
4. Record withdrawals from bookmaker → wallet
5. See the flow of funds through my wallets
6. Reconcile wallet balances with actual wallet apps

## Data Model

### Wallet Table

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| id | UUID | Yes | Primary key |
| userId | UUID | Yes | Owner (FK → User) |
| name | String | Yes | Display name (e.g., "Revolut GBP", "Exodus BTC") |
| type | Enum | Yes | `fiat`, `crypto`, `hybrid` |
| currency | String | Yes | Primary currency (GBP, EUR, USD, BTC, ETH, USDT, etc.) |
| notes | String | No | Optional notes |
| status | Enum | Yes | `active`, `archived` |
| createdAt | Timestamp | Yes | Creation time |

### WalletTransaction Table

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| id | UUID | Yes | Primary key |
| walletId | UUID | Yes | FK → Wallet |
| type | Enum | Yes | Transaction type (see below) |
| amount | Decimal | Yes | Transaction amount |
| currency | String | Yes | Transaction currency |
| relatedAccountId | UUID | No | FK → Account (for bookie transfers) |
| relatedWalletId | UUID | No | FK → Wallet (for wallet-to-wallet transfers) |
| externalRef | String | No | External reference/tx hash |
| date | Timestamp | Yes | Transaction date |
| notes | String | No | Optional notes |
| createdAt | Timestamp | Yes | Creation time |

### Transaction Types

| Type | Description | Related Entity |
|------|-------------|----------------|
| `deposit` | Money in from bank/external source | None |
| `withdrawal` | Money out to bank/external | None |
| `transfer_to_account` | Transfer to bookmaker/exchange | Account |
| `transfer_from_account` | Transfer from bookmaker/exchange | Account |
| `transfer_to_wallet` | Transfer to another wallet | Wallet |
| `transfer_from_wallet` | Transfer from another wallet | Wallet |
| `fee` | Transaction fee | None |
| `adjustment` | Manual balance adjustment | None |

## Linked Transactions

When recording a transfer between wallet and account:
1. Create `WalletTransaction` with type `transfer_to_account` on the wallet
2. Create `AccountTransaction` with type `deposit` on the account
3. Link via `relatedAccountId` for traceability

This maintains accurate balances on both sides while showing the fund flow.

## UI Requirements

### Navigation
- Add "Wallets" tab in settings alongside "Accounts"
- Add wallet balance to Bankroll page

### Wallet List Page (`/bets/settings/wallets`)
- List all wallets with name, type, currency, balance
- Filter by type (fiat/crypto/hybrid)
- Empty state with "Add Wallet" CTA
- Link to create new wallet

### Wallet Detail Page (`/bets/settings/wallets/[id]`)
- Wallet summary card (name, type, currency, balance)
- Transaction history (newest first)
- Add transaction button
- Edit wallet details
- Archive wallet option

### Create/Edit Wallet Form
- Name (required)
- Type: fiat/crypto/hybrid (required)
- Currency (required, with crypto options like BTC, ETH, USDT)
- Notes (optional)

### Add Transaction Form
- Transaction type dropdown
- Amount and currency
- Date picker
- For transfers: account/wallet selector
- External reference (optional, useful for crypto tx hashes)
- Notes (optional)

### Bankroll Integration
- Bankroll page shows wallet balances alongside account balances
- Separate section: "Wallets" with total and breakdown
- Combined "Total Capital" includes wallets + accounts

## API Endpoints

### Wallets
- `GET /api/bets/wallets` — List user's wallets
- `POST /api/bets/wallets` — Create wallet
- `GET /api/bets/wallets/[id]` — Get wallet details
- `PATCH /api/bets/wallets/[id]` — Update wallet
- `DELETE /api/bets/wallets/[id]` — Archive/delete wallet

### Wallet Transactions
- `GET /api/bets/wallets/[id]/transactions` — List transactions
- `POST /api/bets/wallets/[id]/transactions` — Create transaction
- `DELETE /api/bets/wallets/[id]/transactions/[txId]` — Delete transaction

## Balance Calculation

Wallet balance = SUM of:
- `+ deposit`
- `- withdrawal`
- `- transfer_to_account`
- `+ transfer_from_account`
- `- transfer_to_wallet`
- `+ transfer_from_wallet`
- `- fee`
- `+/- adjustment`

## Crypto Considerations

1. **Single currency per wallet**: Each wallet tracks one currency. Create separate wallets for multi-currency holdings (e.g., "Exodus BTC", "Exodus ETH").

2. **Supported crypto currencies**: BTC, ETH, USDT, USDC, SOL, DOT, AVAX, MATIC, LTC, ADA, BNB, XRP, DAI, BUSD, ARB, OP (and any others supported by FX Rates API).

3. **Display formatting**:
   - Stablecoins (USDT, USDC, DAI, BUSD): 2 decimal places
   - Other crypto: up to 8 decimals for small amounts, 4 for larger

4. **Transaction hashes**: `externalRef` field stores blockchain tx hashes for verification

5. **Exchange rates**: Crypto → NOK conversion uses live FX rates for total capital aggregation

6. **Network fees**: `fee` transaction type tracks gas/network fees separately

## Migration Path

1. Add `Wallet` and `WalletTransaction` tables
2. Add queries for CRUD operations
3. Create API endpoints
4. Build UI pages
5. Integrate with Bankroll page
6. Add linked transaction creation for transfers

## Future Enhancements

- Auto-sync with wallet APIs (Revolut, etc.)
- Crypto price tracking
- Multi-currency wallet support
- Transfer wizard (guides user through both sides of transfer)
- Recurring transfer templates

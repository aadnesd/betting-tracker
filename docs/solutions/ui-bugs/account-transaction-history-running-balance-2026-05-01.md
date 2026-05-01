---
title: Account transaction history running balance
date: 2026-05-01
category: ui-bugs
module: matched-betting/accounts
problem_type: ui_bug
component: frontend_stimulus
symptoms:
  - Account detail Transaction History showed transaction amounts but no balance after each transaction.
  - Users could not reconcile deposits, bonuses, withdrawals, and adjustments against the current account balance from the account page.
root_cause: logic_error
resolution_type: code_fix
severity: medium
related_components:
  - app/(chat)/bets/settings/accounts/[id]/page.tsx
  - components/bets/transaction-row.tsx
tags: [matched-betting, accounts, transactions, running-balance, account-detail, cua]
---

# Account transaction history running balance

## Problem

The account detail page showed transaction history without a running balance column. Users could see individual transaction amounts, but not the account balance after each transaction.

The page already had the needed inputs: current account balance from `getAccountBalance` and newest-first rows from `listTransactionsByAccount`.

## Symptoms

- `Accounts -> Account -> Transaction History` showed transaction details and amount only.
- The account summary showed the current balance, but the history did not explain how the account arrived there.
- Transactions render newest-first, so a naive forward accumulation from zero would not match the visible row order.

## What Didn't Work

- Deriving balances by accumulating oldest-first would require reversing the visible list, calculating forward balances, then mapping back to newest-first display order.
- Moving the balance calculation into `TransactionRow` would hide ordering context inside a row component that only knows about one transaction.
- Re-querying all transaction history just for the row display would add more data access than needed for the existing page, which already anchors the visible rows from the current balance.

## Solution

Derive each row's balance on the server page while the full visible transaction order is available. Start from the current account balance, render that cursor value as the balance after the newest transaction, then subtract each transaction's signed impact to walk backward through time.

```ts
function getTransactionBalanceImpact({
  amount,
  type,
}: {
  amount: string;
  type: string;
}) {
  const value = Number.parseFloat(amount);

  if (type === "withdrawal") {
    return -value;
  }

  if (type === "adjustment") {
    return value;
  }

  return value;
}

let balanceCursor = balance;
const transactionsWithRunningBalance = transactions.map((tx) => {
  const runningBalance = balanceCursor;
  balanceCursor -= getTransactionBalanceImpact({
    amount: tx.amount,
    type: tx.type,
  });

  return { ...tx, runningBalance };
});
```

Pass the derived balance into the row component along with the account currency label:

```tsx
<TransactionRow
  accountId={id}
  transaction={{
    id: tx.id,
    type: tx.type as AccountTransactionType,
    amount: tx.amount,
    currency: tx.currency,
    occurredAt: iso,
    notes: tx.notes,
    runningBalance: tx.runningBalance,
    runningBalanceCurrency: account.currency ?? tx.currency,
  }}
/>
```

Then render the row as a responsive grid with transaction, amount, balance, and actions columns:

```tsx
<div className="group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-md border p-3 transition-colors hover:bg-muted/30 sm:grid-cols-[minmax(0,1fr)_8rem_8rem_auto]">
  ...
  <div className="col-span-2 text-right sm:col-span-1">
    {typeof transaction.runningBalance === "number" && (
      <>
        <p className="font-semibold text-sm">
          {transaction.runningBalanceCurrency ?? transaction.currency}{" "}
          {transaction.runningBalance.toFixed(2)}
        </p>
        <p className="text-muted-foreground text-xs">Balance</p>
      </>
    )}
  </div>
</div>
```

## Why This Works

The current account balance is the balance after the newest transaction. Because the page renders transactions newest-first, each row can show the current cursor as "balance after this transaction" before moving the cursor backward.

The cursor update must mirror `getAccountBalance` sign semantics:

```text
withdrawal -> negative impact
adjustment -> signed impact
deposit    -> positive impact
bonus      -> positive impact
```

For a seeded CUA verification account:

```text
Start current balance: 1050

3 Apr withdrawal 150:
show 1050
previous = 1050 - (-150) = 1200

2 Apr bonus 200:
show 1200
previous = 1200 - 200 = 1000

1 Apr deposit 1000:
show 1000
previous = 1000 - 1000 = 0
```

The CUA check confirmed the visible transaction history displayed:

```text
Withdrawal -NOK 150.00 -> NOK 1050.00
Bonus      +NOK 200.00 -> NOK 1200.00
Deposit    +NOK 1000.00 -> NOK 1000.00
```

## Prevention

- Keep row-level running balances derived where the ordered transaction list and current balance are both available.
- When adding or changing account transaction types, update the row-balance impact helper and `getAccountBalance` semantics together.
- Add browser coverage that seeds transactions covering deposit, bonus, withdrawal, and signed adjustment rows, then asserts the visible balance column.
- Verify responsive layout for financial history rows; amount and balance columns need stable widths so hover actions and long notes do not shift the ledger values.

## Related Issues

- [Local CUA authentication for testing](../documentation-gaps/local-cua-authentication-testing-2026-04-13.md) explains the local authenticated CUA setup used when verifying pages behind auth.
- GitHub issues: no related issues found for `running balance transaction history account detail`, `account transaction balance`, or `bets settings accounts`.

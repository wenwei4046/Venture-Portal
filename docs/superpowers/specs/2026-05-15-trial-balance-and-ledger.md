# Trial Balance + General Ledger reports

**Date**: 2026-05-15
**Branch**: feat/fund-flow-pnl-classification
**Status**: Approved

## Problem

The Reports section currently surfaces 6 high-level views (Cash Flow, Income Statement, Balance Sheet, Fund Summary, Base Rate, Claims) but no raw-accounting drill-down. Finance can see WHAT the totals are but not HOW they're composed at the GL level. Audit reconciliations and account-level investigations have to be done by querying the DB directly. Two standard reports close the gap: a Trial Balance (snapshot of every account's debit / credit balance with Σ Dr = Σ Cr proof) and a General Ledger (per-account chronological line view with running balance).

## Scope

Two new routes under `/reports/`, plus two new exported functions in `src/lib/cfo-reports.ts`, plus two new cards on the `/reports/page.tsx` index. No DB / migration changes — both reports read from existing `chart_of_accounts` + `journal_entries` + `journal_lines`.

## User flows

1. Finance opens **Trial Balance** at `/reports/trial-balance`. Page defaults to today's date, hides zero-balance rows. Finance can change the as-of date or toggle "Show zero-balance" to expose every leaf account.
2. From any TB row, Finance clicks the account name → lands on **Ledger** at `/reports/ledger?code=<code>` with no period parameters, so the Ledger page applies its own default (current month). Finance freely adjusts the date range there.
3. Direct entry to Ledger at `/reports/ledger` shows an empty state with a "select an account" prompt; the AccountPicker is at the top of the page.
4. Both reports are gated to `principal` and `finance` roles (matching the other 5 financial reports).

## Trial Balance — `/reports/trial-balance`

### Inputs

Search params, all optional:

| Param | Default | Meaning |
| --- | --- | --- |
| `as_of` | today (YYYY-MM-DD) | Snapshot date. Balances accumulate from inception → this date. |
| `show_zero` | `0` | `1` shows every leaf account including those with zero balance. |

### Behavior

- Reads every leaf account in `chart_of_accounts`. A leaf is an account that is NOT a header — i.e. its `code` is not referenced by any other row's `parent_code`. Concretely:
  `WHERE code NOT IN (SELECT DISTINCT parent_code FROM chart_of_accounts WHERE parent_code IS NOT NULL)`
  - Header accounts (1000, 9050) are excluded. They have no direct `journal_lines` and the header-rejection trigger forbids posting to them, so they'd always show as zero noise.
- For each leaf account, sums all `journal_lines` from non-reversed `journal_entries` with `transaction_date <= as_of`.
- Splits the net into Dr / Cr columns based on the account's normal side:
  - Asset / fixed_asset / expense → normal Dr (positive net → Dr column).
  - Liability / equity / revenue / other_income / cost → normal Cr (positive net → Cr column).
  - Abnormal balances (e.g. an asset with net credit position) go in the opposite column.
- When `show_zero=0`, rows where both Dr and Cr are 0 are dropped.
- Rows grouped by `type` in this display order: Asset · Fixed Asset · Liability · Equity · Revenue · Cost · Other Income · Expense. Inside a group, sorted by `code` ascending.
- Each group has a subtotal row. The page footer has the grand total. Grand total Dr MUST equal grand total Cr (within RM 0.01). If it doesn't, render a `text-danger` warning above the totals row.
- Each account name is a `<Link href="/reports/ledger?code={code}">` (no period params — Ledger picks its own default).

### Layout

```
┌─────────────────────────────────────────────────────────┐
│ <I.> REPORTS · TRIAL BALANCE · 15 MAY 2026              │
│ Trial Balance                            [Date picker]  │
│                                          [☐ Show zero]  │
├─────────────────────────────────────────────────────────┤
│ Snapshot as at 15 May 2026. Σ Dr must equal Σ Cr.       │
│                                                          │
│ ASSETS                                                   │
│ 3000 Cash & Bank — Hong Leong     2,000.00       —      │
│ 3030 AR — Subs                   16,800.00       —      │
│ Total Assets                     18,800.00       —      │
│                                                          │
│ ...                                                      │
│                                                          │
│ EXPENSE                                                  │
│ 9053 Inter-billing — HR             800.00       —      │
│ Total Expense                       800.00       —      │
├─────────────────────────────────────────────────────────┤
│ TOTAL                            17,600.00   17,600.00  │
└─────────────────────────────────────────────────────────┘
```

Use the v3.0 design system: `page-head` wrapper, `ledger-table` class, `.num` cells for money, `text-danger` for any imbalance warning. Account name as `Link` with no extra styling override — picks up the table's default link color.

## General Ledger — `/reports/ledger`

### Inputs

Search params, all optional except `code` for non-empty rendering:

| Param | Default | Meaning |
| --- | --- | --- |
| `code` | (none) | COA leaf account code to view. Empty → empty state. |
| `from` | first day of current month | Period start (inclusive). |
| `to` | today | Period end (inclusive). |

### Behavior

- When `code` is empty: render an empty state with an AccountPicker prompt and no table. The picker dispatches navigation by setting the `code` search param.
- When `code` is set:
  1. Resolve account name + type from `chart_of_accounts`. If the code is unknown or a header, show an error message and bail.
  2. Compute **opening balance**: sum `journal_lines` for `code` from non-reversed entries with `transaction_date < from`. Signed by normal side.
  3. Fetch all `journal_lines` joined to `journal_entries` for `code` where `is_reversed = false` AND `transaction_date BETWEEN from AND to`, ordered by `transaction_date, entry_no, jl.id`.
  4. Compute running balance row-by-row: `running = previous + (dr - cr)` for Dr-normal accounts, `running = previous + (cr - dr)` for Cr-normal accounts. The display shows the absolute value plus a `Dr` / `Cr` suffix.
  5. Period totals = sum of all line Dr / sum of all line Cr.
  6. Closing balance = opening ± (Σ Dr − Σ Cr) signed by normal side.
- AccountPicker reuses `src/components/AccountPicker.tsx` (already filters out header accounts). Submitting a different account navigates to `/reports/ledger?code=<new>&from=<from>&to=<to>` so the user keeps their period.
- Period inputs are a small inline form: From | To | Submit, all next to the AccountPicker.

### Layout

```
┌─────────────────────────────────────────────────────────┐
│ <I.> REPORTS · GENERAL LEDGER · 1–15 MAY 2026           │
│ Ledger                          [Account ▼ 3030 AR…]    │
│                                 [From] [To] [Apply]     │
├─────────────────────────────────────────────────────────┤
│ Account: 3030 Accounts Receivable — Subs                │
│ Period: 1 May 2026 – 15 May 2026                        │
│                                                          │
│ Opening balance (30 Apr 2026)        15,000.00 Dr       │
│                                                          │
│ DATE   ENTRY      DESCRIPTION         DR     CR  BALANCE│
│ 03 May JE-0001    Invoice HV-INV-…    10000   —   25000 │
│ ...                                                      │
│                                                          │
│ Period totals:                       11,800  800        │
│ Closing balance (15 May 2026)        26,000.00 Dr       │
└─────────────────────────────────────────────────────────┘
```

## Backend (`src/lib/cfo-reports.ts` extension)

Two new types and two new exported functions, following the existing `fetchBalanceSheet` pattern.

```ts
export interface TrialBalanceRow {
  code: string
  name: string
  type: AccountType
  debit: number            // positive when account has a Dr balance
  credit: number           // positive when account has a Cr balance
  // For each row, exactly one of debit/credit is non-zero in the normal case;
  // an abnormal balance (e.g. asset in credit) populates the OTHER column.
}

export interface TrialBalance {
  asOf: string
  rows: TrialBalanceRow[]
  totals: { debit: number; credit: number }
  reconciles: boolean      // |debit - credit| < 0.01
  showZeroBalance: boolean
}

export async function fetchTrialBalance(
  supabase: SupabaseClient,
  args: { asOf: string; showZeroBalance: boolean }
): Promise<TrialBalance>

export interface LedgerLine {
  entryDate: string        // YYYY-MM-DD
  entryNo: string
  description: string
  debit: number            // 0 when this side wasn't touched
  credit: number
  runningBalance: number   // signed by the account's normal side
}

export interface Ledger {
  code: string
  accountName: string
  accountType: AccountType
  from: string
  to: string
  openingBalance: number
  closingBalance: number
  periodTotals: { debit: number; credit: number }
  lines: LedgerLine[]
}

export async function fetchLedger(
  supabase: SupabaseClient,
  args: { code: string; from: string; to: string }
): Promise<Ledger>
```

`fetchTrialBalance` reuses the existing `sumGlNetAcrossCodes` helper (one call per leaf account, batched if performance becomes an issue — at the current account count of ~28 leaves the unbatched call is fine).

`fetchLedger` issues two queries: one for opening balance (`< from`), one for the period lines (`BETWEEN from AND to`). Both filter `is_reversed = false`.

## Reports index update

Add two new cards to `src/app/(portal)/reports/page.tsx`:

```ts
{
  href: '/reports/trial-balance',
  title: 'Trial Balance',
  description: 'Snapshot of every GL account at a date. Σ Dr = Σ Cr.',
},
{
  href: '/reports/ledger',
  title: 'General Ledger',
  description: 'Per-account journal lines with running balance over a period.',
},
```

Insert before the Fund Summary card so the financial-statement trio (CF / IS / BS) flows into the GL drill-downs (TB / Ledger), then the operational reports.

## Testing

Add 4 unit tests to `src/lib/cfo-reports.test.ts` using the existing fixture pattern:

1. **`fetchTrialBalance` reconciles** — synthetic JE lines summing to a known TB, assert `totals.debit === totals.credit` and `reconciles=true`.
2. **`fetchTrialBalance` show-zero filter** — when `showZeroBalance=false`, rows where both Dr and Cr are zero are not in `rows`. Same fixture with `showZeroBalance=true` returns all leaves.
3. **`fetchLedger` closing balance math** — for a Dr-normal account, given opening 1000 + period (Dr 500, Cr 200), assert `closingBalance === 1300`, `periodTotals.debit === 500`, `periodTotals.credit === 200`.
4. **`fetchLedger` running balance** — for a sequence of (Dr 100, Cr 30, Dr 50) on a Dr-normal account starting at 0, assert `lines[0].runningBalance === 100`, `lines[1] === 70`, `lines[2] === 120`.

Tests use the same fake-Supabase pattern already in the file. The functions must accept a `SupabaseClient` and not call `createClient` themselves, so tests can pass a stub.

## Permissions

Both pages call `requireRole(['principal', 'finance'])` at the top of the Server Component. HR / dept_manager get a redirect to /dashboard via the existing `requireRole` middleware behavior.

## Out of scope

- Export to Excel / PDF (covered by the upcoming #1 task — TB and Ledger will be added to the export surface there).
- Period locks integration — TB and Ledger are read-only; period_locks only gates writes.
- Per-pool variant of TB (e.g. "Marketing TB") — the existing Income Statement already provides per-pool P&L; TB stays at group level.
- Comparing two TB dates side-by-side (period-over-period view) — possible follow-up if requested.
- Customizable account-type ordering or pinning — the fixed order (Asset → Fixed Asset → Liability → Equity → Revenue → Cost → Other Income → Expense) is standard.
- Per-account budget vs actual on TB rows — not requested.

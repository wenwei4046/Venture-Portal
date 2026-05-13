# Fund Flow & P&L Classification — Design Spec

**Date:** 2026-05-13
**Status:** Approved (pending written-spec review)
**Author:** brainstorming session

## Problem

The P&L (Income Statement) and Cash Flow reports mis-classify money movements:

1. **Loan/deposit principal leaks into the P&L as expense.** `fetchCashflowBuckets` pulls *all* `status='paid'` payment vouchers with no `voucher_type` filter, so a loan disbursement (`loan_disbursement`) or a fund-source principal repayment (`loan_repayment`) gets bucketed as an outflow → lands in "General expenses" → counted as cost in the Income Statement. A RM 50,000 loan disbursement shows up as RM 50,000 of general expense.
2. **`fund_sources.repayment_date` has the wrong semantics.** The fund-in form labels it "Expected repayment date" meaning *the date HV repays the full principal*, but there is already a separate `lock_in_months` repayment period. The meaningful input is *when the first installment is due*; the full-repayment date is derivable.
3. **"Uncategorised" line items appear in both reports.** A `payment_voucher_sources` row whose `category_code` is null or points at a missing `payment_categories` row falls through to `FALLBACK_LABEL = 'Uncategorised'`. Separately, the Income Statement only counts invoices whose `billing_mode ∈ {marketing_project, hr_attribution, finance_attribution, director_*}` — other billing modes are silently dropped.
4. **Expenses don't follow the funding pool.** Each `payment_voucher_sources` row records which `pool` the money came from, but the reports bucket outflows by `journal_entries.segment` instead. So an expense funded from a department pool can land in "General expenses" rather than against that pool.
5. **Cash Flow fund-outs aren't split by pool.** Outflows are bucketed by JE segment, not by which pool funded them.

## Goal

Drive the three statements from a single coherent model:

- Every money movement is attached to **one pool** (already true: `payment_voucher_sources.pool`).
- The `payment_categories.account_type` classification (`asset | liability | equity | revenue | expense`) decides **which statement** the line belongs to and **which section** (revenue vs expense) it shows in.
- The line's display name is the category `label`.
- The P&L shows **one section per pool** (revenue − expense = pool margin), plus a **summary** that sums all pools.
- Loan/deposit *principal* movements are Balance-Sheet items (classified `asset` / `liability`), so they never touch the P&L; their *interest* stays in the P&L (under Venture Pool).

A separate, smaller change: fix the fund-in repayment-date semantics (#2).

Existing fund-in / fund-out / all other transactional data will be **wiped** rather than backfilled — the user re-enters it fresh once the new model and DB constraints are in place.

## Approach

Rebuild the report aggregation layer (`src/lib/cfo-reports.ts`) around `classification` + `pool`. Chosen over (a) a minimal patch that only filters out the leaking voucher types — doesn't deliver the per-pool P&L the user wants — and (b) a GL-`journal_lines`-backed rewrite — `pool` isn't carried on journal lines and segment ≠ pool, so it's a bigger change that doesn't match the "which pool funded it" mental model.

## Design

### 1. Data model & classification rules

`payment_categories` (structure unchanged; fields already exist): `code` (key), `label` (display name), `account_type` ∈ {`asset`, `liability`, `equity`, `revenue`, `expense`} (shown in Settings as the "CLASSIFICATION" column), `gl_account_code`, `revenue_gl_account_code`, `is_active`.

Report routing is decided entirely by `account_type`:

| `account_type` | Direction | Statements | Section |
|---|---|---|---|
| `revenue` | inflow | Cash Flow + **P&L** | Revenue |
| `expense` | outflow | Cash Flow + **P&L** | Expense |
| `liability` / `equity` | inflow | Cash Flow + **Balance Sheet** | (fund-in / borrowed principal / capital injection) |
| `asset` | outflow | Cash Flow + **Balance Sheet** | (fund-out / loan disbursed / asset purchase) |
| `liability` | outflow | Cash Flow + **Balance Sheet** | (principal repaid / liability reduced) |

**New DB constraints (added *after* the wipe, so no rows can violate them):**
- `payment_categories.account_type` → `NOT NULL`.
- `payment_voucher_sources.category_code` → `NOT NULL`, and must reference an existing `payment_categories.code` (FK or trigger).

**Pool taxonomy** — a new constant map (replaces `GlSegment` / `SEGMENT_LABEL` in the report layer):

| `pool` value | Display label | Backing table |
|---|---|---|
| `venture_pool` | Venture Pool | `venture_pool` |
| `invoice_payout_pool` | Invoice Payout Pool | `invoice_payout_pool` |
| `dept_pool_marketing` | Marketing | `dept_pools` (dept = Marketing) |
| `dept_pool_hr` | HR | `dept_pools` (dept = HR) |
| `dept_pool_finance` | Finance | `dept_pools` (dept = Finance) |
| `dept_pool_director_office` | Director Office | `dept_pools` (dept = Director Office) |
| `dept_pool_director` | Director Pool | `dept_pools` (dept = Director) |
| `operating_fund` | Operating Fund | `operating_fund_transactions` |

Pools not in this map fall to a "Treasury / corporate" catch-all (should be rare; the JE-segment fallback `unallocated`/`corporate` no longer drives anything).

**Treasury interest** — loan interest income (GL 4010) and penalty income (4020) are treated as **Venture Pool revenue**; fund-source interest expense (5010) is treated as **Venture Pool expense**. Principal flows (disbursement, principal received, deposit received, deposit principal repaid) are Balance-Sheet only and never enter the P&L.

### 2. Report aggregation rewrite (`src/lib/cfo-reports.ts`)

New data flow:

1. Fetch `status='paid'` payment vouchers in the date window, **excluding `voucher_type='internal_transfer'`** (bank-to-bank moves would double-count).
2. Fetch their `payment_voucher_sources` rows (`pool`, `category_code`, `amount`); join `payment_categories` for `account_type` + `label`.
3. Each source row → a record `(pool, account_type, label, amount, direction)` where `direction` comes from `payment_vouchers.direction` (`credit` = in, `debit` = out).
4. Split by `account_type`:
   - `revenue` / `expense` → P&L + Cash Flow.
   - `asset` / `liability` / `equity` → Balance Sheet + Cash Flow (**not** P&L). *This is the fix for #1 — loan/deposit principal no longer counts as expense.*
5. Revenue side additionally includes **all** `invoices` with status `issued` / `paid` / `paid_via_netting` in the window (one line per invoice, label = `<company short_code> · <invoice_no>`), mapped to a pool via `billing_mode` / category. *No billing mode is silently dropped.*
6. Treasury interest is pulled from `journal_lines` (account codes 4010 / 4020 / 5010) in the window and attributed to Venture Pool.

New exported shapes (names indicative):

```ts
interface Line { label: string; amount: number }

interface PoolPnl {
  pool: string;          // 'dept_pool_marketing' | ...
  poolLabel: string;     // 'Marketing'
  revenueLines: Line[];
  expenseLines: Line[];
  revenue: number;
  expense: number;
  margin: number;        // revenue - expense
}

interface IncomeStatement {
  pools: PoolPnl[];                       // one per pool with activity
  treasury: { interestIncome: number; penaltyIncome: number; interestExpense: number; net: number }; // folded into Venture Pool's view
  groupRevenue: number;
  groupExpense: number;
  groupNetProfit: number;                 // sum of pool margins (+ treasury.net)
}

interface PoolCashflow {
  pool: string;
  poolLabel: string;
  inflow: { fundIn: Line[]; revenue: Line[]; total: number };   // fundIn = liability/equity-classified inflows
  outflow: { capital: Line[]; expense: Line[]; total: number }; // capital = asset/liability-classified outflows
  net: number;
}

interface CashflowStatement {
  pools: PoolCashflow[];
  netChange: number;     // sum of pool nets
}
```

Balance Sheet: keep the existing snapshot logic (`fetchBalanceSheet`); add a "Capital cash movements this period" section listing the `asset` / `liability` / `equity` lines grouped by pool + category label.

The old `GlSegment` / `SEGMENT_LABEL` / `DEPT_SEGMENTS` 3-bucket structures are removed from the report layer. `journal_entries.segment` may stay for GL purposes but no longer drives report bucketing.

### 3. UI changes

- **Income Statement page** (`src/app/(portal)/reports/income-statement/page.tsx`): from "one block per dept segment + Treasury + General" → "**one block per pool** (revenue column / expense column + pool margin) → a **Summary** block that sums all pools = Group net profit". Treasury interest appears as a line group inside the Venture Pool block.
- **Cash Flow page** (`src/app/(portal)/reports/cash-flow/page.tsx`): from "A / B / C three buckets" → "**one block per pool** (Inflow: fund-in / revenue sub-sections; Outflow: capital / expense sub-sections; pool net) → bottom Net cash change summing all pools".
- **Balance Sheet page** (`src/app/(portal)/reports/balance-sheet/page.tsx`): keep the snapshot; add the "Capital cash movements this period" section.
- **Settings → Categories** (`src/app/(portal)/settings/...` categories tab + `createPaymentCategory` action): make `account_type` (classification) a **required** field; helper text spells out "this classification decides whether the line shows on the P&L or the Balance Sheet, and in the revenue or expense section".
- All UI follows DESIGN.md v3.0 (`.page-head`, `.ledger-table`, `.sect-head`, `.num`, CSS-variable colors).

### 4. Data wipe (replaces backfill)

New script `scripts/wipe-all-business-data.mjs` (modeled on the existing `wipe-and-seed.mjs` / `wipe-test-data.mjs`).

- **Truncate/delete (in FK-safe order):** `fund_sources`, `loans`, `fund_source_repayments`, `repayments`, `overdue_records`, `payment_vouchers`, `payment_voucher_sources`, `payment_attachments`, `journal_entries`, `journal_lines`, `invoices`, `monthly_statements` (+ `monthly_statement_lines`), `dept_pools`, `venture_pool`, `invoice_payout_pool`, `operating_fund_transactions`, `director_ctc`, `director_payouts`, `salary_pool`, `payroll_runs`, `hr_staff_costs`, `hr_pool_allocation`, `hr_staff_allocation`, `claims`, `approval_requests`, `base_rate_history`, `config_audit_log`.
- **Reset:** `bank_accounts.current_balance = 0` for every account.
- **Keep (reference / config):** `users`, `companies`, `departments`, `bank_accounts` (rows kept, balances zeroed), `directors` (roster + weightages), `payment_categories`, `treasury_config` / `tier_config` / `overdue_config`, statutory lookup tables (`epf_lookup` / `socso_lookup` / `eis_lookup` / `pcb_lookup`), `rent_splits` / `utility_splits`, `service_contracts`.
- The DB constraints from §1 are applied after the wipe runs (clean landing).
- The `loan_disbursement` creation path (the auto-generated PV when a loan/fund-out is approved) must attach a Balance-Sheet-classified category so disbursements can never re-leak into the P&L.

### 5. Repayment-date semantics (#2)

- Form field keeps the label **"Expected repayment date"**; meaning changes to "the date the first installment is due"; helper text → "Date the first installment is due (must be on or after the effective date)".
- DB column `fund_sources.repayment_date` is **not renamed**; meaning is now "first installment due date".
- Derived "expected full-repayment date" = `repayment_date` + `lock_in_months` months; shown on the fund-in detail page and list.
- No data migration needed (all fund sources are wiped); new entries use the new semantics directly.
- Check overdue / netting logic for any dependence on this date; if present, adjust to count monthly installments starting from the first-installment date.
- Add a unit test for the derived-date calculation.

### 6. Testing

- Extend `src/lib/cfo-reports.test.ts` (pure-function tests over mocked PV sources + categories + invoices):
  - `revenue` / `expense` lines enter the P&L; `asset` / `liability` / `equity` lines do **not**.
  - Lines group by `pool`; group totals equal the sum of pool totals.
  - A loan disbursement (Balance-Sheet category) does not change net profit.
  - `internal_transfer` vouchers are excluded.
  - No "Uncategorised" lines (every line resolves a `label`).
- Unit test for the repayment-date derivation.
- Manual QA: run the wipe → enter a few fund-in/fund-out records + a few invoices → verify the three statements reconcile (assets = liabilities + equity; P&L net profit flows into Balance-Sheet retained earnings; Cash Flow net change matches the bank-balance delta).

## Out of scope

- Multi-currency.
- Replacing the GL / chart-of-accounts engine.
- Reworking how `payment_voucher_sources.pool` values are chosen in the PV creation forms (beyond ensuring the `loan_disbursement` path attaches a BS category).
- Cleaning up questionable existing `payment_categories` rows (e.g. `test_category`, the `amount_due_to_lim_wei_liang` row classified as `asset` → 1000 Assets) — the user will fix these in Settings.

## Open items for the implementation plan

- Exact FK-dependency ordering for the wipe script (verify against current migrations).
- Whether `service_contracts` should also be wiped (kept for now; revisit if the user wants billing fully re-entered).
- How fund-in *inflows* (credit-direction vouchers that currently route via `target_pool` rather than `payment_voucher_sources`) get a `category_code` so they classify as fund-in vs revenue — may need a source row on credit vouchers too, or a parallel classification path.
- Whether the `loan_disbursement` BS category is one shared category or one per counterparty (per subsidiary / per director loan).

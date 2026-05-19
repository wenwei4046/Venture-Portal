# Department Pools — Cash / Accrual Basis Toggle

**Date**: 2026-05-18
**Status**: Approved (design)
**Scope**: `/dept-pool` overview page only.

## Problem / intent

The `/dept-pool` overview ("Department Pools / Pool Overview") currently shows only the **cash** view of each department pool: Balance, In/Out/Net (this month), Costing Submission — all derived from the `dept_pools` transaction table and the `dept_pool_balances` view, where inflow (`np_in`) is only recorded when a billing_payment voucher reaches `status='paid'`. There is no **accrual / billing** view anywhere: invoices billed for a pool that are not yet settled never appear.

The user wants the same overview page to switch between two bases:

- **Cash** (default) — what actually moved into/out of the pool (current behavior, unchanged).
- **Accrual (P&L)** — `bill − cost − expense − inter-billing` per department, using the existing cfo-reports per-pool P&L engine (consistent with `/reports/income-statement` and the Marketing P&L tab).

## Decisions (locked with user)

1. **Switch mechanism**: a top pill toggle `CASH | ACCRUAL · P&L`, driven by a new URL param `?basis=cash|accrual` (default `cash`). Two `<Link>`s, server-rendered — consistent with the page's existing "Past Month Submission" link toggle and the period param. `/dept-pool` stays a server component (no client state). One basis at a time; the whole table + hero change. Not a side-by-side dual table.
2. **Cash basis = zero change**: Balance / In (this month) / Out (this month) / Net (this month) / Costing Submission columns, the "Total pool deployed to Treasury" hero, and every existing query (`dept_pool_balances`, `dept_pools`, `get_hr_cost_submissions_list` RPC) remain exactly as-is.
3. **Accrual basis columns**: `DEPARTMENT · Revenue (bill) · − Cost · − Expense · − Inter-billing · = Net margin`. The Costing Submission column is dropped in this basis.
4. **Hero changes with basis**: cash → "Total pool deployed to Treasury" (unchanged); accrual → "Total net margin · P&L (<current period>)" = sum of per-pool margins.
5. **Period**: accrual P&L is computed for the page's currently-selected month period; the existing period selector is unchanged and reused.

## Accrual data derivation

- Source: the existing `fetchIncomeStatement` (`src/lib/cfo-reports.ts` `classifyRows`) for the page's period, which returns `PoolPnl` per pool slug.
- Map each department row on the page to its pool slug (`dept_pool_marketing` / `dept_pool_hr` / `dept_pool_finance` / `dept_pool_director_office` / `dept_pool_director`). A department with no matching `PoolPnl` for the period renders zeros (`RM 0.00` / `—`), not an error.
- Per-department accrual columns from that pool's `PoolPnl`:
  - **Revenue (bill)** = `PoolPnl.revenue` (accrual invoice revenue, grouped engine value).
  - **Cost** = `PoolPnl.cost`.
  - **Inter-billing** = sum of `PoolPnl.expenseLines` whose label starts with `"Inter-billing — "` (the mig-253 inter-billing expense convention). The engine folds inter-billing into `expense`; this is a **presentational split only** — it is subtracted out of the Expense column and shown as its own column. Totals are unchanged.
  - **Expense** = `PoolPnl.expense` − (the inter-billing portion above) = "other expense".
  - **Net margin** = `PoolPnl.margin` (the engine's value = `revenue − cost + otherIncome − expense`). **Precision note**: `margin` also includes an `otherIncome` term; dept pools are typically 0 there, but Net margin uses the engine `margin` (not a hand-recomputed `revenue − cost − expense − interBilling`) so it always ties exactly to `/reports/income-statement` and the Marketing P&L tab. If a pool has other income, Net margin still equals the engine margin (no divergence from the income statement).
- Hero (accrual) = Σ `PoolPnl.margin` over the pools shown.

## Architecture / isolation

- New pure helper in `src/lib/` (e.g. `dept-pool-accrual.ts`): given a `PoolPnl`, return `{ revenue, cost, expense, interBilling, netMargin }` — the only non-trivial logic is splitting the inter-billing lines out of `expense`. Pure, unit-testable.
- The page branches on `basis`: `cash` runs the existing code path untouched; `accrual` calls `fetchIncomeStatement` for the period + the helper per department.
- `fetchIncomeStatement` signature unchanged. Cash-path queries untouched.

## Testing

- Pure split helper unit tests: `PoolPnl` with inter-billing expense lines / without / multiple — assert `expense + interBilling === original PoolPnl.expense` and `netMargin === PoolPnl.margin` (the split never changes totals); zero/empty pool → all zeros.
- Department-name → pool-slug mapping unit test: every dept name maps to the correct pool key; unknown/no-pool dept → zeros, no throw.
- Cash basis: no regression — existing tests and queries unchanged; the default (`?basis` absent) renders exactly the current page.

## Out of scope

- The `/venture-pool` page (HV cash ledger, no billing layer) — unchanged.
- The cfo-reports P&L engine itself — unchanged.
- Any cash-basis query / the `dept_pool_balances` / `dept_pools` / HR-costing RPC — unchanged.
- No DB / migration changes.
- Per-department detail pages and their `?tab=pnl` — unchanged (row View/P&L links keep their current targets).

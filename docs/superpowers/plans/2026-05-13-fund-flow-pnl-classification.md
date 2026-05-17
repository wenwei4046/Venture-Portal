# Fund Flow & P&L Classification — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Drive the Income Statement / Cash Flow / Balance Sheet from `payment_categories.account_type` (classification) + `payment_voucher_sources.pool`, so loan/deposit principal stops counting as P&L expense, every line is categorised, and the P&L shows one section per pool plus a summary; also fix the fund-in "expected repayment date" semantics; and provide a full business-data wipe script.

**Architecture:** Rewrite the report aggregation layer (`src/lib/cfo-reports.ts`) to: pull paid payment vouchers (excluding `internal_transfer`) → join their `payment_voucher_sources` rows to `payment_categories` for `account_type` + `label` → split by `account_type` (`revenue`/`expense` → P&L; `asset`/`liability`/`equity` → Balance Sheet; all → Cash Flow) → group by `pool`. Treasury interest (GL 4010/4020/5010 from `journal_lines`) is folded into Venture Pool. Add DB constraints making `payment_categories.account_type` and `payment_voucher_sources.category_code` NOT NULL (applied after the wipe). Rewrite the three report pages around the new shapes.

**Tech Stack:** Next.js 15 App Router (Server Components), Supabase/Postgres (SQL migrations + RLS), TypeScript strict, Tailwind v3 (DESIGN.md v3.0 classes), Vitest + happy-dom, dayjs.

**Reference spec:** `docs/superpowers/specs/2026-05-13-fund-flow-pnl-classification-design.md`

**Constraints from CLAUDE.md:** Server Components by default; writes via Server Actions with `requireRole`; money is `decimal(15,2)`, display via `formatMoney`; dates via dayjs; no hardcoded hex (use `text-ink`/`bg-paper`/etc.); UI follows DESIGN.md v3.0 (`.page-head`, `.ledger-table`, `.sect-head`, `.num`); every bug fix ships with a regression test; extract pure logic into `src/lib/*.ts` and test the helper. **Do not `git push`** (user directive 2026-05-13). Local commits are fine.

**Run tests with:** `npm run test:ci` (single run) or `npx vitest run <path>` for one file. Build check: `npm run build`.

---

## File Structure

| File | Responsibility | New / Modify |
|---|---|---|
| `src/lib/pools.ts` | Pool taxonomy: `PoolKey` type, `POOL_LABEL` map, `poolLabel(key)`, `KNOWN_POOLS` ordered list | Create |
| `src/lib/pools.test.ts` | Tests for `poolLabel` fallback behaviour | Create |
| `src/lib/cfo-reports.ts` | Report aggregation: `fetchCashflowStatement`, `fetchIncomeStatement`, `fetchBalanceSheet` rebuilt around `account_type` + `pool` | Modify (substantial rewrite) |
| `src/lib/cfo-reports.test.ts` | Pure-function tests over mocked rows: classification routing, pool grouping, summary totals, internal_transfer exclusion, no "Uncategorised" | Create (or extend if exists) |
| `src/lib/fund-source-dates.ts` | Pure helpers: `firstRepaymentDate`, `expectedFullRepaymentDate(firstDate, lockInMonths)` | Create |
| `src/lib/fund-source-dates.test.ts` | Tests for the derived-date math | Create |
| `src/app/(portal)/reports/income-statement/page.tsx` | Per-pool P&L blocks + summary | Modify (rewrite render) |
| `src/app/(portal)/reports/cash-flow/page.tsx` | Per-pool cash flow blocks + net change | Modify (rewrite render) |
| `src/app/(portal)/reports/balance-sheet/page.tsx` | Existing snapshot + "Capital cash movements this period" section | Modify (add section) |
| `src/app/(portal)/settings/_components/CategoriesSection.tsx` | Make classification (`account_type`) a required field; helper text | Modify |
| `src/app/(portal)/payments/actions.ts` | `createPaymentCategory` requires `account_type` | Modify |
| `src/app/(portal)/fund-in/_components/NewFundSourceForm.tsx` | Relabel helper text for `repayment_date` ("first installment due"); show derived full-repayment date | Modify |
| `src/app/(portal)/fund-in/[id]/page.tsx` | Show derived "expected full repayment date" | Modify |
| `src/app/(portal)/fund-in/page.tsx` | (If it lists `repayment_date`) relabel column / show derived date | Modify |
| `supabase/migrations/20260101000234_payment_categories_account_type_not_null.sql` | `payment_categories.account_type` NOT NULL | Create |
| `supabase/migrations/20260101000235_pvs_category_code_required.sql` | `payment_voucher_sources.category_code` NOT NULL + must reference `payment_categories.code` | Create |
| `scripts/wipe-all-business-data.mjs` | Truncate all transactional tables, zero bank balances, keep reference/config | Create |
| `docs/DESIGN.md` | (If new report layout introduces a pattern worth documenting) — optional, only if a genuinely new component | Modify (optional) |

> **Investigation note for the executor:** before writing migration 234/235, confirm the highest existing migration number with `ls supabase/migrations` and bump if needed. Confirm `payment_vouchers` has columns `direction` (mig 59 — values `debit`/`credit`), `source_pool`/`target_pool` (mig 62), `voucher_type`. Confirm `payment_voucher_sources` columns are `voucher_id`, `pool`, `category_code` (mig 205), `amount`. Confirm `payment_categories` columns: `code`, `label`, `account_type` (mig 214; enum `account_type` = asset|liability|equity|revenue|expense), `gl_account_code`, `revenue_gl_account_code`, `is_active`. Confirm COA codes 4010 (Interest Income — Loans), 4020 (Penalty Income), 5010 (Interest Expense — Fund Sources) still exist (`SELECT code,name,type FROM chart_of_accounts`).

---

## Task 1: Pool taxonomy module

**Files:**
- Create: `src/lib/pools.ts`
- Test: `src/lib/pools.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/pools.test.ts
import { describe, it, expect } from 'vitest'
import { poolLabel, KNOWN_POOLS, POOL_LABEL } from './pools'

describe('poolLabel', () => {
  it('maps known pool keys to display labels', () => {
    expect(poolLabel('venture_pool')).toBe('Venture Pool')
    expect(poolLabel('dept_pool_marketing')).toBe('Marketing')
    expect(poolLabel('invoice_payout_pool')).toBe('Invoice Payout Pool')
    expect(poolLabel('operating_fund')).toBe('Operating Fund')
  })
  it('falls back to a humanised version of an unknown key', () => {
    expect(poolLabel('something_new')).toBe('Something New')
  })
  it('KNOWN_POOLS lists every key in POOL_LABEL, ordered', () => {
    expect(KNOWN_POOLS.every((k) => k in POOL_LABEL)).toBe(true)
    expect(KNOWN_POOLS[0]).toBe('venture_pool')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/pools.test.ts`
Expected: FAIL — `Cannot find module './pools'`.

- [ ] **Step 3: Write `src/lib/pools.ts`**

```ts
// src/lib/pools.ts
// Pool taxonomy used by the financial reports. Each money movement
// (payment_voucher_sources.pool) belongs to exactly one pool. Replaces the
// old GlSegment/SEGMENT_LABEL bucketing in the report layer.

export const POOL_LABEL: Record<string, string> = {
  venture_pool: 'Venture Pool',
  invoice_payout_pool: 'Invoice Payout Pool',
  dept_pool_marketing: 'Marketing',
  dept_pool_hr: 'HR',
  dept_pool_finance: 'Finance',
  dept_pool_director_office: 'Director Office',
  dept_pool_director: 'Director Pool',
  operating_fund: 'Operating Fund',
}

// Display order for report sections.
export const KNOWN_POOLS: string[] = [
  'venture_pool',
  'dept_pool_marketing',
  'dept_pool_hr',
  'dept_pool_finance',
  'dept_pool_director_office',
  'dept_pool_director',
  'invoice_payout_pool',
  'operating_fund',
]

export function poolLabel(key: string): string {
  if (key in POOL_LABEL) return POOL_LABEL[key]
  return key
    .split(/[_-]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

// Sort comparator: known pools first in KNOWN_POOLS order, then unknown
// pools alphabetically by label.
export function comparePools(a: string, b: string): number {
  const ia = KNOWN_POOLS.indexOf(a)
  const ib = KNOWN_POOLS.indexOf(b)
  if (ia !== -1 && ib !== -1) return ia - ib
  if (ia !== -1) return -1
  if (ib !== -1) return 1
  return poolLabel(a).localeCompare(poolLabel(b))
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/pools.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/pools.ts src/lib/pools.test.ts
git commit -m "feat: add pool taxonomy module for financial reports"
```

---

## Task 2: Fund-source date helpers (#2)

**Files:**
- Create: `src/lib/fund-source-dates.ts`
- Test: `src/lib/fund-source-dates.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/fund-source-dates.test.ts
import { describe, it, expect } from 'vitest'
import { expectedFullRepaymentDate, monthsBetween } from './fund-source-dates'

describe('expectedFullRepaymentDate', () => {
  it('adds lock_in_months to the first-installment date', () => {
    // First installment 2026-06-01, 12-month repayment period → fully repaid 2027-05-01
    // (12 installments: Jun 2026 ... May 2027)
    expect(expectedFullRepaymentDate('2026-06-01', 12)).toBe('2027-05-01')
  })
  it('handles a 1-month period (single installment = first installment)', () => {
    expect(expectedFullRepaymentDate('2026-06-15', 1)).toBe('2026-06-15')
  })
  it('handles month-end rollover', () => {
    // Jan 31 + 1 installment after = ... dayjs clamps to last day of Feb
    expect(expectedFullRepaymentDate('2026-01-31', 2)).toBe('2026-02-28')
  })
})

describe('monthsBetween', () => {
  it('counts whole months from effective date to first repayment', () => {
    expect(monthsBetween('2026-01-01', '2026-04-01')).toBe(3)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/fund-source-dates.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `src/lib/fund-source-dates.ts`**

```ts
// src/lib/fund-source-dates.ts
// Pure date helpers for fund sources. As of 2026-05-13 the field
// fund_sources.repayment_date means "the date the first installment is due",
// NOT the full-repayment date. The full-repayment date is derived from the
// first-installment date plus the repayment period (lock_in_months): there
// are `lock_in_months` monthly installments, the first on repayment_date,
// the last on repayment_date + (lock_in_months - 1) months.

import dayjs from 'dayjs'

export function expectedFullRepaymentDate(
  firstInstallmentDate: string,
  lockInMonths: number,
): string {
  const n = Math.max(1, Math.floor(lockInMonths))
  return dayjs(firstInstallmentDate).add(n - 1, 'month').format('YYYY-MM-DD')
}

export function monthsBetween(fromIso: string, toIso: string): number {
  return dayjs(toIso).diff(dayjs(fromIso), 'month')
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/fund-source-dates.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/fund-source-dates.ts src/lib/fund-source-dates.test.ts
git commit -m "feat: add fund-source repayment-date helpers"
```

---

## Task 3: Report aggregation rewrite — types & classification routing

**Files:**
- Modify: `src/lib/cfo-reports.ts` (full rewrite of the aggregation logic; keep the file path)
- Test: `src/lib/cfo-reports.test.ts` (new)

**Design of the new module (read before writing tests):**

- Export a pure function `classifyRows(input)` that takes the already-fetched raw rows and returns the assembled `IncomeStatement` / `CashflowStatement` / balance-sheet-movement structures. The Supabase-touching `fetch*` functions become thin wrappers that gather rows and call `classifyRows`. This keeps the testable logic pure (per CLAUDE.md testing convention).
- Raw row shape passed to `classifyRows`:

```ts
export interface RawPvSourceRow {
  voucherId: string
  voucherType: string                       // 'expense' | 'loan_disbursement' | 'loan_repayment' | 'internal_transfer' | ...
  direction: 'credit' | 'debit'             // credit = money in, debit = money out
  pool: string                              // payment_voucher_sources.pool
  categoryCode: string
  categoryLabel: string                     // payment_categories.label
  accountType: 'asset' | 'liability' | 'equity' | 'revenue' | 'expense'
  amount: number
}

export interface RawInvoiceRow {
  invoiceNo: string
  companyShortCode: string
  pool: string                              // derived from billing_mode (see fetchInvoicePool)
  amount: number                            // total_amount; counts as revenue inflow
}

export interface RawTreasury {
  interestIncome: number                    // GL 4010 net credit
  penaltyIncome: number                     // GL 4020 net credit
  interestExpense: number                   // GL 5010 net debit
}
```

- `classifyRows` rules:
  1. Skip any `RawPvSourceRow` with `voucherType === 'internal_transfer'`.
  2. For each remaining `RawPvSourceRow`:
     - `accountType === 'revenue'` → P&L revenue line (pool, label, amount) **and** cash inflow `revenue` line.
     - `accountType === 'expense'` → P&L expense line **and** cash outflow `expense` line.
     - `accountType === 'liability' | 'equity'` and `direction === 'credit'` → Balance-Sheet movement (pool, label, +amount) **and** cash inflow `fundIn` line.
     - `accountType === 'asset'` and `direction === 'debit'` → Balance-Sheet movement (pool, label, -amount) **and** cash outflow `capital` line.
     - `accountType === 'liability'` and `direction === 'debit'` → Balance-Sheet movement (pool, label, -amount) **and** cash outflow `capital` line.
     - `accountType === 'asset'` and `direction === 'credit'` → Balance-Sheet movement (+amount) **and** cash inflow `fundIn` line. (e.g. loan repayment principal received reduces Loans Receivable — actually a *decrease* in the asset; represent as inflow `fundIn`, BS movement -amount.) → **Treat: asset + credit = BS movement -amount, cash inflow fundIn.**
     - any other `accountType`/`direction` combo (e.g. `revenue` + `debit` = refund, `expense` + `credit` = expense recovery): net into the same P&L line with sign flipped (revenue refund → negative revenue; expense recovery → negative expense). Keep simple: a `revenue` row always lands in P&L revenue with `amount` if credit, `-amount` if debit; an `expense` row always lands in P&L expense with `amount` if debit, `-amount` if credit. Equivalent for BS rows: `liability`/`equity`/`asset` rows land as BS movement `+amount` if credit, `-amount` if debit, and as cash `fundIn` (credit) or `capital` (debit).
  3. For each `RawInvoiceRow`: add a P&L revenue line `(pool, "<companyShortCode> · <invoiceNo>", amount)` and a cash inflow `revenue` line.
  4. Treasury: add to the Venture Pool — P&L revenue lines "Interest income — Loans" (`interestIncome`), "Penalty income" (`penaltyIncome`, only if ≠ 0); P&L expense line "Interest expense — Fund sources" (`interestExpense`). Also `treasury.net = interestIncome + penaltyIncome - interestExpense`. (Cash effect of interest is already captured via the PV source rows for interest payments, so do NOT also add treasury to the cash flow — the journal-derived treasury figure is for the P&L only. Document this in a comment.)
  5. Build `PoolPnl[]` / `PoolCashflow[]` grouped by pool, sorted via `comparePools`. Drop pools with no lines on the relevant statement.
  6. Group totals = sum across pools. `groupNetProfit = Σ pool.margin` (treasury already folded into Venture Pool's revenue/expense lines, so do NOT add `treasury.net` again — it's inside the Venture Pool margin).

> **Subtle point for the executor:** decide once whether `treasury.net` is *inside* the Venture Pool margin or *added on top*. The plan's choice: **inside** (treasury interest lines are added to the Venture Pool's `revenueLines`/`expenseLines`). So `groupNetProfit = Σ pool.margin` with nothing extra. The `treasury` object is still exported so the UI can show the breakdown, but it must not be double-counted.

**Exported types** (final):

```ts
export interface Line { label: string; amount: number }

export interface PoolPnl {
  pool: string
  poolLabel: string
  revenueLines: Line[]
  expenseLines: Line[]
  revenue: number
  expense: number
  margin: number
}
export interface TreasuryBreakdown { interestIncome: number; penaltyIncome: number; interestExpense: number; net: number }
export interface IncomeStatement {
  pools: PoolPnl[]
  treasury: TreasuryBreakdown
  groupRevenue: number
  groupExpense: number
  groupNetProfit: number
}

export interface PoolCashflow {
  pool: string
  poolLabel: string
  inflow: { fundIn: Line[]; revenue: Line[]; total: number }
  outflow: { capital: Line[]; expense: Line[]; total: number }
  net: number
}
export interface CashflowStatement { pools: PoolCashflow[]; netChange: number }

export interface BalanceMovementLine { pool: string; poolLabel: string; label: string; amount: number }
// returned alongside the existing BalanceSheet snapshot
```

- [ ] **Step 1: Write the failing test** — `src/lib/cfo-reports.test.ts`

```ts
import { describe, it, expect } from 'vitest'
import { classifyRows } from './cfo-reports'
import type { RawPvSourceRow, RawInvoiceRow, RawTreasury } from './cfo-reports'

const pv = (o: Partial<RawPvSourceRow>): RawPvSourceRow => ({
  voucherId: 'v1', voucherType: 'expense', direction: 'debit',
  pool: 'dept_pool_marketing', categoryCode: 'logistics', categoryLabel: 'Logistics',
  accountType: 'expense', amount: 100, ...o,
})
const noTreasury: RawTreasury = { interestIncome: 0, penaltyIncome: 0, interestExpense: 0 }

describe('classifyRows', () => {
  it('routes revenue & expense rows into the P&L, by pool', () => {
    const out = classifyRows({
      pvSources: [
        pv({ accountType: 'expense', direction: 'debit', amount: 300, pool: 'dept_pool_marketing', categoryLabel: 'Logistics' }),
        pv({ accountType: 'revenue', direction: 'credit', amount: 1000, pool: 'dept_pool_marketing', categoryLabel: 'Service revenue', voucherType: 'other' }),
      ],
      invoices: [], treasury: noTreasury,
    })
    const mk = out.income.pools.find((p) => p.pool === 'dept_pool_marketing')!
    expect(mk.revenue).toBe(1000)
    expect(mk.expense).toBe(300)
    expect(mk.margin).toBe(700)
    expect(out.income.groupNetProfit).toBe(700)
  })

  it('does NOT put asset/liability/equity rows into the P&L (loan disbursement is BS only)', () => {
    const out = classifyRows({
      pvSources: [
        pv({ accountType: 'asset', direction: 'debit', amount: 50000, voucherType: 'loan_disbursement', categoryLabel: 'Amount due from / (to) - 2990', pool: 'venture_pool' }),
      ],
      invoices: [], treasury: noTreasury,
    })
    expect(out.income.groupNetProfit).toBe(0)
    expect(out.income.pools.find((p) => p.pool === 'venture_pool')?.expense ?? 0).toBe(0)
    // it shows up as a capital outflow in cash flow
    const vp = out.cashflow.pools.find((p) => p.pool === 'venture_pool')!
    expect(vp.outflow.capital.reduce((s, l) => s + l.amount, 0)).toBe(50000)
    // and as a balance-sheet movement (negative = asset acquired via cash out... here -amount)
    expect(out.balanceMovements.find((m) => m.label.includes('2990'))?.amount).toBe(-50000)
  })

  it('excludes internal_transfer vouchers entirely', () => {
    const out = classifyRows({
      pvSources: [
        pv({ accountType: 'expense', direction: 'debit', amount: 999, voucherType: 'internal_transfer' }),
      ],
      invoices: [], treasury: noTreasury,
    })
    expect(out.income.groupExpense).toBe(0)
    expect(out.cashflow.netChange).toBe(0)
  })

  it('counts every invoice as revenue, mapped to its pool, regardless of billing mode', () => {
    const invoices: RawInvoiceRow[] = [
      { invoiceNo: 'INV-1', companyShortCode: 'CONTS', pool: 'dept_pool_hr', amount: 4000 },
      { invoiceNo: 'INV-2', companyShortCode: 'OHANA', pool: 'venture_pool', amount: 1500 },
    ]
    const out = classifyRows({ pvSources: [], invoices, treasury: noTreasury })
    expect(out.income.pools.find((p) => p.pool === 'dept_pool_hr')!.revenue).toBe(4000)
    expect(out.income.pools.find((p) => p.pool === 'venture_pool')!.revenue).toBe(1500)
    expect(out.income.groupRevenue).toBe(5500)
  })

  it('folds treasury interest into the Venture Pool margin (not double-counted)', () => {
    const out = classifyRows({
      pvSources: [], invoices: [],
      treasury: { interestIncome: 1268.25, penaltyIncome: 0, interestExpense: 8430 },
    })
    const vp = out.income.pools.find((p) => p.pool === 'venture_pool')!
    expect(vp.revenue).toBeCloseTo(1268.25, 2)
    expect(vp.expense).toBeCloseTo(8430, 2)
    expect(vp.margin).toBeCloseTo(-7161.75, 2)
    expect(out.income.treasury.net).toBeCloseTo(-7161.75, 2)
    expect(out.income.groupNetProfit).toBeCloseTo(-7161.75, 2)  // only counted once
  })

  it('produces no "Uncategorised" lines — every line carries a real label', () => {
    const out = classifyRows({
      pvSources: [pv({ categoryLabel: 'Office Rental', accountType: 'expense' })],
      invoices: [], treasury: noTreasury,
    })
    const allLabels = out.income.pools.flatMap((p) => [...p.revenueLines, ...p.expenseLines].map((l) => l.label))
    expect(allLabels).not.toContain('Uncategorised')
    expect(allLabels).toContain('Office Rental')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/cfo-reports.test.ts`
Expected: FAIL — `classifyRows` not exported (module currently exports `fetchCashflowBuckets` etc.).

- [ ] **Step 3: Rewrite `src/lib/cfo-reports.ts`**

Replace the file contents. Keep `startOfMonth` / `endOfMonth` exports unchanged. Implement:
- The `Raw*` input types and the output types above.
- `classifyRows({ pvSources, invoices, treasury })` — pure, implements rules 1–6. Aggregate into `Map<pool, ...>` keyed structures, then materialise to arrays sorted with `comparePools` (import from `./pools`) and per-pool lines sorted by `amount` desc. Round money with a local `r2(n) = Math.round(n * 100) / 100`.
- `fetchIncomeStatement(supabase, { from, to })` — gather rows (see queries below) and return `classifyRows(...).income`.
- `fetchCashflowStatement(supabase, { from, to })` — return `classifyRows(...).cashflow`.
- `fetchBalanceSheet(supabase, { asOf })` — keep the existing snapshot logic, but also return `movements: BalanceMovementLine[]` for the period `[startOfYear(asOf) ... asOf]` (or accept an optional `{ from }`; simplest: movements for the current month — decide and document). Reuse `classifyRows(...).balanceMovements`.

**Supabase queries inside the `fetch*` wrappers:**
- Paid vouchers in window: `from('payment_vouchers').select('id, voucher_type, direction, amount, payment_date, status').eq('status','paid').gte('payment_date', from).lte('payment_date', to)`.
- Their sources: `from('payment_voucher_sources').select('voucher_id, pool, category_code, amount').in('voucher_id', voucherIds)`.
- Categories: `from('payment_categories').select('code, label, account_type')` → build `Map<code, {label, accountType}>`. (After migration 235 every source row has a valid code, but still guard: if a code somehow isn't found, throw — do not fall back to "Uncategorised".)
- Invoices: `from('invoices').select('invoice_no, total_amount, billing_mode, period_month, status, company_id, category_code').gte('period_month', from).lte('period_month', to).in('status', ['issued','paid','paid_via_netting'])`. Companies for short codes: `from('companies').select('id, short_code')`. Derive pool from `billing_mode` via a local map (`marketing_project → dept_pool_marketing`, `hr_attribution`/`hr_pool_split → dept_pool_hr`, `finance_attribution → dept_pool_finance`, `director_office_attribution`/`director_attribution → dept_pool_director_office`, `fixed_split` → `venture_pool` or the relevant pool, `non_billable` → still include under `venture_pool`); default unknown billing modes → `venture_pool` (do NOT drop). Document the map.
- Treasury: existing `fetchTreasurySection` logic, returning `{ interestIncome, penaltyIncome, interestExpense }` (drop the `net` from the raw shape; `classifyRows` computes it).

Keep backward-compat exports ONLY if other files import them — grep `fetchCashflowBuckets`, `fetchIncomeStatement`, `fetchBalanceSheet`, `SEGMENT_LABEL`, `GlSegment` across `src/` and update all call sites in the same task (the three report pages are the main ones; there may be a dashboard usage — check).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/cfo-reports.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Run the full unit suite + typecheck**

Run: `npm run test:ci` then `npm run build`
Expected: tests pass; build may fail on the report pages (next task fixes them) — that's OK for now, note it.

- [ ] **Step 6: Commit**

```bash
git add src/lib/cfo-reports.ts src/lib/cfo-reports.test.ts
git commit -m "feat: rebuild report aggregation around account_type + pool"
```

---

## Task 4: Income Statement page — per-pool blocks + summary

**Files:**
- Modify: `src/app/(portal)/reports/income-statement/page.tsx`

- [ ] **Step 1: Rewrite the render**

Replace the body so it:
- Calls `fetchIncomeStatement(supabase, { from, to })`.
- Renders one `<section>` per `stmt.pools[i]` using `.sect-head` (`<h2>{poolLabel}</h2>` + `.rule` + `.count` showing `MARGIN {formatMoney(margin)}`), each with a two-column (`grid grid-cols-1 md:grid-cols-2`) Revenue / Expense `.ledger-table` (rows = `{label}` + `.num` amount; expenses wrapped in `<span className="neg">`); for the Venture Pool block, the treasury interest lines are already in `revenueLines`/`expenseLines` (no special-casing needed) — optionally append a small caption "incl. loan interest" when `stmt.treasury.net !== 0`.
- Renders a final **Summary** section: `Group revenue {formatMoney(groupRevenue)}` − `Group expense {formatMoney(groupExpense)}` = `Group net profit {formatMoney(groupNetProfit)}` (serif, `text-2xl`, `text-ledger`/`text-danger` by sign), each pool's margin listed above it.
- Keep the `page-head` block, the `?period=` month picker, the "← Back to Reports" link.
- No hardcoded hex; use `text-ink`/`text-graphite`/`text-ledger`/`text-danger`/`bg-surface`/`border-hairline`.

(Provide the JSX in full when implementing — model the layout on the existing file and `src/app/(portal)/reports/cash-flow/page.tsx`.)

- [ ] **Step 2: Build + manual check**

Run: `npm run build` — expected: this page compiles.
Then with the dev server running, open `http://localhost:3000/reports/income-statement` — expected: renders without runtime error (data may be empty pre-wipe; that's fine — empty-state copy shows).

- [ ] **Step 3: Commit**

```bash
git add "src/app/(portal)/reports/income-statement/page.tsx"
git commit -m "feat: per-pool income statement with group summary"
```

---

## Task 5: Cash Flow page — per-pool blocks + net change

**Files:**
- Modify: `src/app/(portal)/reports/cash-flow/page.tsx`

- [ ] **Step 1: Rewrite the render**

Replace the body so it:
- Calls `fetchCashflowStatement(supabase, { from, to })`.
- Renders one block per `stmt.pools[i]`: `.sect-head` with `<h2>{poolLabel}</h2>` + `.count` showing `NET {formatMoney(net)}`. Inside, two `.ledger-table`s under sub-headings ("Inflow" / "Outflow"); Inflow rows split by `fundIn` (label prefix or a small "capital" tag) then `revenue`; Outflow rows split by `capital` then `expense`. Show `fundIn`/`revenue`/`capital`/`expense` subtotals and the inflow/outflow totals.
- Bottom **Net cash change** section: `formatMoney(netChange)` big, with a per-pool mini-list (pool label → net).
- Keep `page-head`, month picker, back link. No hardcoded hex.

- [ ] **Step 2: Build + manual check**

Run: `npm run build`; open `http://localhost:3000/reports/cash-flow` — expected: renders, empty-state OK.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(portal)/reports/cash-flow/page.tsx"
git commit -m "feat: per-pool cash flow statement"
```

---

## Task 6: Balance Sheet page — add capital-movements section

**Files:**
- Modify: `src/app/(portal)/reports/balance-sheet/page.tsx`

- [ ] **Step 1: Add the section**

Keep the existing snapshot. Below it, add a `<section>` "Capital cash movements" using `fetchBalanceSheet(...).movements`: a `.ledger-table` grouped by pool (sub-rows = `{label}` → `.num` amount, negative wrapped in `.neg`), with a per-pool subtotal and a grand total. Empty-state: "No capital movements this period."

- [ ] **Step 2: Build + manual check**

Run: `npm run build`; open `http://localhost:3000/reports/balance-sheet`.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(portal)/reports/balance-sheet/page.tsx"
git commit -m "feat: show period capital movements on the balance sheet"
```

---

## Task 7: Settings — make category classification required

**Files:**
- Modify: `src/app/(portal)/settings/_components/CategoriesSection.tsx`
- Modify: `src/app/(portal)/payments/actions.ts` (`createPaymentCategory`, and the edit action if separate)

- [ ] **Step 1: Form change**

In `CategoriesSection.tsx`: the create/edit form must include a required `<select name="account_type">` with options `revenue` / `expense` / `asset` / `liability` / `equity` (labelled e.g. "P&L · Revenue", "P&L · Expense", "BS · Asset", "BS · Liability", "BS · Equity"). Add helper text: "This classification decides whether the line shows on the P&L or the Balance Sheet, and in the revenue or expense section." Mark the field with the `<span className="text-danger">*</span>` convention.

- [ ] **Step 2: Action change**

In `payments/actions.ts` `createPaymentCategory` (and the update action): read `account_type` from the form, validate it's one of the five enum values, throw a clear error if missing/invalid, and include it in the insert/update. Keep `requireRole(['principal','finance'])` (match existing).

- [ ] **Step 3: Build + manual check**

Run: `npm run build`; open `http://localhost:3000/settings` → Categories tab → add a category without classification → expect the form to block it / action to throw.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(portal)/settings/_components/CategoriesSection.tsx" "src/app/(portal)/payments/actions.ts"
git commit -m "feat: require classification on payment categories"
```

---

## Task 8: Fund-in repayment-date relabel + derived date (#2)

**Files:**
- Modify: `src/app/(portal)/fund-in/_components/NewFundSourceForm.tsx`
- Modify: `src/app/(portal)/fund-in/[id]/page.tsx`
- Modify: `src/app/(portal)/fund-in/page.tsx` (if it displays `repayment_date`)
- (No DB migration — column unchanged; data wiped.)

- [ ] **Step 1: Form copy**

In `NewFundSourceForm.tsx`, the `repayment_date` field: keep the label "Expected repayment date"; change the helper `<p>` to "Date the first installment is due. Must be on or after the effective date." Add a `min` of today's date is wrong — it should be `min={effective_date}` if you can wire it, otherwise leave the validation to the action. Optionally, add a read-only computed line below it showing "Fully repaid by: <expectedFullRepaymentDate(repayment_date, lock_in_months)>" updated via React state (the form is already a Client Component) — import from `@/lib/fund-source-dates`.

- [ ] **Step 2: Detail page**

In `fund-in/[id]/page.tsx`, wherever `repayment_date` is shown, label it "Expected repayment date (first installment)" and add a derived row "Expected full repayment: {expectedFullRepaymentDate(fs.repayment_date, fs.lock_in_months)}".

- [ ] **Step 3: List page**

In `fund-in/page.tsx`, if a "Repayment date" column exists, keep it (it now means first installment); optionally add the derived full-repayment date as a sub-line. If `repayment_date` isn't shown there, no change.

- [ ] **Step 4: Check overdue/netting dependence**

Grep `repayment_date` across `src/` and `supabase/migrations/` — if any overdue-detection / netting logic computes "is this month due" from `repayment_date` assuming it's the full-repayment date, adjust to: an installment is due each month from `repayment_date` for `lock_in_months` months. If no such logic exists, note it and move on.

- [ ] **Step 5: Build + manual check**

Run: `npm run build`; open `http://localhost:3000/fund-in/new` — expected: helper text updated, derived date shows.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(portal)/fund-in/_components/NewFundSourceForm.tsx" "src/app/(portal)/fund-in/[id]/page.tsx" "src/app/(portal)/fund-in/page.tsx"
git commit -m "feat: repayment date now means first installment; derive full-repayment date"
```

---

## Task 9: Wipe script

**Files:**
- Create: `scripts/wipe-all-business-data.mjs`

- [ ] **Step 1: Write the script**

Model on existing `scripts/wipe-and-seed.mjs` / `scripts/wipe-test-data.mjs` (use `node --env-file=.env.local`, `@supabase/supabase-js` with the service-role key from env). Delete rows (in FK-safe order — children before parents) from: `journal_lines`, `journal_entries`, `payment_attachments`, `payment_voucher_sources`, `payment_vouchers`, `fund_source_repayments`, `repayments`, `overdue_records`, `loans`, `fund_sources`, `monthly_statement_lines`, `monthly_statements`, `invoices`, `dept_pools`, `venture_pool`, `invoice_payout_pool`, `operating_fund_transactions`, `director_payouts`, `director_ctc`, `salary_pool`, `payroll_runs`, `hr_staff_allocation`, `hr_pool_allocation`, `hr_staff_costs`, `claims`, `approval_requests`, `base_rate_history`, `config_audit_log`. Then `update bank_accounts set current_balance = 0`. Print a row-count summary before/after. Add a `--confirm` flag requirement so it can't run by accident.

> **Executor: verify the table list against `supabase/migrations` — there may be additional child tables (e.g. `fund_source_repayments` vs a differently-named table, `repayment_breakdown` columns, `dept_payment_requests`, `payroll_payment_requests`, credit-note tables from mig 225/227/231). Add any you find. Use `TRUNCATE ... CASCADE` per group where RLS/service-role allows, or ordered `DELETE`s. Do NOT touch `users`, `companies`, `departments`, `bank_accounts` (rows), `directors`, `payment_categories`, `treasury_config`, `tier_config`, `overdue_config`, `epf_lookup`, `socso_lookup`, `eis_lookup`, `pcb_lookup`, `rent_splits`, `utility_splits`, `service_contracts`, `chart_of_accounts`, `periods`.

- [ ] **Step 2: Dry-run / inspect (do NOT run against real data yet)**

The script must support a `--dry-run` that only prints the row counts it *would* delete. Run: `node --env-file=.env.local scripts/wipe-all-business-data.mjs --dry-run` — expected: prints counts, deletes nothing.

- [ ] **Step 3: Commit (script only — running it is a separate, user-gated step)**

```bash
git add scripts/wipe-all-business-data.mjs
git commit -m "feat: add full business-data wipe script"
```

---

## Task 10: DB constraints (applied after the wipe)

**Files:**
- Create: `supabase/migrations/20260101000234_payment_categories_account_type_not_null.sql`
- Create: `supabase/migrations/20260101000235_pvs_category_code_required.sql`

> Run this task's migrations only AFTER Task 9's wipe has been executed (so no existing rows violate them). The plan commits the migration files now; applying them to the DB is the user-gated step alongside the wipe.

- [ ] **Step 1: Migration 234**

```sql
-- 20260101000234_payment_categories_account_type_not_null.sql
-- Every payment category must declare a classification (Balance-Sheet vs P&L).
-- Pre-req: every row already has account_type set (verify before applying).
BEGIN;
-- Safety: fail loudly if any NULLs remain.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM payment_categories WHERE account_type IS NULL) THEN
    RAISE EXCEPTION 'payment_categories has rows with NULL account_type — backfill before applying';
  END IF;
END $$;
ALTER TABLE payment_categories ALTER COLUMN account_type SET NOT NULL;
COMMIT;
```

- [ ] **Step 2: Migration 235**

```sql
-- 20260101000235_pvs_category_code_required.sql
-- Every payment_voucher_sources row must carry a category that exists in
-- payment_categories. Pre-req: all transactional data wiped (no rows).
BEGIN;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM payment_voucher_sources s
    WHERE s.category_code IS NULL
       OR NOT EXISTS (SELECT 1 FROM payment_categories c WHERE c.code = s.category_code)
  ) THEN
    RAISE EXCEPTION 'payment_voucher_sources has rows with NULL/unknown category_code — clean up before applying';
  END IF;
END $$;
ALTER TABLE payment_voucher_sources ALTER COLUMN category_code SET NOT NULL;
ALTER TABLE payment_voucher_sources
  ADD CONSTRAINT pvs_category_code_fk
  FOREIGN KEY (category_code) REFERENCES payment_categories(code);
COMMIT;
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260101000234_payment_categories_account_type_not_null.sql supabase/migrations/20260101000235_pvs_category_code_required.sql
git commit -m "feat: require classification on categories and category on PV sources"
```

---

## Task 11: loan_disbursement PV carries a Balance-Sheet category

**Files:**
- Modify: whichever code path creates the auto PV when a loan/fund-out is approved (grep `loan_disbursement` in `src/` and `supabase/migrations/` — likely `src/app/(portal)/fund-out/actions.ts` and/or mig 196/199/213 RPCs; the per-source GL approval is mig 219/220).
- Possibly: a small migration to seed a default BS category per counterparty, or rely on the user having created `amount_due_from_to_<sub>` categories.

- [ ] **Step 1: Investigate**

Read the loan-creation / approval path. Determine where the `payment_voucher_sources` row for a disbursement is written and what `category_code` it gets. If it currently gets none / a non-BS one, change it to require a BS-classified category (`account_type IN ('asset','liability')`) — either chosen by Finance at loan-creation time (add a field to the new-loan form) or auto-mapped from the borrowing subsidiary (e.g. `amount_due_from_to_<short_code>`).

- [ ] **Step 2: Implement the smallest version**

Add a "Disbursement category" select to the new-loan form (`src/app/(portal)/fund-out/_components/NewLoanForm.tsx`), populated with categories where `account_type IN ('asset','liability')`; pass it through `createLoan` (`fund-out/actions.ts`) into the PV source row. Validate server-side that the chosen category is BS-classified.

- [ ] **Step 3: Test**

If pure logic is extractable (e.g. "is this category allowed for a disbursement"), add a unit test in `src/lib/`. Otherwise add a `describe.todo` stub noting the manual check.

- [ ] **Step 4: Build + commit**

Run: `npm run build`.

```bash
git add "src/app/(portal)/fund-out/..." "src/lib/..."
git commit -m "feat: loan disbursements must use a balance-sheet category"
```

---

## Task 12: Final sweep — remove dead code, run everything

**Files:**
- `src/lib/cfo-reports.ts` and any file that imported the removed `GlSegment`/`SEGMENT_LABEL`/`DEPT_SEGMENTS`/`fetchCashflowBuckets`.

- [ ] **Step 1: Grep for stragglers**

`grep -rn "GlSegment\|SEGMENT_LABEL\|DEPT_SEGMENTS\|fetchCashflowBuckets" src/` — expect zero hits (or only the new code). Fix any remaining call sites (e.g. dashboard, reports index page `reports/page.tsx`).

- [ ] **Step 2: Full test + build**

Run: `npm run test:ci` then `npm run build` — expected: all green.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "chore: remove legacy segment-bucketed report code"
```

- [ ] **Step 4: Hand back to the user**

Report: code changes done, NOT pushed. The wipe script + migrations 234/235 are committed but **not executed** — that's the user's call (run `scripts/wipe-all-business-data.mjs --confirm`, then apply migrations 234/235, then re-enter fund-in/out data with classifications).

---

## Self-Review

- **Spec §1 (data model & classification):** Tasks 1 (pool taxonomy), 7 (classification required in UI), 10 (DB NOT NULL constraints). ✔
- **Spec §2 (report aggregation rewrite):** Task 3 — `classifyRows` + the three `fetch*` wrappers, routing by `account_type`, grouping by `pool`, invoices included, treasury folded into Venture Pool, `internal_transfer` excluded. ✔
- **Spec §3 (UI):** Tasks 4 (income statement), 5 (cash flow), 6 (balance sheet), 7 (settings categories). ✔
- **Spec §4 (data wipe):** Task 9 (wipe script), Task 10 (constraints after wipe), Task 11 (loan_disbursement BS category so it can't re-leak). ✔
- **Spec §5 (repayment-date semantics):** Tasks 2 (date helpers) + 8 (form/detail/list relabel + derived date + overdue check). ✔
- **Spec §6 (testing):** Tests embedded in Tasks 1, 2, 3 (the meaningful pure-logic ones); manual QA steps in Tasks 4–11; final suite in Task 12. ✔
- **Open items from the spec** (FK ordering, `service_contracts` keep/wipe, fund-in inflow category path, one-vs-many BS categories): flagged inline as executor investigation notes in Tasks 9, 11, and the File-Structure note. The fund-in *inflow* (credit voucher) category path is the weakest-specified — Task 3's query notes that credit vouchers currently route via `target_pool` not `payment_voucher_sources`; the executor must check whether credit vouchers have source rows and, if not, either (a) extend the credit path to write a source row with a category, or (b) classify credit-direction vouchers by `voucher_type` (e.g. `loan_repayment` reference `fund_source` → fund-in). Recommend (a) for consistency; if it balloons, fall back to (b) and note it. **This is the one place the plan defers a real decision to execution — acceptable because it depends on reading the credit-voucher write path, but flagged here.**
- **Placeholder scan:** no "TBD/TODO/handle edge cases" left as instructions; the JSX for Tasks 4–6 is described rather than written out in full (the layouts are large and mirror existing files) — executor must write the full JSX following DESIGN.md v3.0 and the cited reference files. Test code blocks are complete.
- **Type consistency:** `classifyRows` returns `{ income: IncomeStatement, cashflow: CashflowStatement, balanceMovements: BalanceMovementLine[] }` — used consistently in Task 3 tests and Tasks 4–6. `poolLabel`/`comparePools`/`KNOWN_POOLS` from `src/lib/pools.ts` used in Tasks 1 and 3. `expectedFullRepaymentDate` from `src/lib/fund-source-dates.ts` used in Tasks 2 and 8.

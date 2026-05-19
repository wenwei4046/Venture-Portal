# Department Pools — Cash / Accrual Basis Toggle — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `?basis=cash|accrual` pill toggle to the `/dept-pool` overview: `cash` (default) keeps the current page exactly; `accrual` re-renders the by-department table + hero from the existing cfo-reports per-pool P&L engine (Revenue / Cost / Expense / Inter-billing / Net margin).

**Architecture:** A new pure helper module (`splitPoolAccrual` + `deptNameToPoolKey`, unit-tested) does the only non-trivial logic — splitting the inter-billing lines out of `PoolPnl.expense`. The server component `dept-pool/page.tsx` reads `?basis`, and on `accrual` takes an early return that fetches `fetchIncomeStatement` for the page period and renders the accrual hero+table; otherwise the existing cash code path runs byte-for-byte unchanged. A pill toggle (two `<Link>`s) is added to the page header.

**Tech Stack:** Next.js 15 App Router (server component), TypeScript strict, Tailwind (Ledger-Dense tokens), Vitest, Supabase JS, dayjs.

**Spec:** `docs/superpowers/specs/2026-05-18-dept-pool-cash-accrual-basis-design.md`

**Git:** branch `main` (user works directly on main). Every commit uses the explicit identity (repo has no global git identity) and is NOT pushed:
`git -c user.email="chew.acchouzs@gmail.com" -c user.name="wenwei4046" commit -m "..."`
Known pre-existing UNRELATED tsc errors live ONLY in `src/lib/loan-disbursement.test.ts` — ignore; just confirm no NEW errors in changed files. Verify: `npx vitest run`, `npx tsc --noEmit`, `npx next build`. If `next build` hits a stale `.next` OneDrive `EINVAL readlink`, `rm -rf .next` and rebuild.

---

## File Structure

- **Create** `src/lib/dept-pool-accrual.ts` — `deptNameToPoolKey(name)` (dept name → cfo-reports pool slug) + `splitPoolAccrual(pool)` (PoolPnl → `{revenue,cost,expense,interBilling,netMargin}`, splitting inter-billing out of expense). One responsibility: the accrual presentation transform. Pure, no I/O.
- **Create** `src/lib/dept-pool-accrual.test.ts` — unit tests for both.
- **Modify** `src/app/(portal)/dept-pool/page.tsx` — add `searchParams` prop + `basis`; add the CASH/ACCRUAL pill to the header; add an early-return accrual branch (its own header+pill, accrual hero, accrual table) placed AFTER `visible` is computed and BEFORE the cash-only queries, so the cash path is untouched and cash queries don't run in accrual mode.

---

## Task 1: Pure accrual helpers (TDD)

**Files:**
- Create: `src/lib/dept-pool-accrual.ts`
- Test: `src/lib/dept-pool-accrual.test.ts`

Context: `PoolPnl` (from `src/lib/cfo-reports.ts:117`) is `{ pool: string; poolLabel: string; revenueGroups: RevenueGroup[]; costLines: Line[]; otherIncomeLines: Line[]; expenseLines: Line[]; revenue: number; cost: number; otherIncome: number; expense: number; grossProfit: number; margin: number }`. `Line` = `{ label: string; amount: number }`. Inter-billing expense lines are produced in `classifyRows` as `` bump(p.expense, `Inter-billing — ${exp.invoiceNo}`, amt) `` (cfo-reports.ts:488) — so their `label` starts with the exact string `Inter-billing — ` (note the em dash `—`, U+2014, and the trailing space). Pool slugs are the cfo-reports keys: `dept_pool_marketing`, `dept_pool_hr`, `dept_pool_finance`, `dept_pool_director_office`, `dept_pool_director` (see `src/lib/pools.ts` `POOL_LABEL`).

- [ ] **Step 1: Write the failing tests** — `src/lib/dept-pool-accrual.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { deptNameToPoolKey, splitPoolAccrual } from './dept-pool-accrual'
import type { PoolPnl } from './cfo-reports'

function pnl(over: Partial<PoolPnl>): PoolPnl {
  return {
    pool: 'dept_pool_marketing',
    poolLabel: 'Marketing',
    revenueGroups: [],
    costLines: [],
    otherIncomeLines: [],
    expenseLines: [],
    revenue: 0,
    cost: 0,
    otherIncome: 0,
    expense: 0,
    grossProfit: 0,
    margin: 0,
    ...over,
  }
}

describe('deptNameToPoolKey', () => {
  it('maps each department name to its pool slug', () => {
    expect(deptNameToPoolKey('Marketing')).toBe('dept_pool_marketing')
    expect(deptNameToPoolKey('HR')).toBe('dept_pool_hr')
    expect(deptNameToPoolKey('Finance')).toBe('dept_pool_finance')
    expect(deptNameToPoolKey('Director Office')).toBe('dept_pool_director_office')
    expect(deptNameToPoolKey('Director')).toBe('dept_pool_director')
  })
  it('returns null for an unknown department', () => {
    expect(deptNameToPoolKey('Sales')).toBeNull()
    expect(deptNameToPoolKey('')).toBeNull()
  })
})

describe('splitPoolAccrual', () => {
  it('splits inter-billing out of expense; expense+interBilling === pool.expense; netMargin === pool.margin', () => {
    const p = pnl({
      revenue: 11000,
      cost: 0,
      expense: 6080, // 123 other + 5957 inter-billing
      expenseLines: [
        { label: 'FB Ads', amount: 123 },
        { label: 'Inter-billing — HV-INV-202605-0006', amount: 5000 },
        { label: 'Inter-billing — HV-INV-202605-0009', amount: 957 },
      ],
      margin: 4920,
    })
    const r = splitPoolAccrual(p)
    expect(r.revenue).toBe(11000)
    expect(r.cost).toBe(0)
    expect(r.interBilling).toBe(5957)
    expect(r.expense).toBe(123)
    expect(r.expense + r.interBilling).toBe(p.expense)
    expect(r.netMargin).toBe(4920)
  })

  it('no inter-billing lines → interBilling 0, expense unchanged', () => {
    const p = pnl({ revenue: 3000, expense: 500, expenseLines: [{ label: 'Postage', amount: 500 }], margin: 2500 })
    const r = splitPoolAccrual(p)
    expect(r.interBilling).toBe(0)
    expect(r.expense).toBe(500)
    expect(r.netMargin).toBe(2500)
  })

  it('null/undefined pool → all zeros', () => {
    expect(splitPoolAccrual(null)).toEqual({ revenue: 0, cost: 0, expense: 0, interBilling: 0, netMargin: 0 })
    expect(splitPoolAccrual(undefined)).toEqual({ revenue: 0, cost: 0, expense: 0, interBilling: 0, netMargin: 0 })
  })

  it('rounds the derived expense to 2dp (no float noise)', () => {
    const p = pnl({ expense: 100.3, expenseLines: [{ label: 'Inter-billing — X', amount: 0.1 }, { label: 'A', amount: 100.2 }], margin: -100.3 })
    const r = splitPoolAccrual(p)
    expect(r.interBilling).toBe(0.1)
    expect(r.expense).toBe(100.2)
  })
})
```

- [ ] **Step 2: Run, expect FAIL** — `npx vitest run src/lib/dept-pool-accrual.test.ts`
Expected: FAIL — `Cannot find module './dept-pool-accrual'`.

- [ ] **Step 3: Implement** — `src/lib/dept-pool-accrual.ts`:

```typescript
import type { PoolPnl } from './cfo-reports'

// Department.name (from the `departments` table) → cfo-reports pool slug
// (see src/lib/pools.ts POOL_LABEL). Names not present here have no P&L pool.
const DEPT_NAME_TO_POOL: Record<string, string> = {
  Marketing: 'dept_pool_marketing',
  HR: 'dept_pool_hr',
  Finance: 'dept_pool_finance',
  'Director Office': 'dept_pool_director_office',
  Director: 'dept_pool_director',
}

export function deptNameToPoolKey(name: string): string | null {
  return DEPT_NAME_TO_POOL[name] ?? null
}

export interface DeptPoolAccrual {
  revenue: number
  cost: number
  expense: number // non-inter-billing expense (inter-billing split out for display)
  interBilling: number // the inter-billing portion carved out of pool.expense
  netMargin: number // = pool.margin (engine value; ties to /reports/income-statement)
}

// classifyRows folds inter-billing into expense as lines labelled
// `Inter-billing — <invoiceNo>` (cfo-reports.ts). This carves that portion
// back out for a dedicated display column — a presentational split only;
// expense + interBilling === pool.expense and netMargin === pool.margin.
const INTER_BILLING_PREFIX = 'Inter-billing — '

function r2(n: number): number {
  return Math.round(n * 100) / 100
}

export function splitPoolAccrual(pool: PoolPnl | null | undefined): DeptPoolAccrual {
  if (!pool) return { revenue: 0, cost: 0, expense: 0, interBilling: 0, netMargin: 0 }
  const interBilling = r2(
    pool.expenseLines
      .filter((l) => l.label.startsWith(INTER_BILLING_PREFIX))
      .reduce((s, l) => s + l.amount, 0),
  )
  return {
    revenue: pool.revenue,
    cost: pool.cost,
    expense: r2(pool.expense - interBilling),
    interBilling,
    netMargin: pool.margin,
  }
}
```

(Copy the `Inter-billing — ` literal exactly — the dash is an em dash `—` U+2014 followed by a space, matching `cfo-reports.ts:488`. If unsure, `grep -n "Inter-billing" src/lib/cfo-reports.ts` and copy the character.)

- [ ] **Step 4: Run, expect PASS** — `npx vitest run src/lib/dept-pool-accrual.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Full suite + typecheck** — `npx vitest run` (all green) and `npx tsc --noEmit` (only the known `loan-disbursement.test.ts` errors).

- [ ] **Step 6: Commit**

```bash
git add src/lib/dept-pool-accrual.ts src/lib/dept-pool-accrual.test.ts
git -c user.email="chew.acchouzs@gmail.com" -c user.name="wenwei4046" commit -m "feat(dept-pool): pure accrual split + dept→pool mapping helpers"
```

---

## Task 2: `/dept-pool` page — basis toggle + accrual branch

**Files:**
- Modify: `src/app/(portal)/dept-pool/page.tsx`

Current page (verbatim, key anchors):
- `export default async function DeptPoolPage() {` (line 26) — NO props today. `const user = await requireRole([...])` (27), `const supabase = await createClient()` (28), dept_manager fast-path redirect (32–40), `const period = getPeriodMonth()` (42), departments query → `let visible = ...` filtered (45–54). Then cash-only: `dept_pool_balances` (59–65), `dept_pools` poolTxns (71–91), `get_hr_cost_submissions_list` RPC (96–108), `totalDeployed` (110–113), then the `return (...)` with header (117–140), hero (142–156), by-department table (158–247), footer note (249–251).
- Imports (lines 1–6): `Link`, `dayjs`, `redirect`, `requireRole`, `createClient`, `{ formatMoney, getPeriodMonth }`.

- [ ] **Step 1: Add imports + `searchParams` prop**

At the top, add:
```typescript
import { fetchIncomeStatement } from '@/lib/cfo-reports'
import { deptNameToPoolKey, splitPoolAccrual } from '@/lib/dept-pool-accrual'
```
Change the signature to accept Next.js 15 async `searchParams`:
```typescript
export default async function DeptPoolPage({
  searchParams,
}: {
  searchParams: Promise<{ basis?: string }>
}) {
```
Immediately after `const supabase = await createClient()` (line 28) add:
```typescript
  const { basis: basisParam } = await searchParams
  const basis = basisParam === 'accrual' ? 'accrual' : 'cash'
```

- [ ] **Step 2: Add the CASH/ACCRUAL pill to the existing header**

The existing header action `<div className="flex items-center gap-3 shrink-0">` (line 124) currently holds the "Past Month Submission" link and (for dept_manager) "New project contract". Insert the pill as the FIRST child of that div (before the "Past Month Submission" `<Link>`), so it shows in the cash render too:

```tsx
<div className="inline-flex border border-hairline rounded-md overflow-hidden font-mono text-xs">
  <Link
    href="/dept-pool?basis=cash"
    className={`px-4 py-2 transition-colors ${basis === 'cash' ? 'bg-ink text-paper' : 'text-graphite hover:text-ink'}`}
  >
    Cash
  </Link>
  <Link
    href="/dept-pool?basis=accrual"
    className={`px-4 py-2 transition-colors ${basis === 'accrual' ? 'bg-ink text-paper' : 'text-graphite hover:text-ink'}`}
  >
    Accrual · P&amp;L
  </Link>
</div>
```
(Use the design tokens `border-hairline`, `bg-ink`, `text-paper`, `text-graphite`, `text-ink` — no hex. This is purely additive to the cash render; it does not change any cash number/query.)

- [ ] **Step 3: Add the accrual early-return branch**

Insert this block AFTER the `visible` computation (after line 54, `visible = visible.filter(...)` / the end of the dept_manager filter) and BEFORE the `dept_pool_balances` query (line 59). It fully renders the accrual page and returns, so none of the cash-only queries run in accrual mode and the cash path stays byte-identical:

```tsx
  if (basis === 'accrual') {
    const from = dayjs(period).startOf('month').format('YYYY-MM-DD')
    const to = dayjs(period).endOf('month').format('YYYY-MM-DD')
    const income = await fetchIncomeStatement(supabase, { from, to })
    const poolByKey = new Map(income.pools.map((p) => [p.pool, p]))

    const rows = visible.map((dept) => {
      const key = deptNameToPoolKey(dept.name)
      const a = splitPoolAccrual(key ? poolByKey.get(key) ?? null : null)
      const slugByName: Record<string, string> = {
        Marketing: 'marketing',
        HR: 'hr',
        Finance: 'finance',
        'Director Office': 'director-office',
      }
      const slug = slugByName[dept.name]
      return { dept, a, href: slug ? `/dept-pool/${slug}` : null }
    })
    const totalNetMargin = rows.reduce((s, r) => s + r.a.netMargin, 0)

    return (
      <div>
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-4 mb-10">
          <div>
            <div className="page-eyebrow">
              <em>I.</em> DEPARTMENTS · POOL OVERVIEW
            </div>
            <h1 className="page-title">Department Pools</h1>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <div className="inline-flex border border-hairline rounded-md overflow-hidden font-mono text-xs">
              <Link href="/dept-pool?basis=cash" className="px-4 py-2 transition-colors text-graphite hover:text-ink">
                Cash
              </Link>
              <Link href="/dept-pool?basis=accrual" className="px-4 py-2 transition-colors bg-ink text-paper">
                Accrual · P&amp;L
              </Link>
            </div>
            <Link
              href="/dept-pool/submissions"
              className="bg-surface hover:bg-surface-2 border border-hairline text-ink font-serif italic text-sm px-4 py-2 rounded-md transition-colors"
            >
              Past Month Submission
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 mb-12 pb-12 border-b border-hairline">
          <div className="lg:col-span-7">
            <div className="font-serif italic text-accent text-base mb-1">
              Total net margin · P&amp;L ({dayjs(period).format('MMMM YYYY')})
            </div>
            <div className="font-serif text-[44px] md:text-hero text-ink leading-none">
              {formatMoney(totalNetMargin)}
            </div>
            <div className="font-mono text-xs text-muted mt-2">
              {visible.length} department{visible.length === 1 ? '' : 's'} visible · Period{' '}
              {dayjs(period).format('MMMM YYYY')}
            </div>
          </div>
        </div>

        <section className="mb-12">
          <h2 className="font-serif text-xl text-ink mb-1">By department</h2>
          {visible.length === 0 ? (
            <div className="border border-hairline rounded-md bg-surface p-6 text-center">
              <p className="font-serif italic text-muted text-sm">
                No departments visible to your role.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-hairline text-xs uppercase tracking-wide text-muted font-sans">
                    <th className="text-left py-3 pr-4 font-medium">Department</th>
                    <th className="text-right py-3 pr-4 font-medium">Revenue (bill)</th>
                    <th className="text-right py-3 pr-4 font-medium">− Cost</th>
                    <th className="text-right py-3 pr-4 font-medium">− Expense</th>
                    <th className="text-right py-3 pr-4 font-medium">− Inter-billing</th>
                    <th className="text-right py-3 pr-4 font-medium">= Net margin</th>
                    <th className="py-3 text-right font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ dept, a, href }) => (
                    <tr key={dept.id} className="border-b border-hairline last:border-0">
                      <td className="py-3 pr-4 font-serif text-md text-ink">{dept.name}</td>
                      <td className="py-3 pr-4 text-right font-mono tabular text-ledger">
                        {formatMoney(a.revenue)}
                      </td>
                      <td className="py-3 pr-4 text-right font-mono tabular text-graphite">
                        {a.cost === 0 ? formatMoney(0) : <span className="neg">{formatMoney(-a.cost)}</span>}
                      </td>
                      <td className="py-3 pr-4 text-right font-mono tabular text-graphite">
                        {a.expense === 0 ? formatMoney(0) : <span className="neg">{formatMoney(-a.expense)}</span>}
                      </td>
                      <td className="py-3 pr-4 text-right font-mono tabular text-graphite">
                        {a.interBilling === 0 ? formatMoney(0) : <span className="neg">{formatMoney(-a.interBilling)}</span>}
                      </td>
                      <td className="py-3 pr-4 text-right font-mono tabular font-semibold">
                        <span className={a.netMargin >= 0 ? 'text-ink' : 'text-danger'}>
                          {formatMoney(a.netMargin)}
                        </span>
                      </td>
                      <td className="py-3 text-right space-x-4">
                        {href ? (
                          <Link href={href} className="text-sm text-accent hover:text-accent-hover font-serif italic">
                            View
                          </Link>
                        ) : null}
                        {dept.name === 'Marketing' && href ? (
                          <Link href={`${href}?tab=pnl`} className="text-sm text-accent hover:text-accent-hover font-serif italic">
                            P&amp;L
                          </Link>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <p className="font-serif italic text-muted text-xs">
          Accrual basis — billed revenue − cost − expense − inter-billing, from the
          P&amp;L engine (ties to /reports/income-statement). Switch to Cash for actual pool movement.
        </p>
      </div>
    )
  }
```

(Note: `formatMoney` already renders negatives as red `(1,000.00)`; for the deduction columns we pass the negative and wrap in `<span className="neg">` consistent with the codebase money convention. `text-paper` is the page background token used for the active pill text on `bg-ink`.)

- [ ] **Step 4: Typecheck + build**

`npx tsc --noEmit` → no NEW errors referencing `dept-pool/page.tsx` (only the known `loan-disbursement.test.ts`).
`npx next build` → compiles; `/dept-pool` route builds. (Stale `.next` OneDrive `EINVAL readlink` → `rm -rf .next` and rebuild.)

- [ ] **Step 5: Cash-path regression check**

Confirm by reading the diff that everything from the old `dept_pool_balances` query (line 59) through the end of the function is unchanged EXCEPT the additive pill `<div>` inserted into the existing header action `<div>` (Step 2). The cash render output (Balance/In/Out/Net/Costing, "Total pool deployed to Treasury" hero, all three cash queries) is byte-identical when `?basis` is absent or `cash`.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(portal)/dept-pool/page.tsx"
git -c user.email="chew.acchouzs@gmail.com" -c user.name="wenwei4046" commit -m "feat(dept-pool): cash/accrual basis toggle on pool overview"
```

(Browser verification is auth-gated — deferred to the final task / user. Do NOT start a dev server.)

---

## Final Task: Whole-feature verification

- [ ] **Step 1:** `npx vitest run` → all pass incl. the new `dept-pool-accrual` tests. `npx tsc --noEmit` → only the known `loan-disbursement.test.ts` errors. `npx next build` → success; `/dept-pool` builds.
- [ ] **Step 2:** Update `C:\Users\User\.claude\projects\C--Users-User-OneDrive-Desktop-Venture\memory\project_state.md`: note the dept-pool cash/accrual toggle shipped + new HEAD.
- [ ] **Step 3:** Hand off browser verification to the user (auth-gated): `/dept-pool` (cash, unchanged) and `/dept-pool?basis=accrual` (Revenue/Cost/Expense/Inter-billing/Net margin; hero = total net margin; ties to `/reports/income-statement` for the same month). Deploy to Vercel prod only on explicit user request (standing directive: push/deploy only when asked — but this session the user has consistently chosen push+deploy after each feature; still confirm).

---

## Self-Review

**Spec coverage:**
- §Decision 1 (pill toggle, `?basis=cash|accrual` default cash, server-rendered `<Link>`s, one basis at a time, whole table+hero change) → Task 2 Steps 1–3. ✅
- §Decision 2 (cash basis zero change — queries, columns, hero, behavior) → Task 2 accrual is an early return placed BEFORE the cash queries; pill is additive to the header only; Step 5 regression check. ✅
- §Decision 3 (accrual columns Revenue/Cost/Expense/Inter-billing/Net margin; Costing column dropped) → Task 2 Step 3 accrual table. ✅
- §Decision 4 (hero changes: accrual = "Total net margin · P&L (period)") → Task 2 Step 3 accrual hero. ✅
- §Decision 5 (reuse existing month period; selector unchanged) → accrual uses `getPeriodMonth()`-derived `period` for `from`/`to`; no period-selector change. ✅
- §Accrual derivation (fetchIncomeStatement per period; dept→pool map; revenue=pool.revenue; cost=pool.cost; interBilling=Σ expenseLines starting `Inter-billing — `; expense=pool.expense−interBilling; netMargin=pool.margin; no-pool dept → zeros) → Task 1 helpers + Task 2 wiring. ✅
- §Architecture (pure helper in src/lib, unit-tested; page branches; fetchIncomeStatement signature unchanged; cash path untouched) → Task 1 + Task 2. ✅
- §Testing (split helper: with/without/multiple inter-billing, expense+interBilling===pool.expense, netMargin===pool.margin, zero/empty; dept→pool mapping incl. unknown→null; cash no regression) → Task 1 Step 1 (6 tests) + Task 2 Step 5. ✅
- §Out of scope (venture-pool, cfo-reports engine, cash queries, no DB/migration, detail pages/links) → nothing in those touched; row View/P&L links reproduced unchanged. ✅

**Placeholder scan:** No TBD/TODO/"similar to". Every code step has complete code. The `Inter-billing — ` literal is called out with the exact-character grep instruction (em dash U+2014 + space, matching cfo-reports.ts:488) — concrete, not a placeholder.

**Type consistency:** `splitPoolAccrual(pool: PoolPnl | null | undefined): DeptPoolAccrual` and `deptNameToPoolKey(name: string): string | null` defined in Task 1, consumed in Task 2 exactly (`splitPoolAccrual(key ? poolByKey.get(key) ?? null : null)`, `deptNameToPoolKey(dept.name)`). `DeptPoolAccrual` field names (`revenue/cost/expense/interBilling/netMargin`) match the Task 2 render. `fetchIncomeStatement(supabase, { from, to })` → `IncomeStatement.pools: PoolPnl[]` (cfo-reports.ts:139/117) consumed via `income.pools` / `p.pool`. `searchParams` typed `Promise<{ basis?: string }>` (Next 15 async). No drift.

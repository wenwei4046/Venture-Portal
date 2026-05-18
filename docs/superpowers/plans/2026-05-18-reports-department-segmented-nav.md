# Reports — Department-Segmented Navigation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the long vertical scroll on `/reports/income-statement` and `/reports/cash-flow` with a horizontal segmented tab bar (Summary first/default, one department per tab); Export follows the active tab.

**Architecture:** A shared client component `SegmentedReport` renders a sticky tab bar and shows only the active department's panel; the full statement is already fetched server-side so switching is client-state + shallow URL `?seg=` sync. Income Statement is already pool-first (reuse existing blocks). Cash Flow is section-first and is transposed to pool-first by a new pure function `pivotCashflowByPool`. Export routes/format builders gain a `seg` param and emit only that segment.

**Tech Stack:** Next.js 15 App Router, React client components, TypeScript strict, Tailwind (Ledger-Dense tokens), Vitest, `xlsx`, `@react-pdf/renderer`.

**Spec:** `docs/superpowers/specs/2026-05-18-reports-department-segmented-nav-design.md`

---

## File Structure

- Create `src/lib/cfo-reports-pivot.ts` — pure `pivotCashflowByPool` + types (kept out of the 1400-line `cfo-reports.ts`; re-exported from it for import-site stability).
- Create `src/lib/cfo-reports-pivot.test.ts` — unit tests for the pivot.
- Create `src/app/(portal)/reports/_components/SegmentedReport.tsx` — shared client tab component.
- Create `src/app/(portal)/reports/_components/SegmentExportButtons.tsx` — client Export buttons that read `?seg=`.
- Modify `src/lib/cfo-reports.ts` — re-export pivot from the new module.
- Modify `src/app/(portal)/reports/income-statement/page.tsx` — assemble segments, render `SegmentedReport`, swap export buttons.
- Modify `src/app/(portal)/reports/cash-flow/page.tsx` — pivot, assemble per-pool panels + summary, render `SegmentedReport`, swap export buttons.
- Modify income-statement export: `export/route.tsx`, `export/_format/xlsx.ts`, `export/_format/pdf.tsx` — accept + apply `seg`.
- Modify cash-flow export: `export/route.tsx`, `export/_format/xlsx.ts`, `export/_format/pdf.tsx` — accept + apply `seg` (via pivot).

Segment key convention (both reports): `"summary"` for the summary tab, otherwise the pool slug `PoolPnl.pool` / `CashflowPoolBlock.pool` (e.g. `dept_pool_marketing`). Labels via existing `poolLabel()`.

---

## Task 1: `pivotCashflowByPool` pure function (TDD)

**Files:**
- Create: `src/lib/cfo-reports-pivot.ts`
- Test: `src/lib/cfo-reports-pivot.test.ts`
- Modify: `src/lib/cfo-reports.ts` (re-export)

Transposes `CashflowStatement` (section → pool) into pool → section. Existing types referenced: `CashflowStatement`, `CashflowSection`, `CashflowPoolBlock`, `Line` from `@/lib/cfo-reports`; `CashFlowCategory` = `'operating' | 'investing' | 'financing'`.

- [ ] **Step 1: Write the failing test**

`src/lib/cfo-reports-pivot.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { pivotCashflowByPool } from './cfo-reports-pivot'
import type { CashflowStatement } from './cfo-reports'

const stmt: CashflowStatement = {
  netChange: 300,
  sections: [
    {
      category: 'operating',
      net: 250,
      pools: [
        { pool: 'dept_pool_marketing', poolLabel: 'Marketing',
          inflowLines: [{ label: 'Billing in', amount: 200 }],
          outflowLines: [{ label: 'Ad spend', amount: 50 }], net: 150 },
        { pool: 'venture_pool', poolLabel: 'Venture Pool',
          inflowLines: [{ label: 'Loan interest', amount: 100 }],
          outflowLines: [], net: 100 },
      ],
    },
    {
      category: 'investing',
      net: 0,
      pools: [],
    },
    {
      category: 'financing',
      net: 50,
      pools: [
        { pool: 'venture_pool', poolLabel: 'Venture Pool',
          inflowLines: [{ label: 'New deposit', amount: 50 }],
          outflowLines: [], net: 50 },
      ],
    },
  ],
}

describe('pivotCashflowByPool', () => {
  it('groups every section under its pool, preserving operating→investing→financing order', () => {
    const out = pivotCashflowByPool(stmt)
    const venture = out.pools.find((p) => p.pool === 'venture_pool')!
    expect(venture.sections.map((s) => s.category)).toEqual(['operating', 'investing', 'financing'])
    expect(venture.sections[0].net).toBe(100)
    expect(venture.sections[1].inflowLines).toEqual([])
    expect(venture.sections[2].net).toBe(50)
  })

  it('excludes pools with zero activity across all sections', () => {
    const out = pivotCashflowByPool(stmt)
    expect(out.pools.map((p) => p.pool).sort()).toEqual(['dept_pool_marketing', 'venture_pool'])
  })

  it('per-pool section nets sum back to the original section nets (no double count)', () => {
    const out = pivotCashflowByPool(stmt)
    const sumByCat = (cat: string) =>
      out.pools.reduce((acc, p) => acc + (p.sections.find((s) => s.category === cat)?.net ?? 0), 0)
    expect(sumByCat('operating')).toBe(250)
    expect(sumByCat('financing')).toBe(50)
  })

  it('orders pools via comparePools (known pools first, venture before dept pools)', () => {
    const out = pivotCashflowByPool(stmt)
    expect(out.pools[0].pool).toBe('venture_pool')
  })
}) 
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/cfo-reports-pivot.test.ts`
Expected: FAIL — `Cannot find module './cfo-reports-pivot'`.

- [ ] **Step 3: Write minimal implementation**

`src/lib/cfo-reports-pivot.ts`:

```typescript
import type { CashflowStatement, Line } from './cfo-reports'
import type { CashFlowCategory } from './coa'
import { comparePools } from './pools'

const SECTION_ORDER: CashFlowCategory[] = ['operating', 'investing', 'financing']

export interface CashflowPoolSection {
  category: CashFlowCategory
  inflowLines: Line[]
  outflowLines: Line[]
  net: number
}

export interface CashflowByPoolBlock {
  pool: string
  poolLabel: string
  sections: CashflowPoolSection[]
  net: number
}

export interface CashflowByPool {
  pools: CashflowByPoolBlock[]
  netChange: number
}

export function pivotCashflowByPool(stmt: CashflowStatement): CashflowByPool {
  const byPool = new Map<string, { poolLabel: string; sections: Map<CashFlowCategory, CashflowPoolSection> }>()

  for (const section of stmt.sections) {
    for (const pb of section.pools) {
      let entry = byPool.get(pb.pool)
      if (!entry) {
        entry = { poolLabel: pb.poolLabel, sections: new Map() }
        byPool.set(pb.pool, entry)
      }
      entry.sections.set(section.category, {
        category: section.category,
        inflowLines: pb.inflowLines,
        outflowLines: pb.outflowLines,
        net: pb.net,
      })
    }
  }

  const pools: CashflowByPoolBlock[] = [...byPool.entries()]
    .map(([pool, e]) => {
      const sections = SECTION_ORDER
        .map((cat) => e.sections.get(cat))
        .filter((s): s is CashflowPoolSection => s !== undefined)
      return {
        pool,
        poolLabel: e.poolLabel,
        sections,
        net: sections.reduce((a, s) => a + s.net, 0),
      }
    })
    .filter((p) => p.sections.length > 0)
    .sort((a, b) => comparePools(a.pool, b.pool))

  return { pools, netChange: stmt.netChange }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/cfo-reports-pivot.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Re-export from cfo-reports.ts**

In `src/lib/cfo-reports.ts`, add near the other exports (after the interface block, e.g. after line ~177):

```typescript
export {
  pivotCashflowByPool,
  type CashflowByPool,
  type CashflowByPoolBlock,
  type CashflowPoolSection,
} from './cfo-reports-pivot'
```

- [ ] **Step 6: Run full test suite + typecheck**

Run: `npx vitest run && npx tsc --noEmit`
Expected: all green (existing `cfo-reports.test.ts` unaffected).

- [ ] **Step 7: Commit**

```bash
git add src/lib/cfo-reports-pivot.ts src/lib/cfo-reports-pivot.test.ts src/lib/cfo-reports.ts
git -c user.email="chew.acchouzs@gmail.com" -c user.name="wenwei4046" commit -m "feat(reports): pivotCashflowByPool — transpose cash flow to pool-first"
```

---

## Task 2: `SegmentedReport` shared client component

**Files:**
- Create: `src/app/(portal)/reports/_components/SegmentedReport.tsx`

Client component: sticky tab bar (Ledger-Dense styling), renders only the active segment. Active key in state, initialised from `?seg=`, synced back via `router.replace` (shallow, scroll-preserving). Falls back to `defaultKey` when `?seg=` is missing or names a segment not in the list.

- [ ] **Step 1: Write the component**

`src/app/(portal)/reports/_components/SegmentedReport.tsx`:

```tsx
'use client'

import { useMemo, useState, useCallback } from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'

export interface ReportSegment {
  key: string
  label: string
  panel: React.ReactNode
}

export function SegmentedReport({
  segments,
  defaultKey,
}: {
  segments: ReportSegment[]
  defaultKey: string
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const validKeys = useMemo(() => new Set(segments.map((s) => s.key)), [segments])
  const urlSeg = searchParams.get('seg')
  const initial = urlSeg && validKeys.has(urlSeg) ? urlSeg : defaultKey
  const [active, setActive] = useState(initial)

  // If the URL seg is stale (period changed, pool gone), snap back.
  const effective = validKeys.has(active) ? active : defaultKey

  const select = useCallback(
    (key: string) => {
      setActive(key)
      const params = new URLSearchParams(searchParams.toString())
      params.set('seg', key)
      router.replace(`${pathname}?${params.toString()}`, { scroll: false })
    },
    [router, pathname, searchParams],
  )

  const activePanel = segments.find((s) => s.key === effective)?.panel ?? null

  return (
    <div>
      <div
        role="tablist"
        className="sticky top-0 z-10 -mx-1 mb-8 flex flex-wrap gap-x-1 border-b border-hairline bg-paper/95 backdrop-blur-sm"
      >
        {segments.map((s) => {
          const on = s.key === effective
          return (
            <button
              key={s.key}
              role="tab"
              aria-selected={on}
              onClick={() => select(s.key)}
              className={`px-3 py-2 font-mono text-[11px] uppercase tracking-[0.08em] border-b-2 transition-colors ${
                on
                  ? 'text-ink border-accent font-semibold'
                  : 'text-graphite border-transparent hover:text-ink'
              }`}
            >
              {s.label}
            </button>
          )
        })}
      </div>
      <div role="tabpanel">{activePanel}</div>
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(portal)/reports/_components/SegmentedReport.tsx"
git -c user.email="chew.acchouzs@gmail.com" -c user.name="wenwei4046" commit -m "feat(reports): SegmentedReport shared tab component"
```

---

## Task 3: `SegmentExportButtons` client component

**Files:**
- Create: `src/app/(portal)/reports/_components/SegmentExportButtons.tsx`

Replaces the two server-rendered Export `<Link>`s. Reads `?seg=` (written by `SegmentedReport`) and appends it so Export follows the active tab. Defaults to `summary` when absent (matches page default & export route default).

- [ ] **Step 1: Write the component**

`src/app/(portal)/reports/_components/SegmentExportButtons.tsx`:

```tsx
'use client'

import { useSearchParams } from 'next/navigation'

export function SegmentExportButtons({
  basePath,
  from,
  to,
}: {
  basePath: string // e.g. '/reports/income-statement/export'
  from: string
  to: string
}) {
  const seg = useSearchParams().get('seg') ?? 'summary'
  const href = (format: 'xlsx' | 'pdf') =>
    `${basePath}?format=${format}&from=${from}&to=${to}&seg=${encodeURIComponent(seg)}`
  const cls =
    'px-3 py-1.5 bg-surface hover:bg-surface-2 border border-hairline rounded-md text-xs font-mono text-graphite hover:text-ink transition-colors'
  return (
    <>
      <a href={href('xlsx')} className={cls}>Export Excel</a>
      <a href={href('pdf')} className={cls}>Export PDF</a>
    </>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(portal)/reports/_components/SegmentExportButtons.tsx"
git -c user.email="chew.acchouzs@gmail.com" -c user.name="wenwei4046" commit -m "feat(reports): SegmentExportButtons — export follows active tab"
```

---

## Task 4: Income Statement page → SegmentedReport

**Files:**
- Modify: `src/app/(portal)/reports/income-statement/page.tsx`

`PoolBlock` and `SummaryBlock` already exist in this file and are reused unchanged. Replace the `<div className="max-w-3xl space-y-12"> … pools.map … SummaryBlock</div>` block (currently ~lines 75–95) with a segments assembly. Replace the two export `<Link>`s in `page-head` with `<SegmentExportButtons>`.

- [ ] **Step 1: Add imports**

At the top of `src/app/(portal)/reports/income-statement/page.tsx` add:

```typescript
import { SegmentedReport, type ReportSegment } from '@/app/(portal)/reports/_components/SegmentedReport'
import { SegmentExportButtons } from '@/app/(portal)/reports/_components/SegmentExportButtons'
```

- [ ] **Step 2: Replace the export buttons in page-head**

Find the two `<Link …>Export Excel</Link>` / `Export PDF` anchors inside `<div className="shrink-0 flex items-center gap-3">` and replace just those two `<Link>` elements with:

```tsx
<SegmentExportButtons basePath="/reports/income-statement/export" from={from} to={to} />
```

(Keep the surrounding `<form>` month picker and the container div.)

- [ ] **Step 3: Replace the stacked body with SegmentedReport**

Replace the whole `<div className="max-w-3xl space-y-12"> … </div>` body block with:

```tsx
<div className="max-w-3xl">
  {stmt.pools.length === 0 ? (
    <div className="border border-hairline rounded-md bg-surface p-6 text-center">
      <p className="font-serif italic text-muted text-sm">
        No revenue or expense activity in this period. Issue invoices or pay
        expense vouchers to populate the income statement.
      </p>
    </div>
  ) : (
    <SegmentedReport
      defaultKey="summary"
      segments={[
        {
          key: 'summary',
          label: 'Summary',
          panel: <SummaryBlock stmt={stmt} />,
        },
        ...stmt.pools.map<ReportSegment>((p) => ({
          key: p.pool,
          label: p.poolLabel,
          panel: (
            <PoolBlock
              pool={p}
              showTreasuryNote={p.pool === 'venture_pool' && stmt.treasury.net !== 0}
            />
          ),
        })),
      ]}
    />
  )}
</div>
```

- [ ] **Step 4: Typecheck + build**

Run: `npx tsc --noEmit && npx next build`
Expected: PASS (no type errors; page compiles).

- [ ] **Step 5: Manual browser verification**

Start dev server (`npm run dev`), log in, open `/reports/income-statement`. Confirm: Summary tab is active by default; clicking a department tab swaps content without full reload; URL shows `?seg=dept_pool_marketing`; refresh keeps the tab; tab bar stays pinned while scrolling a long department. (Interactive client component — verified in browser, not unit-tested, per project testing conventions.)

- [ ] **Step 6: Commit**

```bash
git add "src/app/(portal)/reports/income-statement/page.tsx"
git -c user.email="chew.acchouzs@gmail.com" -c user.name="wenwei4046" commit -m "feat(reports): income statement department-segmented nav"
```

---

## Task 5: Cash Flow page → SegmentedReport (pivoted)

**Files:**
- Modify: `src/app/(portal)/reports/cash-flow/page.tsx`

Cash Flow is section-first. Use `pivotCashflowByPool` to get pool-first blocks. Each department panel renders that department's Operating/Investing/Financing line tables; the Summary panel is the existing "Net cash change · ALL SECTIONS" table (extract it into a `SummaryPanel` local component from the current JSX, unchanged content). Reuse the existing inflow/outflow row rendering.

- [ ] **Step 1: Add imports**

At the top of `src/app/(portal)/reports/cash-flow/page.tsx` add:

```typescript
import { pivotCashflowByPool, type CashflowByPoolBlock } from '@/lib/cfo-reports'
import { SegmentedReport, type ReportSegment } from '@/app/(portal)/reports/_components/SegmentedReport'
import { SegmentExportButtons } from '@/app/(portal)/reports/_components/SegmentExportButtons'
```

- [ ] **Step 2: Replace export buttons in page-head**

Replace the two `<Link>` Export anchors (inside `<div className="flex items-center gap-3 shrink-0">`) with:

```tsx
<SegmentExportButtons basePath="/reports/cash-flow/export" from={from} to={to} />
```

- [ ] **Step 3: Add a SummaryPanel + PoolCashflowPanel component**

Append these components to the file (after `CashflowSectionBlock`). `SECTION_INTRO` already exists in this file.

```tsx
function SummaryPanel({ stmt }: { stmt: import('@/lib/cfo-reports').CashflowStatement }) {
  return (
    <section className="border-t-2 border-hairline pt-6">
      <div className="sect-head">
        <h2>Net cash change</h2>
        <span className="rule" aria-hidden />
        <span className="count">ALL SECTIONS</span>
      </div>
      <table className="ledger-table">
        <tbody>
          {stmt.sections.map((s) => (
            <tr key={s.category}>
              <td>{SECTION_INTRO[s.category]}</td>
              <td className="num">
                {s.net < 0 ? <span className="neg">{formatMoney(s.net)}</span> : formatMoney(s.net)}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-hairline">
            <td className="font-serif italic text-ink font-medium">Net change this period</td>
            <td className={`num font-semibold ${stmt.netChange >= 0 ? 'text-ledger' : 'text-danger'}`}>
              <span className={`font-serif text-2xl font-semibold tabular tracking-[-0.01em] ${stmt.netChange >= 0 ? 'text-ledger' : 'text-danger'}`}>
                {formatMoney(stmt.netChange)}
              </span>
            </td>
          </tr>
        </tfoot>
      </table>
    </section>
  )
}

function PoolCashflowPanel({ block }: { block: CashflowByPoolBlock }) {
  return (
    <section>
      <div className="sect-head">
        <h2>{block.poolLabel}</h2>
        <span className="rule" aria-hidden />
        <span className={`count ${block.net >= 0 ? 'text-ledger' : 'text-danger'}`}>
          NET {formatMoney(block.net)}
        </span>
      </div>
      <div className="space-y-6">
        {block.sections.map((sec) => (
          <div key={sec.category}>
            <h3 className="font-serif italic text-accent text-sm mb-2">
              {SECTION_INTRO[sec.category]}
            </h3>
            <table className="ledger-table">
              <tbody>
                {sec.inflowLines.map((l) => (
                  <tr key={`in-${l.label}`}>
                    <td className="text-sm">{l.label}</td>
                    <td className="num text-ledger">
                      {l.amount < 0 ? <span className="neg">{formatMoney(l.amount)}</span> : formatMoney(l.amount)}
                    </td>
                  </tr>
                ))}
                {sec.outflowLines.map((l) => (
                  <tr key={`out-${l.label}`}>
                    <td className="text-sm">{l.label}</td>
                    <td className="num"><span className="neg">{formatMoney(-l.amount)}</span></td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-hairline">
                  <td className="font-serif italic text-graphite text-sm">{SECTION_INTRO[sec.category]} net</td>
                  <td className={`num font-semibold ${sec.net >= 0 ? 'text-ledger' : 'text-danger'}`}>
                    {sec.net < 0 ? <span className="neg">{formatMoney(sec.net)}</span> : formatMoney(sec.net)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        ))}
      </div>
    </section>
  )
}
```

- [ ] **Step 4: Replace the stacked body with SegmentedReport**

Replace the `<div className="max-w-3xl space-y-12"> … sections.map … Net cash change section …</div>` block with:

```tsx
<div className="max-w-3xl">
  {(() => {
    const pivot = pivotCashflowByPool(stmt)
    if (pivot.pools.length === 0) {
      return (
        <div className="border border-hairline rounded-md bg-surface p-6 text-center">
          <p className="font-serif italic text-muted text-sm">No cash activity in this period.</p>
        </div>
      )
    }
    return (
      <SegmentedReport
        defaultKey="summary"
        segments={[
          { key: 'summary', label: 'Summary', panel: <SummaryPanel stmt={stmt} /> },
          ...pivot.pools.map<ReportSegment>((b) => ({
            key: b.pool,
            label: b.poolLabel,
            panel: <PoolCashflowPanel block={b} />,
          })),
        ]}
      />
    )
  })()}
</div>
```

- [ ] **Step 5: Typecheck + build**

Run: `npx tsc --noEmit && npx next build`
Expected: PASS.

- [ ] **Step 6: Manual browser verification**

Open `/reports/cash-flow`. Confirm Summary default; each department tab shows that pool's Operating/Investing/Financing breakdown; per-section net + pool net tie to the old stacked numbers for the same period; URL `?seg=` sync + refresh + sticky bar all work.

- [ ] **Step 7: Commit**

```bash
git add "src/app/(portal)/reports/cash-flow/page.tsx"
git -c user.email="chew.acchouzs@gmail.com" -c user.name="wenwei4046" commit -m "feat(reports): cash flow department-segmented nav (pivoted)"
```

---

## Task 6: Income Statement export — `seg` filtering

**Files:**
- Modify: `src/app/(portal)/reports/income-statement/export/route.tsx`
- Modify: `src/app/(portal)/reports/income-statement/export/_format/xlsx.ts`
- Modify: `src/app/(portal)/reports/income-statement/export/_format/pdf.tsx`

`seg` semantics: `summary` (default) → only the group totals block; a pool slug → only that pool's block. Implemented by narrowing the `IncomeStatement` before passing to the existing builders, plus a `mode` flag so the builders know whether to emit the group-totals block.

- [ ] **Step 1: Add a `seg` param + selector in route.tsx**

In `src/app/(portal)/reports/income-statement/export/route.tsx`, after the `from`/`to` parsing and `const stmt = await fetchIncomeStatement(...)`, add:

```typescript
const seg = url.searchParams.get('seg') ?? 'summary'
const isSummary = seg === 'summary'
const pool = isSummary ? null : stmt.pools.find((p) => p.pool === seg) ?? null
if (!isSummary && !pool) {
  return Response.json({ error: 'unknown seg' }, { status: 400 })
}
const segLabel = isSummary ? 'summary' : seg
const filename = `income-statement-${segLabel}-${from}-${to}`
```

Then change the builder/element calls to pass the selection:

```typescript
if (format === 'xlsx') {
  return exportXlsxResponse({ filename, buffer: buildIncomeStatementXlsx(stmt, { pool }) })
}
return exportPdfResponse({
  filename,
  element: <IncomeStatementPdf stmt={stmt} periodLabel={periodLabel} pool={pool} />,
})
```

(Remove the old `const filename = \`income-statement-${from}-${to}\`` line — replaced above.)

- [ ] **Step 2: Update xlsx.ts to honor the selection**

Replace the body of `buildIncomeStatementXlsx` in `src/app/(portal)/reports/income-statement/export/_format/xlsx.ts` so it accepts an options arg and emits either one pool or the group totals:

```typescript
export function buildIncomeStatementXlsx(
  stmt: IncomeStatement,
  opts: { pool: PoolPnl | null },
): Buffer {
  const rows: (string | number | null)[][] = []
  const breaks: { afterRow: number; title: string }[] = []

  function appendPool(p: PoolPnl) {
    breaks.push({ afterRow: rows.length, title: `${p.poolLabel.toUpperCase()} POOL` })
    for (const l of p.revenueLines)    rows.push([l.label, l.amount, null, null, null])
    if (p.revenue !== 0)               rows.push(['Total revenue', p.revenue, null, null, null])
    for (const l of p.costLines)       rows.push([l.label, null, l.amount, null, null])
    if (p.cost !== 0)                  rows.push(['Total cost', null, p.cost, null, null])
    if (p.grossProfit !== 0)           rows.push(['Gross profit', null, null, p.grossProfit, null])
    for (const l of p.otherIncomeLines) rows.push([l.label, null, null, l.amount, null])
    for (const l of p.expenseLines)    rows.push([l.label, null, null, null, l.amount])
    if (p.expense !== 0)               rows.push(['Total expense', null, null, null, p.expense])
    rows.push(['Margin', null, null, null, p.margin])
  }

  if (opts.pool) {
    appendPool(opts.pool)
  } else {
    breaks.push({ afterRow: rows.length, title: 'GROUP TOTALS' })
    rows.push(['Group revenue',      stmt.groupRevenue,     null, null, null])
    rows.push(['Group cost',         null, stmt.groupCost,  null, null])
    rows.push(['Group gross profit', null, null, stmt.groupGrossProfit, null])
    rows.push(['Group other income', null, null, stmt.groupOtherIncome, null])
    rows.push(['Group expense',      null, null, null, stmt.groupExpense])
    rows.push(['Group net profit',   null, null, null, stmt.groupNetProfit])
  }

  return buildXlsxBuffer({
    sheetName: 'Income Statement',
    headerRow: ['Line', 'Revenue', 'Cost', 'Other Income', 'Expense'],
    rows,
    columnWidths: [38, 14, 14, 14, 14],
    sectionBreaks: breaks,
  })
}
```

- [ ] **Step 3: Update pdf.tsx to honor the selection**

In `src/app/(portal)/reports/income-statement/export/_format/pdf.tsx`, change the signature and body so it renders one pool or just group totals:

```tsx
export function IncomeStatementPdf({
  stmt,
  periodLabel,
  pool,
}: {
  stmt: IncomeStatement
  periodLabel: string
  pool: PoolPnl | null
}) {
  function poolRows(p: PoolPnl): (string | number | null)[][] {
    const out: (string | number | null)[][] = []
    for (const l of p.revenueLines)     out.push([l.label, l.amount, null, null, null])
    if (p.revenue !== 0)                out.push(['Total revenue', p.revenue, null, null, null])
    for (const l of p.costLines)        out.push([l.label, null, l.amount, null, null])
    if (p.cost !== 0)                   out.push(['Total cost', null, p.cost, null, null])
    if (p.grossProfit !== 0)            out.push(['Gross profit', null, null, p.grossProfit, null])
    for (const l of p.otherIncomeLines) out.push([l.label, null, null, l.amount, null])
    for (const l of p.expenseLines)     out.push([l.label, null, null, null, l.amount])
    if (p.expense !== 0)                out.push(['Total expense', null, null, null, p.expense])
    out.push(['Margin', null, null, null, p.margin])
    return out
  }

  return (
    <PdfDocument title="Income Statement" periodLabel={periodLabel}>
      {pool ? (
        <>
          <PdfSectionHead label={`${pool.poolLabel} Pool`} />
          <PdfTable columns={COLUMNS} rows={poolRows(pool)} numberFormat="money" />
        </>
      ) : (
        <>
          <PdfSectionHead label="Group Totals" />
          <PdfTable
            columns={COLUMNS}
            rows={[
              ['Group revenue',      stmt.groupRevenue, null, null, null],
              ['Group cost',         null, stmt.groupCost, null, null],
              ['Group gross profit', null, null, stmt.groupGrossProfit, null],
              ['Group other income', null, null, stmt.groupOtherIncome, null],
              ['Group expense',      null, null, null, stmt.groupExpense],
              ['Group net profit',   null, null, null, stmt.groupNetProfit],
            ]}
            numberFormat="money"
          />
        </>
      )}
    </PdfDocument>
  )
}
```

(Keep the existing `COLUMNS` const and imports; `React` import stays.)

- [ ] **Step 4: Typecheck + build**

Run: `npx tsc --noEmit && npx next build`
Expected: PASS.

- [ ] **Step 5: Manual verification**

With dev server running and logged in, hit these URLs and confirm the downloaded file content:
- `/reports/income-statement/export?format=xlsx&from=2026-05-01&to=2026-05-31&seg=summary` → only group totals.
- `…&seg=dept_pool_marketing` (use a pool present that period) → only Marketing pool, no group totals.
- `…&seg=bogus` → HTTP 400 `unknown seg`.
- Also click the on-page Export buttons on each tab; filename includes the segment.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(portal)/reports/income-statement/export/route.tsx" "src/app/(portal)/reports/income-statement/export/_format/xlsx.ts" "src/app/(portal)/reports/income-statement/export/_format/pdf.tsx"
git -c user.email="chew.acchouzs@gmail.com" -c user.name="wenwei4046" commit -m "feat(reports): income statement export filters to active segment"
```

---

## Task 7: Cash Flow export — `seg` filtering (pivoted)

**Files:**
- Modify: `src/app/(portal)/reports/cash-flow/export/route.tsx`
- Modify: `src/app/(portal)/reports/cash-flow/export/_format/xlsx.ts`
- Modify: `src/app/(portal)/reports/cash-flow/export/_format/pdf.tsx`

`seg=summary` → section-level net summary (operating/investing/financing nets + total). A pool slug → that pool's Operating/Investing/Financing breakdown, via `pivotCashflowByPool`.

- [ ] **Step 1: Add `seg` selector in route.tsx**

In `src/app/(portal)/reports/cash-flow/export/route.tsx`, after `const stmt = await fetchCashflowStatement(...)`:

```typescript
const seg = url.searchParams.get('seg') ?? 'summary'
const isSummary = seg === 'summary'
const block = isSummary ? null : pivotCashflowByPool(stmt).pools.find((p) => p.pool === seg) ?? null
if (!isSummary && !block) {
  return Response.json({ error: 'unknown seg' }, { status: 400 })
}
const filename = `cash-flow-${isSummary ? 'summary' : seg}-${from}-${to}`
```

Add the import at top:

```typescript
import { fetchCashflowStatement, pivotCashflowByPool } from '@/lib/cfo-reports'
```

(replacing the existing `import { fetchCashflowStatement } from '@/lib/cfo-reports'`), and change the response calls:

```typescript
if (format === 'xlsx') {
  return exportXlsxResponse({ filename, buffer: buildCashflowXlsx(stmt, { block }) })
}
return exportPdfResponse({
  filename,
  element: <CashflowPdf stmt={stmt} periodLabel={periodLabel} block={block} />,
})
```

(Remove the old `const filename = \`cash-flow-${from}-${to}\`` line.)

- [ ] **Step 2: Update xlsx.ts**

Rewrite `src/app/(portal)/reports/cash-flow/export/_format/xlsx.ts`:

```typescript
import { buildXlsxBuffer } from '@/lib/export/excel'
import type { CashflowStatement } from '@/lib/cfo-reports'
import type { CashflowByPoolBlock } from '@/lib/cfo-reports'

const CAT_LABEL: Record<string, string> = {
  operating: 'OPERATING',
  investing: 'INVESTING',
  financing: 'FINANCING',
}

export function buildCashflowXlsx(
  stmt: CashflowStatement,
  opts: { block: CashflowByPoolBlock | null },
): Buffer {
  const rows: (string | number | null)[][] = []
  const breaks: { afterRow: number; title: string }[] = []

  if (opts.block) {
    for (const sec of opts.block.sections) {
      breaks.push({ afterRow: rows.length, title: CAT_LABEL[sec.category] ?? sec.category.toUpperCase() })
      rows.push(['Inflows', null, null, null])
      for (const l of sec.inflowLines)  rows.push([`  ${l.label}`, l.amount, null, null])
      rows.push(['Outflows', null, null, null])
      for (const l of sec.outflowLines) rows.push([`  ${l.label}`, null, l.amount, null])
      rows.push([`${CAT_LABEL[sec.category] ?? sec.category} net`, null, null, sec.net])
    }
    rows.push([`${opts.block.poolLabel} net`, null, null, opts.block.net])
  } else {
    breaks.push({ afterRow: rows.length, title: 'NET CASH CHANGE' })
    for (const section of stmt.sections) {
      rows.push([`Section net (${section.category})`, null, null, section.net])
    }
    rows.push(['Total net change', null, null, stmt.netChange])
  }

  return buildXlsxBuffer({
    sheetName: 'Cash Flow',
    headerRow: ['Line', 'Inflow', 'Outflow', 'Net'],
    rows,
    columnWidths: [42, 14, 14, 14],
    sectionBreaks: breaks,
  })
}
```

- [ ] **Step 3: Update pdf.tsx**

Replace the whole body of `src/app/(portal)/reports/cash-flow/export/_format/pdf.tsx`. The existing file already defines `COLUMNS` (Line/Inflow/Outflow/Net), `CAT_TITLE`, and uses `orientation="landscape"`; keep those. New version:

```tsx
import React from 'react'
import { PdfDocument, PdfTable, PdfSectionHead } from '@/lib/export/pdf'
import type { CashflowStatement, CashflowByPoolBlock } from '@/lib/cfo-reports'

const COLUMNS = [
  { label: 'Line',    width: 360 },
  { label: 'Inflow',  width: 100, align: 'right' as const },
  { label: 'Outflow', width: 100, align: 'right' as const },
  { label: 'Net',     width: 100, align: 'right' as const },
]

const CAT_TITLE: Record<string, string> = {
  operating: 'Operating activities',
  investing: 'Investing activities',
  financing: 'Financing activities',
}

export function CashflowPdf({
  stmt,
  periodLabel,
  block,
}: {
  stmt: CashflowStatement
  periodLabel: string
  block: CashflowByPoolBlock | null
}) {
  return (
    <PdfDocument title="Cash Flow" periodLabel={periodLabel} orientation="landscape">
      {block ? (
        <>
          {block.sections.map((sec) => (
            <React.Fragment key={sec.category}>
              <PdfSectionHead label={CAT_TITLE[sec.category] ?? sec.category} />
              <PdfTable
                columns={COLUMNS}
                numberFormat="money"
                rows={[
                  ['Inflows', null, null, null],
                  ...sec.inflowLines.map((l) => [`  ${l.label}`, l.amount, null, null] as (string | number | null)[]),
                  ['Outflows', null, null, null],
                  ...sec.outflowLines.map((l) => [`  ${l.label}`, null, l.amount, null] as (string | number | null)[]),
                  [`${CAT_TITLE[sec.category] ?? sec.category} net`, null, null, sec.net],
                ]}
              />
            </React.Fragment>
          ))}
          <PdfSectionHead label={`${block.poolLabel} total`} />
          <PdfTable columns={COLUMNS} numberFormat="money" rows={[
            [`${block.poolLabel} net`, null, null, block.net],
          ]} />
        </>
      ) : (
        <>
          <PdfSectionHead label="Net cash change" />
          <PdfTable
            columns={COLUMNS}
            numberFormat="money"
            rows={[
              ...stmt.sections.map((s) => [`Section net (${s.category})`, null, null, s.net] as (string | number | null)[]),
              ['Total net change', null, null, stmt.netChange],
            ]}
          />
        </>
      )}
    </PdfDocument>
  )
}
```

- [ ] **Step 4: Typecheck + build**

Run: `npx tsc --noEmit && npx next build`
Expected: PASS.

- [ ] **Step 5: Manual verification**

Hit:
- `/reports/cash-flow/export?format=xlsx&from=2026-05-01&to=2026-05-31&seg=summary` → section nets + total only.
- `…&seg=venture_pool` (a pool present that period) → that pool's operating/investing/financing breakdown.
- `…&seg=bogus` → HTTP 400.
- Click on-page Export buttons per tab; filename carries the segment.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(portal)/reports/cash-flow/export/route.tsx" "src/app/(portal)/reports/cash-flow/export/_format/xlsx.ts" "src/app/(portal)/reports/cash-flow/export/_format/pdf.tsx"
git -c user.email="chew.acchouzs@gmail.com" -c user.name="wenwei4046" commit -m "feat(reports): cash flow export filters to active segment"
```

---

## Task 8: Final verification

- [ ] **Step 1: Full suite + build**

Run: `npx vitest run && npx tsc --noEmit && npx next build`
Expected: all tests pass (incl. the 4 new pivot tests), no type errors, build succeeds.

- [ ] **Step 2: Cross-report sanity in browser**

For a period with several active departments, on both `/reports/income-statement` and `/reports/cash-flow`:
- Summary is first + default.
- Each department tab matches the numbers the old stacked layout produced for that period.
- `?seg=` deep-link + refresh + sticky bar work.
- Export from a department tab downloads only that department; Summary tab exports only the summary; filenames carry the segment.
- Roles unchanged (still gated by the existing `requireRole` on page + export route).

- [ ] **Step 3: Update project memory**

Update `C:\Users\User\.claude\projects\C--Users-User-OneDrive-Desktop-Venture\memory\project_state.md`: clear the "IN FLIGHT (2026-05-18)" segmented-nav note (now shipped), and record HEAD moved.

---

## Self-Review

**Spec coverage:**
- §Architecture `SegmentedReport` → Task 2. ✅
- §"Export buttons become segment-aware" → Task 3 + wired in Tasks 4/5. ✅
- §"Export route + format changes" (both reports, `seg`, default summary, filename suffix) → Tasks 6, 7. ✅
- §2 Income Statement (reuse PoolBlock/SummaryBlock) → Task 4. ✅
- §3 Cash Flow pivot (`pivotCashflowByPool`, fetchers unchanged) → Task 1 + Task 5. ✅
- §4 Edge cases (Summary first/default, empty pool no tab, stale seg → summary, export no-seg → summary, roles unchanged) → SegmentedReport fallback (Task 2), empty-state guards (Tasks 4/5), route 400 + default (Tasks 6/7). ✅
- §5 Testing (`pivotCashflowByPool` unit tests; existing tests unaffected) → Task 1 steps 1–6. ✅
- §Out of scope (no fetcher signature change, other reports untouched) → honored; only pivot added, fetchers untouched. ✅

**Placeholder scan:** None. Every code step contains complete code (Task 7 Step 3 cash-flow `pdf.tsx` was filled in with the full rewritten file after reading the existing source). No "TBD"/"similar to"/"add error handling" placeholders.

**Type consistency:** `pivotCashflowByPool` / `CashflowByPool` / `CashflowByPoolBlock` / `CashflowPoolSection` defined in Task 1, re-exported from `cfo-reports.ts`, consumed with matching names in Tasks 5/7. `ReportSegment` defined in Task 2, used in Tasks 4/5. `SegmentExportButtons` props (`basePath`,`from`,`to`) consistent across Tasks 3/4/5. Builder option objects `{ pool }` (income) and `{ block }` (cash flow) consistent between each route and its format files.

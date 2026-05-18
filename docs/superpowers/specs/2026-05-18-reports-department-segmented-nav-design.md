# Reports — Department-Segmented Navigation

**Date**: 2026-05-18
**Status**: Approved (design)
**Scope**: `/reports/income-statement` and `/reports/cash-flow`

## Problem

Both reports stack one block per department (pool) vertically, then a Summary
at the end. With several departments the page is a long scroll that is hard to
read and hard to compare. The user wants a horizontal segmented tab bar so only
one department is shown at a time, with **Summary** as the first / default tab.

## Decisions (locked with user)

1. **Layout**: Option A — horizontal segmented tab bar (Ledger-Dense styling:
   mono uppercase labels, hairline bottom border, active tab gets an `accent`
   underline). Not the dark dock from the reference image — the dock clashed
   with the cream/paper report aesthetic.
2. **Scope**: applies to both Income Statement and Cash Flow.
3. **Cash Flow segmentation**: by department, consistent with Income Statement
   (requires pivoting Cash Flow's data hierarchy — see §3).
4. **Export**: exports the **currently-viewed department only** (not the whole
   report). Export buttons follow the active tab.
5. **Summary** is always the first tab and the default selection.

## Architecture

### Shared component: `SegmentedReport`

New client component at
`src/app/(portal)/reports/_components/SegmentedReport.tsx`.

- Props: `segments: { key: string; label: string; panel: React.ReactNode }[]`
  and `defaultKey: string` (always `"summary"`).
- Renders the segmented tab bar + only the active segment's `panel`.
- Tab bar is `sticky top-0` so it stays visible while scrolling a long
  single-department panel.
- Active segment is **client state**. The full statement is already fetched
  server-side in one call (`fetchIncomeStatement` / `fetchCashflowStatement`
  return all pools), so switching is instant with no DB re-query.
- Active segment is synced to the URL via `router.replace` (shallow) as
  `?seg=<key>`. This makes refresh / share / deep-link preserve the tab. On
  mount, initial active key = `?seg=` if present and valid, else `defaultKey`.
- This is a legitimate interactive client component under the project's
  "Server Components by default, Client Components for interactive widgets"
  convention.

### Export buttons become segment-aware

Because switching is client-state + shallow URL sync, the server component does
not re-render on tab change, so server-rendered export `href`s would be stale.

- Extract the `[Export Excel] [Export PDF]` links into a small **client**
  component that reads the active segment from the URL via `useSearchParams`
  (the same `?seg=` the `SegmentedReport` writes), and builds:
  `/reports/<report>/export?format=xlsx&from=…&to=…&seg=<active>`.
- It lives in the page header region (keeps existing `page-head` layout) but is
  a client island reading `?seg=`.

### Export route + format changes

For each of Income Statement and Cash Flow:

- `export/route.tsx` reads a new `seg` search param.
- `export/_format/xlsx.ts` and `export/_format/pdf.tsx` filter their output to
  the single segment named by `seg`.
- `seg` absent → default to `summary` (consistent with the page default).
- Filename gets a department suffix for disambiguation:
  - `income-statement-<seg>-<YYYYMMDD>.<ext>`
  - `cash-flow-<seg>-<YYYYMMDD>.<ext>`
  - Date-range variant keeps the existing `<from>-<to>` pattern with the `<seg>`
    inserted before the dates.

## §2 Income Statement changes (small)

Already pool-first (`stmt.pools.map → PoolBlock`, then `SummaryBlock`). The
existing `PoolBlock` and `SummaryBlock` components are reused unchanged; the
page just assembles them into a segments array:

```
segments = [
  { key: 'summary', label: 'Summary', panel: <SummaryBlock stmt=… /> },
  ...stmt.pools.map(p => ({ key: p.pool, label: p.poolLabel,
                            panel: <PoolBlock pool=p … /> })),
]
```

and renders `<SegmentedReport segments={segments} defaultKey="summary" />`.
No backend change.

## §3 Cash Flow changes (medium)

Currently section-first: `stmt.sections` (Operating / Investing / Financing),
each with nested `pools`. To show one department per tab, the hierarchy must be
transposed to pool-first.

- **Do not change** `fetchCashflowStatement` — export routes and
  `cfo-reports.test.ts` depend on its current shape.
- Add a **pure function** `pivotCashflowByPool(stmt)` in
  `src/lib/cfo-reports.ts` that pivots the already-fetched
  `CashflowStatement` into:
  `{ pools: { pool: string; poolLabel: string; sections: { operating; investing; financing } }[] }`
  where each section carries that pool's inflow/outflow lines and net.
- Each department panel renders that department's Operating / Investing /
  Financing breakdown (reusing the existing line-rendering markup, regrouped).
- The **Summary panel** = the existing "Net cash change · ALL SECTIONS"
  overview table (section-level nets + net change this period), unchanged.

## §4 Edge cases & invariants

- **Summary** is always present, first, and the default selected tab.
- A department with no activity in the period produces **no tab** (mirrors the
  current "empty block not rendered" behavior). Summary always renders.
- If the URL `?seg=` names a department that has no activity this period (e.g.
  stale shared link after the period changed), fall back to `summary`.
- Export with no `seg` → exports the Summary view.
- Role gating unchanged: Income Statement `principal/finance/hr`, Cash Flow
  `principal/finance`. Both the page and export routes keep their existing
  `requireRole(...)` calls.
- The month/period `<form>` selector and "← Back to Reports" link are
  unchanged and remain outside the segmented area.

## §5 Testing

- New unit tests for `pivotCashflowByPool`:
  - Per-pool section nets sum back to the original `stmt.sections[*].net`
    (no value lost or double-counted in the transpose).
  - Pools with zero activity are excluded from the pivot output.
  - Section ordering (operating → investing → financing) preserved within each
    pool.
- Existing `cfo-reports.test.ts` is unaffected (the underlying fetchers are not
  modified).
- Per project convention every change ships a regression test; the pivot is the
  riskiest new pure logic and is the focus of coverage.

## Out of scope

- The other report sub-pages (Balance Sheet, Trial Balance, Ledger, Fund
  Summary, Base Rate, Claims) — they are not department-stacked and are not
  changed.
- The `/reports` landing card grid — unchanged.
- No backend / DB / migration changes. No change to the `fetchIncomeStatement`
  or `fetchCashflowStatement` signatures.

# Export to Excel + PDF — 11 surfaces × 2 formats

**Date**: 2026-05-15
**Branch**: feat/fund-flow-pnl-classification
**Status**: Approved

## Problem

Finance has no way to export anything from the portal. Every report and listing is browser-only, so external sharing (email, audit pack, Director review) requires screenshots or manual rebuilding in Excel. Add a uniform "Export Excel" + "Export PDF" button to 11 user-facing surfaces.

## Scope

22 new download endpoints (11 surfaces × 2 formats), two shared libraries (Excel + PDF), 11 page edits to surface the buttons, and one new dependency (`@react-pdf/renderer`). No DB / migration changes.

### Surfaces covered (11)

**8 reports:**
1. Income Statement (`/reports/income-statement`)
2. Balance Sheet (`/reports/balance-sheet`)
3. Cash Flow (`/reports/cash-flow`)
4. Fund Summary (`/reports/fund-summary`)
5. Base Rate (`/reports/base-rate`)
6. Claims (`/reports/claims`)
7. Trial Balance (`/reports/trial-balance`)
8. General Ledger (`/reports/ledger`)

**3 listings:**
9. Invoices (`/statements`)
10. Monthly Statements (`/statements/monthly`)
11. Payment Vouchers (`/payments`)

### Out of scope

- Single-document formal PDFs (e.g. an issued invoice as a one-page document) — separate, future feature.
- Per-dept-pool exports (`/dept-pool/<slug>`) — same reasoning; add later if asked.
- Settings / Director Pool / HR Costing exports — not requested.
- Excel macros, CSV format, JSON format — only `.xlsx` and `.pdf` in this iteration.
- Bulk export (one file containing multiple reports) — out of scope.

## Architecture

```
src/lib/export/
├── excel.ts                  # Shared Excel helpers (uses existing xlsx ^0.18.5)
└── pdf.tsx                   # Shared PDF helpers (uses new @react-pdf/renderer)

src/app/(portal)/<each-surface>/export/
└── route.ts                  # 11 GET handlers, each supports ?format=xlsx|pdf

src/app/(portal)/<each-surface>/page.tsx
                              # 11 page edits: add [Export Excel] [Export PDF] buttons
```

Each route handler reuses the corresponding page's data fetcher (`fetchTrialBalance`, `fetchBalanceSheet`, etc.) and accepts the same searchParams. The export buttons forward the page's current searchParams to the export route so the exported file matches what's on screen.

## Shared library — Excel (`src/lib/export/excel.ts`)

Single public entry point. Mechanical row builder. Each surface composes one of these calls per export.

```ts
export interface XlsxSectionBreak {
  afterRow: number  // 0-based row index of last row in the section (header row excluded)
  title: string     // section title to insert as a bold row
}

export function buildXlsxBuffer(args: {
  sheetName: string                                // sheet tab name, max 31 chars
  headerRow: string[]                              // bold header row at top
  rows: (string | number | null)[][]               // data rows; null → blank cell
  columnWidths?: number[]                          // optional per-column widths in chars
  numberFormat?: string                            // default: '#,##0.00;(#,##0.00);—'
  sectionBreaks?: XlsxSectionBreak[]               // inserted as bold rows between data rows
}): Buffer
```

Implementation: uses `XLSX.utils.aoa_to_sheet`, sets cell number format on numeric cells, applies column widths via `worksheet['!cols']`. Section breaks are realized by interleaving title rows into the `rows` array before writing.

Default number format `'#,##0.00;(#,##0.00);—'` renders negatives as `(1,000.00)` (matches the on-screen `text-danger` red-parens convention) and zeros as a single em-dash `—` so blank entries are readable.

## Shared library — PDF (`src/lib/export/pdf.tsx`)

`@react-pdf/renderer` uses React-style components with its own `StyleSheet.create()`. We build composable wrappers so per-surface PDFs stay readable.

```tsx
export type PdfOrientation = 'portrait' | 'landscape'

export interface PdfColumn {
  label: string
  width: number          // in points (1pt = 1/72 inch); A4 width is 595pt
  align?: 'left' | 'right'
}

export function PdfDocument(props: {
  title: string
  subtitle?: string
  periodLabel: string
  orientation?: PdfOrientation  // default 'portrait'
  children: React.ReactNode
}): React.ReactElement

export function PdfSectionHead(props: { label: string }): React.ReactElement

export function PdfTable(props: {
  columns: PdfColumn[]
  rows: (string | number | null)[][]
  numberFormat?: 'money' | 'plain'  // 'money' formats with parens for negatives
}): React.ReactElement

export async function renderPdfBuffer(element: React.ReactElement): Promise<Buffer>
```

Visual conventions baked into `PdfDocument`:
- Page: A4, 36pt margin, portrait by default.
- Header: `HOUZS Venture Sdn Bhd · <title> · <periodLabel>` in serif 10pt across the top.
- Footer: `Generated <yyyy-mm-dd hh:mm> · Page X of Y` in mono 8pt, bottom-center, fixed via `<Page>`'s `render` prop.
- Tables: 0.5pt hairline border, 4pt cell padding, alternating row backgrounds at 4% gray.
- Money cells: mono font, right-aligned, negatives in parens, zeros as `—`.

`renderPdfBuffer` returns a Node `Buffer`. Implementation uses `@react-pdf/renderer`'s `pdf(element).toBuffer()` — confirmed Node-friendly (no headless browser needed).

## Route handler shape (template)

Every surface's `export/route.ts` follows the same shape. Trial Balance is the canonical example:

```ts
// src/app/(portal)/reports/trial-balance/export/route.ts
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { fetchTrialBalance } from '@/lib/cfo-reports'
import { buildTrialBalanceXlsx } from './_format/xlsx'
import { TrialBalancePdf } from './_format/pdf'
import { renderPdfBuffer } from '@/lib/export/pdf'
import dayjs from 'dayjs'

export async function GET(req: Request) {
  await requireRole(['principal', 'finance'])
  const url = new URL(req.url)
  const format = (url.searchParams.get('format') ?? 'xlsx') as 'xlsx' | 'pdf'
  const asOf = url.searchParams.get('as_of') ?? dayjs().format('YYYY-MM-DD')
  const showZero = url.searchParams.get('show_zero') === '1'

  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf)) {
    return Response.json({ error: 'invalid as_of date' }, { status: 400 })
  }

  const supabase = await createClient()
  const tb = await fetchTrialBalance(supabase, { asOf, showZeroBalance: showZero })

  const dateSuffix = asOf.replace(/-/g, '')
  if (format === 'xlsx') {
    const buf = buildTrialBalanceXlsx(tb)
    return new Response(buf, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="trial-balance-${dateSuffix}.xlsx"`,
      },
    })
  }
  if (format === 'pdf') {
    const buf = await renderPdfBuffer(<TrialBalancePdf tb={tb} />)
    return new Response(buf, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="trial-balance-${dateSuffix}.pdf"`,
      },
    })
  }
  return Response.json({ error: 'invalid format' }, { status: 400 })
}
```

Per-surface format builders live in `_format/xlsx.ts` and `_format/pdf.tsx` next to the route, keeping each surface's mapping logic isolated. Both files are kept short — they consume the page's data type (e.g. `TrialBalance`) and call into the shared `buildXlsxBuffer` / `<PdfDocument>` `<PdfTable>` helpers.

## Page edits — buttons

Each page's existing action area gains a small two-button cluster, positioned next to (or below) the existing action button. Concrete pattern, using TB as the example:

```tsx
<div className="flex items-center gap-2">
  <Link
    href={`/reports/trial-balance/export?format=xlsx&${exportQs}`}
    className="px-3 py-1.5 bg-surface hover:bg-surface-2 border border-hairline rounded-md text-xs font-mono text-graphite hover:text-ink transition-colors"
  >
    Export Excel
  </Link>
  <Link
    href={`/reports/trial-balance/export?format=pdf&${exportQs}`}
    className="px-3 py-1.5 bg-surface hover:bg-surface-2 border border-hairline rounded-md text-xs font-mono text-graphite hover:text-ink transition-colors"
  >
    Export PDF
  </Link>
</div>
```

`exportQs` is built server-side from the current page's resolved searchParams via `new URLSearchParams({...}).toString()`. Every relevant filter (as_of, from, to, code, show_zero, period, etc.) is forwarded so the export matches what's on screen.

## 11 surfaces — params + filename convention

| # | Surface | Route | Forwarded params | Filename pattern |
|---|---|---|---|---|
| 1 | Income Statement | `/reports/income-statement/export` | `from`, `to` | `income-statement-<from>-<to>.<ext>` |
| 2 | Balance Sheet | `/reports/balance-sheet/export` | `as_of` | `balance-sheet-<YYYYMMDD>.<ext>` |
| 3 | Cash Flow | `/reports/cash-flow/export` | `from`, `to` | `cash-flow-<from>-<to>.<ext>` |
| 4 | Fund Summary | `/reports/fund-summary/export` | `as_of` | `fund-summary-<YYYYMMDD>.<ext>` |
| 5 | Base Rate | `/reports/base-rate/export` | (none) | `base-rate-history-<YYYYMMDD>.<ext>` |
| 6 | Claims | `/reports/claims/export` | inspect `claims/page.tsx` and forward whichever searchParams it reads (likely a status or period filter) | `claims-<YYYYMMDD>.<ext>` |
| 7 | Trial Balance | `/reports/trial-balance/export` | `as_of`, `show_zero` | `trial-balance-<YYYYMMDD>.<ext>` |
| 8 | General Ledger | `/reports/ledger/export` | `code`, `from`, `to` | `ledger-<code>-<from>-<to>.<ext>` |
| 9 | Invoices | `/statements/export` | `period` | `invoices-<YYYYMM>.<ext>` |
| 10 | Monthly Statements | `/statements/monthly/export` | `period` | `statements-<YYYYMM>.<ext>` |
| 11 | Payment Vouchers | `/payments/export` | inspect `payments/page.tsx` and forward whichever filter searchParams it accepts (likely period / status / direction) | `payment-vouchers-<YYYYMMDD>.<ext>` |

Dates in filenames use `YYYYMMDD` (no separator) when they represent a single point in time; ranges use `YYYY-MM-DD` (with hyphens) so the two endpoints stay visually distinct.

## Page orientation (PDF)

| Surface | Orientation | Why |
|---|---|---|
| Cash Flow | landscape | per-pool Operating/Investing/Financing columns get wide |
| General Ledger | landscape | 6 columns including a Description column that wraps poorly in portrait |
| Trial Balance | portrait | 3 columns (Account, Debit, Credit) — fits comfortably |
| Balance Sheet | portrait | 2-column report, narrow |
| Income Statement | portrait | per-pool tables stacked vertically |
| Fund Summary, Base Rate, Claims | portrait | narrow datasets |
| Invoices, Monthly Statements, Payment Vouchers | landscape | 6-9 column listings |

Five surfaces total ship as landscape; the remaining six as portrait. The orientation is passed via the `PdfDocument` `orientation` prop and is selected per-surface inside the `<XxxPdf>` component.

## Permissions

Each export route calls `requireRole` with the same role list as its page:
- All 8 reports + Invoices + Statements + Payment Vouchers → `['principal', 'finance']`.
- HR and dept_manager get redirected by `requireRole` middleware (no export access).

## Error handling

- Invalid query params (malformed date, unknown account code, missing required param) → `Response.json({ error: ... }, { status: 400 })`.
- Underlying fetcher throws (e.g. `fetchLedger` rejecting a header code) → `Response.json({ error: err.message }, { status: 400 })`. The error message is surfaced to the user via the browser's download error UI, which is acceptable for an admin tool.
- Export library throws (xlsx encoding, pdf rendering) → `Response.json({ error: 'export failed: ' + err.message }, { status: 500 })`.

The buttons themselves are plain anchor tags — if the server returns JSON instead of a file, the browser opens the error in a new tab. Not pretty, but consistent with the existing `bank-transfer/route.ts` pattern in the codebase.

## Testing

**Shared lib unit tests** (deterministic, no Supabase):

1. `buildXlsxBuffer` returns a non-zero-length `Buffer` whose first bytes are the `PK\x03\x04` zip signature. Smoke check that headers + 2 data rows produce valid xlsx structure.
2. `buildXlsxBuffer` with a `sectionBreaks` argument places the section title rows at the expected positions (read back via `XLSX.read`).
3. `renderPdfBuffer(<PdfDocument title="X" periodLabel="Y">...</PdfDocument>)` returns a Buffer whose first 4 bytes are `%PDF`. Smoke check.

**Route handlers** are not unit-tested (per CLAUDE.md: mocking Supabase SSR is more trouble than it's worth). Verified by browser smoke during each task.

**Per-surface verification**: each task ends with a browser-based smoke (click Export Excel → file downloads, opens in Excel, content matches the on-screen view; same for PDF).

## Dependency change

`@react-pdf/renderer` is added to `package.json`. Recent stable version as of writing is `^4.x`. Add as a regular dependency (not devDependency) since route handlers consume it at runtime.

## Defaults

The brainstorm settled on these defaults:
- Button labels: "Export Excel" / "Export PDF" (English, mirrors existing UI).
- Excel number format: `#,##0.00;(#,##0.00);—` (negatives in parens, zero as em-dash).
- PDF page: A4. Portrait by default, landscape for the 5 wide surfaces listed above (Cash Flow, General Ledger, Invoices, Monthly Statements, Payment Vouchers).
- Filenames: hyphen-separated, date suffix follows pattern in the table.
- Excel single-sheet only. BS / TB section structure is rendered via bold in-sheet section header rows.
- No cover page, no table of contents, no logo image — minimal, YAGNI.

## Implementation cadence

The plan breaks into ~14 tasks. Each task ends in a committable, working state:

1. Add `@react-pdf/renderer` dependency.
2. `src/lib/export/excel.ts` + 2 unit tests.
3. `src/lib/export/pdf.tsx` + 1 unit test.
4. Trial Balance: `_format/xlsx.ts` + `_format/pdf.tsx` + `export/route.ts` + page buttons. (Acts as the template all subsequent surface tasks copy.)
5-11. Same shape for: Income Statement, Balance Sheet, Cash Flow, Fund Summary, Base Rate, Claims, General Ledger.
12-14. Same shape for: Invoices, Monthly Statements, Payment Vouchers.

Each surface task touches roughly 4 files (~100-150 lines total) and ships ~2 new endpoints. The first surface task locks in conventions; the rest are mechanical.

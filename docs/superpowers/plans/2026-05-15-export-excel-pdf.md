# Export Excel + PDF Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship 22 download endpoints (11 portal surfaces × 2 formats — Excel + PDF) so Finance can export every report and listing. Each page in scope gains two small "Export Excel" / "Export PDF" buttons that forward the current view's filters to the export route.

**Architecture:** Two shared libraries (`lib/export/excel.ts`, `lib/export/pdf.tsx`) provide the format primitives; a third (`lib/export/response.ts`) provides thin Response helpers. Each surface gets a co-located `export/route.ts` GET handler plus per-surface `_format/xlsx.ts` and `_format/pdf.tsx` files that translate the surface's data type into rows + a React-PDF tree. Route handlers reuse the page's existing data fetcher (`fetchTrialBalance`, etc.) so the exported content matches what's on screen.

**Tech Stack:** Next.js 15 App Router GET route handlers, TypeScript, existing `xlsx ^0.18.5` library, new `@react-pdf/renderer` dependency, Vitest + happy-dom for tests.

**Spec:** [docs/superpowers/specs/2026-05-15-export-excel-pdf.md](../specs/2026-05-15-export-excel-pdf.md)

## Signed-balance + filename conventions (recap)

- Money cells: `formatMoney` for Excel display strings (negatives `(1,000.00)`, zero `—`). PDF table reuses the same string via `numberFormat='money'` on `PdfTable`.
- Filename single-date suffix: `YYYYMMDD` (no separators). Range suffix: `YYYY-MM-DD-YYYY-MM-DD` (with hyphens).
- Per-surface route + filenames are in the spec's Surfaces table.

## File Structure

**New files:**
- `src/lib/export/excel.ts` — `buildXlsxBuffer` + types
- `src/lib/export/pdf.tsx` — `PdfDocument`, `PdfTable`, `PdfSectionHead`, `renderPdfBuffer` + types
- `src/lib/export/response.ts` — `exportXlsxResponse`, `exportPdfResponse` (thin Response wrappers)
- `src/lib/export/excel.test.ts` — 2 unit tests
- `src/lib/export/pdf.test.ts` — 1 unit test
- 11 × `src/app/(portal)/<surface>/export/route.ts` — GET handlers
- 11 × `src/app/(portal)/<surface>/export/_format/xlsx.ts` — surface→xlsx mapping
- 11 × `src/app/(portal)/<surface>/export/_format/pdf.tsx` — surface→pdf mapping

**Modified files:**
- `package.json` + `package-lock.json` — add `@react-pdf/renderer`
- 11 × `src/app/(portal)/<surface>/page.tsx` (or its tab header for listings) — add the two Export buttons

---

### Task 1: Add `@react-pdf/renderer` dependency

**Files:**
- Modify: `package.json`, `package-lock.json`

This task only adds the dependency so subsequent tasks can import it. No code change yet.

- [ ] **Step 1: Install the package**

```bash
cd "C:\Users\User\OneDrive\Desktop\Venture\Venture-Portal"
npm install @react-pdf/renderer
```

Expected: a new line in `package.json` `dependencies` like `"@react-pdf/renderer": "^4.x"`. Lockfile updated. No `peerDependency` warnings worth acting on (Node + React are within range).

- [ ] **Step 2: Verify the install**

```bash
node -e "console.log(require('@react-pdf/renderer/package.json').version)"
```

Expected: prints a version string starting `4.` (or whatever the resolved major was).

- [ ] **Step 3: Confirm existing tests + TS still pass**

```bash
npm run test:ci 2>&1 | tail -5
```

Expected: 201 passing (unchanged from prior state).

```bash
npx tsc --noEmit 2>&1 | tail -5
```

Expected: no new errors. Pre-existing unrelated errors in `payments/page.tsx`, `approvals/actions.ts`, etc., are not your concern.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git -c user.email="chew.acchouzs@gmail.com" -c user.name="wenwei4046" commit -m "build(export): add @react-pdf/renderer dependency"
```

---

### Task 2: `lib/export/excel.ts` + 2 unit tests

**Files:**
- Create: `src/lib/export/excel.ts`
- Create: `src/lib/export/excel.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/export/excel.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import * as XLSX from 'xlsx'
import { buildXlsxBuffer } from './excel'

describe('buildXlsxBuffer', () => {
  it('returns a non-empty .xlsx buffer (PK zip signature) for a basic sheet', () => {
    const buf = buildXlsxBuffer({
      sheetName: 'Sheet1',
      headerRow: ['Code', 'Name', 'Amount'],
      rows: [
        ['3000', 'Cash & Bank', 1000],
        ['3030', 'AR — Subs',   2000],
      ],
    })
    expect(buf.length).toBeGreaterThan(100)
    // .xlsx files are ZIPs — first 4 bytes are 'PK\x03\x04'.
    expect(buf[0]).toBe(0x50) // P
    expect(buf[1]).toBe(0x4b) // K
    expect(buf[2]).toBe(0x03)
    expect(buf[3]).toBe(0x04)
  })

  it('inserts section break rows between data rows', () => {
    const buf = buildXlsxBuffer({
      sheetName: 'TB',
      headerRow: ['Account', 'Debit', 'Credit'],
      rows: [
        ['3000', 1000, null],
        ['3030', 2000, null],
        ['4000', null, 1500],
      ],
      sectionBreaks: [
        { afterRow: 1, title: 'ASSETS' },        // section header BEFORE row index 0
        { afterRow: 3, title: 'LIABILITIES' },   // section header BEFORE row index 2
      ],
    })
    const wb = XLSX.read(buf, { type: 'buffer' })
    const sheet = wb.Sheets['TB']
    // Re-read the sheet into a 2D array and look for the section headers.
    const grid: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 })
    // grid[0] is the header row.
    // section header titles appear somewhere in the first column. Be lenient
    // about the exact row index (rounding behavior may insert blanks).
    const flat = grid.flat().map(String)
    expect(flat).toContain('ASSETS')
    expect(flat).toContain('LIABILITIES')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/lib/export/excel.test.ts 2>&1 | tail -15
```

Expected: both tests FAIL with errors about `buildXlsxBuffer` not being exported.

- [ ] **Step 3: Implement `buildXlsxBuffer`**

Create `src/lib/export/excel.ts`:

```ts
import * as XLSX from 'xlsx'

export interface XlsxSectionBreak {
  /**
   * Insert the section title row BEFORE this data-row index. Use 0 to put a
   * title at the top of the data; use `rows.length` to append one at the end.
   * `afterRow` semantics mirror Array.splice insertion points — the title is
   * inserted at the given index, pushing the original row to index+1.
   */
  afterRow: number
  title: string
}

export interface BuildXlsxArgs {
  sheetName: string
  headerRow: string[]
  rows: (string | number | null)[][]
  columnWidths?: number[]              // in characters, per column
  numberFormat?: string                // applied to numeric cells; default: '#,##0.00;(#,##0.00);—'
  sectionBreaks?: XlsxSectionBreak[]
}

const DEFAULT_NUMBER_FORMAT = '#,##0.00;(#,##0.00);—'

/**
 * Build an .xlsx file as a Node Buffer. Single-sheet, single-header, optional
 * section title rows interleaved between data rows.
 *
 * Per-cell number formatting is applied to numeric values only. String cells
 * are left untouched. `null` values render as blank cells.
 */
export function buildXlsxBuffer(args: BuildXlsxArgs): Buffer {
  const numberFormat = args.numberFormat ?? DEFAULT_NUMBER_FORMAT

  // 1. Interleave section title rows into the data rows.
  const rows: (string | number | null)[][] = []
  const breaks = (args.sectionBreaks ?? []).slice().sort((a, b) => a.afterRow - b.afterRow)
  let nextBreak = 0
  for (let i = 0; i <= args.rows.length; i++) {
    while (nextBreak < breaks.length && breaks[nextBreak].afterRow === i) {
      rows.push([breaks[nextBreak].title])
      nextBreak += 1
    }
    if (i < args.rows.length) {
      rows.push(args.rows[i])
    }
  }

  // 2. Build the sheet, with header at the top.
  const aoa: (string | number | null)[][] = [args.headerRow, ...rows]
  const sheet = XLSX.utils.aoa_to_sheet(aoa)

  // 3. Apply column widths if supplied.
  if (args.columnWidths && args.columnWidths.length > 0) {
    sheet['!cols'] = args.columnWidths.map((w) => ({ wch: w }))
  }

  // 4. Apply number format to every numeric cell (skip the header row at index 0).
  const range = XLSX.utils.decode_range(sheet['!ref'] ?? 'A1')
  for (let r = 1; r <= range.e.r; r++) {
    for (let c = range.s.c; c <= range.e.c; c++) {
      const addr = XLSX.utils.encode_cell({ r, c })
      const cell = sheet[addr] as { t?: string; v?: unknown; z?: string } | undefined
      if (cell && cell.t === 'n') {
        cell.z = numberFormat
      }
    }
  }

  // 5. Bold the header row by writing a separate cell style array.
  //    xlsx 0.18 doesn't ship styles in the community build; skip bold for now.
  //    (The header row is still distinct because it's the first row.)

  // 6. Build the workbook + serialize to buffer.
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, sheet, args.sheetName.slice(0, 31))
  const out = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer
  return out
}
```

Note: the community build of `xlsx` does not include cell styling. The header row stays unbolded; this is acceptable for an internal tool — the bold styling would require switching to `exceljs` which is a much bigger dep.

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/lib/export/excel.test.ts 2>&1 | tail -10
```

Expected: 2 tests passing.

- [ ] **Step 5: Full suite + TS check**

```bash
npm run test:ci 2>&1 | tail -5
npx tsc --noEmit 2>&1 | grep export | head -5
```

Expected: 203 tests passing (was 201 + 2 new). No TS errors in the export folder.

- [ ] **Step 6: Commit**

```bash
git add src/lib/export/excel.ts src/lib/export/excel.test.ts
git -c user.email="chew.acchouzs@gmail.com" -c user.name="wenwei4046" commit -m "feat(export): buildXlsxBuffer helper + tests"
```

---

### Task 3: `lib/export/pdf.tsx` + 1 unit test

**Files:**
- Create: `src/lib/export/pdf.tsx`
- Create: `src/lib/export/pdf.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/export/pdf.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import React from 'react'
import { renderPdfBuffer, PdfDocument, PdfTable } from './pdf'

describe('renderPdfBuffer', () => {
  it('produces a PDF buffer whose first 4 bytes are %PDF', async () => {
    const element = React.createElement(
      PdfDocument,
      { title: 'Test', periodLabel: 'May 2026' },
      React.createElement(PdfTable, {
        columns: [
          { label: 'Account', width: 200 },
          { label: 'Debit',   width: 100, align: 'right' },
          { label: 'Credit',  width: 100, align: 'right' },
        ],
        rows: [['3000 Cash', 1000, null], ['4000 AP', null, 1000]],
        numberFormat: 'money',
      }),
    )
    const buf = await renderPdfBuffer(element)
    expect(buf.length).toBeGreaterThan(100)
    // PDF files start with the magic bytes '%PDF'.
    expect(buf.slice(0, 4).toString('ascii')).toBe('%PDF')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/lib/export/pdf.test.ts 2>&1 | tail -15
```

Expected: FAIL with `renderPdfBuffer` not being exported.

- [ ] **Step 3: Implement `pdf.tsx`**

Create `src/lib/export/pdf.tsx`:

```tsx
import React from 'react'
import {
  Document, Page, Text, View, StyleSheet, pdf,
} from '@react-pdf/renderer'
import dayjs from 'dayjs'

export type PdfOrientation = 'portrait' | 'landscape'

export interface PdfColumn {
  label: string
  width: number  // in points (1pt = 1/72 inch); A4 portrait usable = ~520pt
  align?: 'left' | 'right'
}

/**
 * Format a numeric cell value as money: negatives parenthesised, zero as em-dash.
 * Mirrors the Excel default number format `#,##0.00;(#,##0.00);—`.
 */
function fmtMoney(v: number): string {
  if (v === 0) return '—'
  const abs = Math.abs(v).toLocaleString('en-MY', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  return v < 0 ? `(${abs})` : abs
}

const styles = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    fontSize: 9,
    padding: 36,
    color: '#1a1a1a',
  },
  header: {
    fontSize: 10,
    marginBottom: 4,
    fontFamily: 'Helvetica-Oblique',
    color: '#555',
  },
  title: {
    fontSize: 16,
    marginBottom: 2,
    fontFamily: 'Helvetica-Bold',
  },
  subtitle: {
    fontSize: 10,
    marginBottom: 12,
    color: '#555',
  },
  sectionHead: {
    marginTop: 12,
    marginBottom: 4,
    fontFamily: 'Helvetica-Bold',
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    color: '#555',
  },
  table: {
    display: 'flex',
    flexDirection: 'column',
    borderTop: '0.5pt solid #aaa',
  },
  row: {
    flexDirection: 'row',
    borderBottom: '0.5pt solid #ddd',
    minHeight: 14,
  },
  rowAlt: {
    backgroundColor: '#f7f7f6',
  },
  headerRow: {
    backgroundColor: '#eee',
    borderBottom: '0.5pt solid #aaa',
    fontFamily: 'Helvetica-Bold',
    fontSize: 8.5,
    textTransform: 'uppercase',
    color: '#333',
  },
  cell: {
    padding: 4,
    fontSize: 9,
  },
  cellNum: {
    fontFamily: 'Courier',
    textAlign: 'right',
  },
  footer: {
    position: 'absolute',
    fontSize: 8,
    bottom: 16,
    left: 36,
    right: 36,
    textAlign: 'center',
    color: '#888',
    fontFamily: 'Courier',
  },
})

interface DocumentProps {
  title: string
  subtitle?: string
  periodLabel: string
  orientation?: PdfOrientation
  children: React.ReactNode
}

export function PdfDocument({
  title, subtitle, periodLabel, orientation = 'portrait', children,
}: DocumentProps) {
  const generatedAt = dayjs().format('YYYY-MM-DD HH:mm')
  return (
    <Document>
      <Page size="A4" orientation={orientation} style={styles.page}>
        <Text style={styles.header}>
          HOUZS Venture Sdn Bhd · {title} · {periodLabel}
        </Text>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        {children}
        <Text
          style={styles.footer}
          render={({ pageNumber, totalPages }) =>
            `Generated ${generatedAt} · Page ${pageNumber} of ${totalPages}`
          }
          fixed
        />
      </Page>
    </Document>
  )
}

export function PdfSectionHead({ label }: { label: string }) {
  return <Text style={styles.sectionHead}>{label}</Text>
}

export function PdfTable({
  columns, rows, numberFormat = 'plain',
}: {
  columns: PdfColumn[]
  rows: (string | number | null)[][]
  numberFormat?: 'money' | 'plain'
}) {
  return (
    <View style={styles.table}>
      <View style={[styles.row, styles.headerRow]}>
        {columns.map((c, i) => (
          <View key={i} style={{ width: c.width, padding: 4 }}>
            <Text style={{ textAlign: c.align ?? 'left', fontSize: 8.5 }}>{c.label}</Text>
          </View>
        ))}
      </View>
      {rows.map((row, ri) => (
        <View key={ri} style={[styles.row, ri % 2 === 1 ? styles.rowAlt : {}]}>
          {columns.map((c, ci) => {
            const v = row[ci]
            let text: string
            if (v === null || v === undefined) {
              text = ''
            } else if (typeof v === 'number') {
              text = numberFormat === 'money' ? fmtMoney(v) : v.toLocaleString('en-MY')
            } else {
              text = String(v)
            }
            return (
              <View key={ci} style={{ width: c.width, padding: 4 }}>
                <Text style={{
                  fontSize: 9,
                  textAlign: c.align ?? 'left',
                  ...(typeof v === 'number' ? { fontFamily: 'Courier' } : {}),
                }}>
                  {text}
                </Text>
              </View>
            )
          })}
        </View>
      ))}
    </View>
  )
}

export async function renderPdfBuffer(element: React.ReactElement): Promise<Buffer> {
  const instance = pdf(element)
  const blob = await instance.toBuffer()
  // toBuffer in Node returns a NodeJS.ReadableStream — collect it.
  if (blob && typeof (blob as unknown as { on: unknown }).on === 'function') {
    return await streamToBuffer(blob as unknown as NodeJS.ReadableStream)
  }
  // Older versions of @react-pdf/renderer return a Buffer directly.
  return blob as unknown as Buffer
}

function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    stream.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)))
    stream.on('end', () => resolve(Buffer.concat(chunks)))
    stream.on('error', reject)
  })
}
```

If `@react-pdf/renderer`'s `pdf().toBuffer()` returns directly a Buffer (some 4.x versions do), the helper handles both shapes via the runtime type check. This avoids breakage across patch versions.

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/lib/export/pdf.test.ts 2>&1 | tail -10
```

Expected: 1 test passing.

- [ ] **Step 5: Full suite + TS check**

```bash
npm run test:ci 2>&1 | tail -5
npx tsc --noEmit 2>&1 | grep export | head -10
```

Expected: 204 tests passing. No TS errors in `src/lib/export/`.

- [ ] **Step 6: Commit**

```bash
git add src/lib/export/pdf.tsx src/lib/export/pdf.test.ts
git -c user.email="chew.acchouzs@gmail.com" -c user.name="wenwei4046" commit -m "feat(export): PdfDocument + PdfTable + renderPdfBuffer helpers + test"
```

---

### Task 4: `lib/export/response.ts` — thin Response helpers

**Files:**
- Create: `src/lib/export/response.ts`

Pure thin helpers that wrap a Buffer in a Next-friendly `Response`. No unit test — they're 5-line wrappers each.

- [ ] **Step 1: Create the file**

Create `src/lib/export/response.ts`:

```ts
import { renderPdfBuffer } from './pdf'
import React from 'react'

export function exportXlsxResponse(args: {
  filename: string  // without extension; '.xlsx' appended
  buffer: Buffer
}): Response {
  return new Response(args.buffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${args.filename}.xlsx"`,
    },
  })
}

export async function exportPdfResponse(args: {
  filename: string  // without extension; '.pdf' appended
  element: React.ReactElement
}): Promise<Response> {
  const buf = await renderPdfBuffer(args.element)
  return new Response(buf, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${args.filename}.pdf"`,
    },
  })
}
```

- [ ] **Step 2: TS + tests still pass**

```bash
npx tsc --noEmit 2>&1 | grep export | head -5
npm run test:ci 2>&1 | tail -3
```

Expected: no new TS errors. 204 tests pass (no new tests).

- [ ] **Step 3: Commit**

```bash
git add src/lib/export/response.ts
git -c user.email="chew.acchouzs@gmail.com" -c user.name="wenwei4046" commit -m "feat(export): exportXlsxResponse + exportPdfResponse Response helpers"
```

---

### Task 5: Trial Balance export (template) — `/reports/trial-balance/export`

This is the canonical surface task. Every subsequent surface task (6-15) follows the same 4-file shape: `export/route.ts`, `export/_format/xlsx.ts`, `export/_format/pdf.tsx`, plus a page-edit to surface the two buttons.

**Files:**
- Create: `src/app/(portal)/reports/trial-balance/export/route.ts`
- Create: `src/app/(portal)/reports/trial-balance/export/_format/xlsx.ts`
- Create: `src/app/(portal)/reports/trial-balance/export/_format/pdf.tsx`
- Modify: `src/app/(portal)/reports/trial-balance/page.tsx` (add Export buttons in the page-head action area)

- [ ] **Step 1: Create the xlsx builder**

Create `src/app/(portal)/reports/trial-balance/export/_format/xlsx.ts`:

```ts
import { buildXlsxBuffer } from '@/lib/export/excel'
import type { TrialBalance } from '@/lib/cfo-reports'
import { typeLabel } from '@/lib/coa'

export function buildTrialBalanceXlsx(tb: TrialBalance): Buffer {
  // Group rows by type so each type gets a section header.
  const byType = new Map<string, typeof tb.rows>()
  for (const row of tb.rows) {
    const list = byType.get(row.type) ?? []
    list.push(row)
    byType.set(row.type, list)
  }

  const dataRows: (string | number | null)[][] = []
  const sectionBreaks: { afterRow: number; title: string }[] = []
  for (const [type, rows] of byType.entries()) {
    sectionBreaks.push({ afterRow: dataRows.length, title: typeLabel(type as never).toUpperCase() })
    for (const r of rows) {
      dataRows.push([`${r.code} ${r.name}`, r.debit > 0 ? r.debit : null, r.credit > 0 ? r.credit : null])
    }
    // Subtotal row per type
    const subDr = rows.reduce((s, r) => s + r.debit, 0)
    const subCr = rows.reduce((s, r) => s + r.credit, 0)
    dataRows.push([`Total ${typeLabel(type as never)}`, subDr > 0 ? subDr : null, subCr > 0 ? subCr : null])
  }
  // Grand total at the very end
  dataRows.push(['TOTAL', tb.totals.debit, tb.totals.credit])

  return buildXlsxBuffer({
    sheetName: 'Trial Balance',
    headerRow: ['Account', 'Debit', 'Credit'],
    rows: dataRows,
    columnWidths: [42, 16, 16],
    sectionBreaks,
  })
}
```

- [ ] **Step 2: Create the pdf builder**

Create `src/app/(portal)/reports/trial-balance/export/_format/pdf.tsx`:

```tsx
import React from 'react'
import dayjs from 'dayjs'
import { PdfDocument, PdfTable, PdfSectionHead } from '@/lib/export/pdf'
import type { TrialBalance } from '@/lib/cfo-reports'
import { typeLabel } from '@/lib/coa'

export function TrialBalancePdf({ tb }: { tb: TrialBalance }) {
  const byType = new Map<string, typeof tb.rows>()
  for (const row of tb.rows) {
    const list = byType.get(row.type) ?? []
    list.push(row)
    byType.set(row.type, list)
  }

  return (
    <PdfDocument
      title="Trial Balance"
      periodLabel={dayjs(tb.asOf).format('D MMMM YYYY')}
      subtitle={`Snapshot as at ${dayjs(tb.asOf).format('D MMMM YYYY')}. Σ Dr ${tb.reconciles ? '=' : '≠'} Σ Cr.`}
    >
      {Array.from(byType.entries()).map(([type, rows]) => {
        const subDr = rows.reduce((s, r) => s + r.debit, 0)
        const subCr = rows.reduce((s, r) => s + r.credit, 0)
        const tableRows: (string | number | null)[][] = [
          ...rows.map((r) => [
            `${r.code} ${r.name}`,
            r.debit > 0 ? r.debit : null,
            r.credit > 0 ? r.credit : null,
          ]),
          [`Total ${typeLabel(type as never)}`, subDr > 0 ? subDr : null, subCr > 0 ? subCr : null],
        ]
        return (
          <React.Fragment key={type}>
            <PdfSectionHead label={typeLabel(type as never)} />
            <PdfTable
              columns={[
                { label: 'Account', width: 280 },
                { label: 'Debit',   width: 100, align: 'right' },
                { label: 'Credit',  width: 100, align: 'right' },
              ]}
              rows={tableRows}
              numberFormat="money"
            />
          </React.Fragment>
        )
      })}
      <PdfSectionHead label="Total" />
      <PdfTable
        columns={[
          { label: '',       width: 280 },
          { label: 'Debit',  width: 100, align: 'right' },
          { label: 'Credit', width: 100, align: 'right' },
        ]}
        rows={[['TOTAL', tb.totals.debit, tb.totals.credit]]}
        numberFormat="money"
      />
    </PdfDocument>
  )
}
```

- [ ] **Step 3: Create the route handler**

Create `src/app/(portal)/reports/trial-balance/export/route.ts`:

```ts
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { fetchTrialBalance } from '@/lib/cfo-reports'
import { exportXlsxResponse, exportPdfResponse } from '@/lib/export/response'
import { buildTrialBalanceXlsx } from './_format/xlsx'
import { TrialBalancePdf } from './_format/pdf'
import dayjs from 'dayjs'

export async function GET(req: Request) {
  await requireRole(['principal', 'finance'])
  const url = new URL(req.url)
  const format = url.searchParams.get('format') === 'pdf' ? 'pdf' : 'xlsx'
  const asOf = url.searchParams.get('as_of') ?? dayjs().format('YYYY-MM-DD')
  const showZero = url.searchParams.get('show_zero') === '1'

  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf)) {
    return Response.json({ error: 'invalid as_of date' }, { status: 400 })
  }

  const supabase = await createClient()
  const tb = await fetchTrialBalance(supabase, { asOf, showZeroBalance: showZero })

  const filename = `trial-balance-${asOf.replace(/-/g, '')}`
  if (format === 'xlsx') {
    return exportXlsxResponse({ filename, buffer: buildTrialBalanceXlsx(tb) })
  }
  return exportPdfResponse({ filename, element: <TrialBalancePdf tb={tb} /> })
}
```

Note: route handlers can use JSX (`<TrialBalancePdf .../>`) because the file is `route.ts` — Next 15 compiles JSX in route handlers when the imports include JSX-producing modules. If the build complains, rename `route.ts` → `route.tsx` (same export shape, just different extension).

- [ ] **Step 4: Edit the TB page to add Export buttons**

Edit `src/app/(portal)/reports/trial-balance/page.tsx`. Find the existing `<form className="shrink-0 flex items-center gap-3">` block in the page-head. The whole action region currently has only the date input + show-zero checkbox + Apply button. We want to add two Export links AFTER the Apply button but inside the same `<div>` that wraps the form. Concretely, the layout becomes: form (date + checkbox + Apply) | Export Excel | Export PDF.

Find this line:
```tsx
        <form className="shrink-0 flex items-center gap-3">
```

And the closing `</form>` of that form (around line 65 of the file). The fix: wrap the existing `<form>...</form>` in a flex container that ALSO holds the two new Export Links. Replace:

```tsx
        <form className="shrink-0 flex items-center gap-3">
          <input
            type="date"
            name="as_of"
            defaultValue={asOf}
            className="px-3 py-2 bg-paper border border-hairline rounded-md text-sm font-mono text-ink focus:outline-none focus:border-accent-border"
          />
          <label className="flex items-center gap-2 text-sm font-serif italic text-graphite">
            <input
              type="checkbox"
              name="show_zero"
              value="1"
              defaultChecked={showZeroBalance}
            />
            Show zero-balance
          </label>
          <button
            type="submit"
            className="px-4 py-2 bg-accent hover:bg-accent-hover text-white font-serif italic text-sm rounded-md transition-colors"
          >
            Apply
          </button>
        </form>
```

With:

```tsx
        <div className="shrink-0 flex items-center gap-3">
          <form className="flex items-center gap-3">
            <input
              type="date"
              name="as_of"
              defaultValue={asOf}
              className="px-3 py-2 bg-paper border border-hairline rounded-md text-sm font-mono text-ink focus:outline-none focus:border-accent-border"
            />
            <label className="flex items-center gap-2 text-sm font-serif italic text-graphite">
              <input
                type="checkbox"
                name="show_zero"
                value="1"
                defaultChecked={showZeroBalance}
              />
              Show zero-balance
            </label>
            <button
              type="submit"
              className="px-4 py-2 bg-accent hover:bg-accent-hover text-white font-serif italic text-sm rounded-md transition-colors"
            >
              Apply
            </button>
          </form>
          <Link
            href={`/reports/trial-balance/export?format=xlsx&as_of=${asOf}${showZeroBalance ? '&show_zero=1' : ''}`}
            className="px-3 py-1.5 bg-surface hover:bg-surface-2 border border-hairline rounded-md text-xs font-mono text-graphite hover:text-ink transition-colors"
          >
            Export Excel
          </Link>
          <Link
            href={`/reports/trial-balance/export?format=pdf&as_of=${asOf}${showZeroBalance ? '&show_zero=1' : ''}`}
            className="px-3 py-1.5 bg-surface hover:bg-surface-2 border border-hairline rounded-md text-xs font-mono text-graphite hover:text-ink transition-colors"
          >
            Export PDF
          </Link>
        </div>
```

`Link` is already imported in this file from `'next/link'` (line 7) — no new import needed.

- [ ] **Step 5: TS + browser smoke**

```bash
npx tsc --noEmit 2>&1 | grep -E "trial-balance|export" | head -10
```

Expected: no new errors.

```bash
curl -s -o trial-balance.xlsx -w "%{http_code}\n" -L --max-time 30 "http://localhost:3000/reports/trial-balance/export?format=xlsx&as_of=2026-05-15"
curl -s -o trial-balance.pdf  -w "%{http_code}\n" -L --max-time 30 "http://localhost:3000/reports/trial-balance/export?format=pdf&as_of=2026-05-15"
file trial-balance.xlsx trial-balance.pdf
rm -f trial-balance.xlsx trial-balance.pdf
```

Expected: both 200 (or 307 if curl isn't authed in this session — opening in browser will get 200 once authed). `file` should report a Microsoft Excel doc and a PDF doc respectively.

⚠ DO NOT run `npm run build` or anything that touches `.next/` — earlier in this session a stray production build corrupted the dev cache. Stick to `npx tsc --noEmit` for type checking.

- [ ] **Step 6: Test suite**

```bash
npm run test:ci 2>&1 | tail -5
```

Expected: 204 passing (no new tests — surface tasks don't add unit tests).

- [ ] **Step 7: Commit**

```bash
git add "src/app/(portal)/reports/trial-balance"
git -c user.email="chew.acchouzs@gmail.com" -c user.name="wenwei4046" commit -m "feat(export): Trial Balance Excel + PDF endpoint + page buttons"
```

---

## Tasks 6-15: per-surface exports

Each of the remaining 10 surfaces follows the same shape as Task 5 (3 new files in `export/` + 1 page edit). The deltas per surface are: which `fetchXxx` is called, which searchParams are forwarded, what columns the Excel + PDF show, and the filename. The shape of the route handler is unchanged from Task 5's template (request validation → fetch → format → response).

Per task, the implementer must:

1. **Read the page** (`<surface>/page.tsx`) to confirm: searchParam names + defaults, data fetcher signature, data type imports, and the role list passed to `requireRole`. The role list must match the page; the spec section "Permissions" calls for `['principal', 'finance']` for everything in scope.
2. **Create the 3 export files** with the surface-specific code below.
3. **Edit the page** to add the two Export buttons. The pattern is the same as Task 5: wrap the existing action area in a flex `<div>`, append two `<Link>` elements (`Export Excel` / `Export PDF`). The button URLs forward whichever searchParams the page reads.
4. **Commit with the message** specified at the bottom of each task.

---

### Task 6: Income Statement export

**Files:**
- Create: `src/app/(portal)/reports/income-statement/export/route.ts`
- Create: `src/app/(portal)/reports/income-statement/export/_format/xlsx.ts`
- Create: `src/app/(portal)/reports/income-statement/export/_format/pdf.tsx`
- Modify: `src/app/(portal)/reports/income-statement/page.tsx`

**Page params**: `from`, `to`, `period` (period is a convenience that resolves to a from/to month — page already does the resolution; route handler can pass the resolved from/to to `fetchIncomeStatement`).

**Data fetcher**: `fetchIncomeStatement(supabase, { from, to })` from `@/lib/cfo-reports`, returns `IncomeStatement`.

**`IncomeStatement` shape** (from cfo-reports.ts): `{ pools: PoolPnl[], treasury: TreasuryBreakdown, groupRevenue, groupCost, groupOtherIncome, groupExpense, groupGrossProfit, groupNetProfit }`. Each `PoolPnl` has `pool, poolLabel, revenueLines, costLines, otherIncomeLines, expenseLines, revenue, cost, otherIncome, expense, grossProfit, margin`.

- [ ] **Step 1: Create the xlsx builder**

`src/app/(portal)/reports/income-statement/export/_format/xlsx.ts`:

```ts
import { buildXlsxBuffer } from '@/lib/export/excel'
import type { IncomeStatement, PoolPnl } from '@/lib/cfo-reports'

export function buildIncomeStatementXlsx(stmt: IncomeStatement, periodLabel: string): Buffer {
  const rows: (string | number | null)[][] = []
  const breaks: { afterRow: number; title: string }[] = []

  function appendPool(p: PoolPnl) {
    breaks.push({ afterRow: rows.length, title: `${p.poolLabel.toUpperCase()} POOL` })
    for (const l of p.revenueLines)      rows.push([l.label, l.amount, null, null, null])
    if (p.revenue !== 0)                  rows.push(['Total revenue', p.revenue, null, null, null])
    for (const l of p.costLines)          rows.push([l.label, null, l.amount, null, null])
    if (p.cost !== 0)                     rows.push(['Total cost',    null, p.cost, null, null])
    if (p.grossProfit !== 0)              rows.push(['Gross profit',  null, null, p.grossProfit, null])
    for (const l of p.otherIncomeLines)   rows.push([l.label, null, null, l.amount, null])
    for (const l of p.expenseLines)       rows.push([l.label, null, null, null, l.amount])
    if (p.expense !== 0)                  rows.push(['Total expense', null, null, null, p.expense])
    rows.push([`Margin`, null, null, null, p.margin])
  }

  for (const pool of stmt.pools) appendPool(pool)
  breaks.push({ afterRow: rows.length, title: 'GROUP TOTALS' })
  rows.push(['Group revenue',     stmt.groupRevenue,     null, null, null])
  rows.push(['Group cost',        null, stmt.groupCost,  null, null])
  rows.push(['Group gross profit',null, null, stmt.groupGrossProfit, null])
  rows.push(['Group other income',null, null, stmt.groupOtherIncome, null])
  rows.push(['Group expense',     null, null, null, stmt.groupExpense])
  rows.push(['Group net profit',  null, null, null, stmt.groupNetProfit])

  return buildXlsxBuffer({
    sheetName: 'Income Statement',
    headerRow: ['Line', 'Revenue', 'Cost', 'Other Income', 'Expense'],
    rows,
    columnWidths: [38, 14, 14, 14, 14],
    sectionBreaks: breaks,
  })
}
```

- [ ] **Step 2: Create the pdf builder**

`src/app/(portal)/reports/income-statement/export/_format/pdf.tsx`:

```tsx
import React from 'react'
import { PdfDocument, PdfTable, PdfSectionHead } from '@/lib/export/pdf'
import type { IncomeStatement, PoolPnl } from '@/lib/cfo-reports'

const COLUMNS = [
  { label: 'Line',         width: 220 },
  { label: 'Revenue',      width: 70, align: 'right' as const },
  { label: 'Cost',         width: 70, align: 'right' as const },
  { label: 'Other Income', width: 80, align: 'right' as const },
  { label: 'Expense',      width: 70, align: 'right' as const },
]

export function IncomeStatementPdf({ stmt, periodLabel }: { stmt: IncomeStatement; periodLabel: string }) {
  function poolRows(p: PoolPnl): (string | number | null)[][] {
    const out: (string | number | null)[][] = []
    for (const l of p.revenueLines)     out.push([l.label, l.amount, null, null, null])
    if (p.revenue !== 0)                 out.push(['Total revenue', p.revenue, null, null, null])
    for (const l of p.costLines)         out.push([l.label, null, l.amount, null, null])
    if (p.cost !== 0)                    out.push(['Total cost', null, p.cost, null, null])
    if (p.grossProfit !== 0)             out.push(['Gross profit', null, null, p.grossProfit, null])
    for (const l of p.otherIncomeLines)  out.push([l.label, null, null, l.amount, null])
    for (const l of p.expenseLines)      out.push([l.label, null, null, null, l.amount])
    if (p.expense !== 0)                 out.push(['Total expense', null, null, null, p.expense])
    out.push(['Margin', null, null, null, p.margin])
    return out
  }

  return (
    <PdfDocument title="Income Statement" periodLabel={periodLabel}>
      {stmt.pools.map((p) => (
        <React.Fragment key={p.pool}>
          <PdfSectionHead label={`${p.poolLabel} Pool`} />
          <PdfTable columns={COLUMNS} rows={poolRows(p)} numberFormat="money" />
        </React.Fragment>
      ))}
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
    </PdfDocument>
  )
}
```

- [ ] **Step 3: Create the route handler**

`src/app/(portal)/reports/income-statement/export/route.ts`:

```ts
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { fetchIncomeStatement } from '@/lib/cfo-reports'
import { exportXlsxResponse, exportPdfResponse } from '@/lib/export/response'
import { buildIncomeStatementXlsx } from './_format/xlsx'
import { IncomeStatementPdf } from './_format/pdf'
import dayjs from 'dayjs'

export async function GET(req: Request) {
  await requireRole(['principal', 'finance'])
  const url = new URL(req.url)
  const format = url.searchParams.get('format') === 'pdf' ? 'pdf' : 'xlsx'
  const from = url.searchParams.get('from') ?? dayjs().startOf('month').format('YYYY-MM-DD')
  const to = url.searchParams.get('to') ?? dayjs().format('YYYY-MM-DD')

  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return Response.json({ error: 'invalid from/to date' }, { status: 400 })
  }

  const supabase = await createClient()
  const stmt = await fetchIncomeStatement(supabase, { from, to })
  const periodLabel = `${dayjs(from).format('D MMM YYYY')} – ${dayjs(to).format('D MMM YYYY')}`

  const filename = `income-statement-${from}-${to}`
  if (format === 'xlsx') {
    return exportXlsxResponse({ filename, buffer: buildIncomeStatementXlsx(stmt, periodLabel) })
  }
  return exportPdfResponse({ filename, element: <IncomeStatementPdf stmt={stmt} periodLabel={periodLabel} /> })
}
```

- [ ] **Step 4: Edit `income-statement/page.tsx` to add Export buttons**

The page's existing action area has a date-range form. Apply the same wrap-in-`<div>` + two-`<Link>` pattern from Task 5 Step 4. Pass `&from=${from}&to=${to}` to both export URLs. If `Link` from `'next/link'` isn't already imported, add it.

- [ ] **Step 5: Smoke + commit**

```bash
curl -s -o is.xlsx -w "%{http_code}\n" -L --max-time 30 "http://localhost:3000/reports/income-statement/export?format=xlsx&from=2026-05-01&to=2026-05-15"
curl -s -o is.pdf  -w "%{http_code}\n" -L --max-time 30 "http://localhost:3000/reports/income-statement/export?format=pdf&from=2026-05-01&to=2026-05-15"
file is.xlsx is.pdf
rm -f is.xlsx is.pdf
git add "src/app/(portal)/reports/income-statement"
git -c user.email="chew.acchouzs@gmail.com" -c user.name="wenwei4046" commit -m "feat(export): Income Statement Excel + PDF endpoint + page buttons"
```

Expected: 200 / 200 / valid xlsx + pdf file types.

---

### Task 7: Balance Sheet export

**Files:** `export/{route.ts, _format/xlsx.ts, _format/pdf.tsx}` + `page.tsx` edit.

**Page param**: `as_of`. **Fetcher**: `fetchBalanceSheet(supabase, { asOf })` → `BalanceSheet`.

**Sections to render** (mirror the on-screen layout from `reports/balance-sheet/page.tsx`):
- Assets: rows for bank, invoiceReceivable, loanReceivable, fixedAssets (if non-zero), otherAssets (if non-zero) + Total
- Liabilities: fundSourcesPayable + Total
- Equity: real share capital (equityBalances) + retained earnings (retainedEarnings) + Total
- Internal Funds: every line in `internalFundLines` + Total

- [ ] **Step 1: Create the xlsx builder**

`src/app/(portal)/reports/balance-sheet/export/_format/xlsx.ts`:

```ts
import { buildXlsxBuffer } from '@/lib/export/excel'
import type { BalanceSheet } from '@/lib/cfo-reports'

export function buildBalanceSheetXlsx(bs: BalanceSheet): Buffer {
  const rows: (string | number | null)[][] = []
  const breaks: { afterRow: number; title: string }[] = []

  breaks.push({ afterRow: rows.length, title: 'ASSETS' })
  rows.push(['Bank cash',           bs.bank])
  rows.push(['Invoice receivable',  bs.invoiceReceivable])
  rows.push(['Loan receivable',     bs.loanReceivable])
  if (Math.abs(bs.fixedAssets) > 0.005)  rows.push(['Fixed assets', bs.fixedAssets])
  if (Math.abs(bs.otherAssets) > 0.005)  rows.push(['Other assets', bs.otherAssets])
  rows.push(['Total assets',        bs.totalAssets])

  breaks.push({ afterRow: rows.length, title: 'LIABILITIES' })
  rows.push(['Fund sources payable', bs.fundSourcesPayable])
  rows.push(['Total liabilities',    bs.fundSourcesPayable])

  breaks.push({ afterRow: rows.length, title: 'EQUITY' })
  if (Math.abs(bs.equityBalances) > 0.005) rows.push(['Share capital / paid-in equity', bs.equityBalances])
  rows.push(['Retained earnings (YTD)',   bs.retainedEarnings])
  rows.push(['Total equity',              bs.equityBalances + bs.retainedEarnings])

  if (bs.internalFundLines.length > 0) {
    breaks.push({ afterRow: rows.length, title: 'INTERNAL FUNDS' })
    for (const line of bs.internalFundLines) {
      rows.push([`${line.code} ${line.name}`, line.balance])
    }
    rows.push(['Total internal funds', bs.internalFundsTotal])
  }

  breaks.push({ afterRow: rows.length, title: 'TOTAL LIABILITIES + EQUITY' })
  rows.push(['Total liabilities + equity', bs.totalLiabilitiesEquity])
  rows.push([bs.reconciles ? '✓ Balance sheet reconciles' : '⚠ Does NOT reconcile', null])

  return buildXlsxBuffer({
    sheetName: 'Balance Sheet',
    headerRow: ['Line', 'Amount'],
    rows,
    columnWidths: [42, 18],
    sectionBreaks: breaks,
  })
}
```

- [ ] **Step 2: Create the pdf builder**

`src/app/(portal)/reports/balance-sheet/export/_format/pdf.tsx`:

```tsx
import React from 'react'
import dayjs from 'dayjs'
import { PdfDocument, PdfTable, PdfSectionHead } from '@/lib/export/pdf'
import type { BalanceSheet } from '@/lib/cfo-reports'

const COLUMNS = [
  { label: 'Line',   width: 320 },
  { label: 'Amount', width: 120, align: 'right' as const },
]

export function BalanceSheetPdf({ bs }: { bs: BalanceSheet }) {
  return (
    <PdfDocument
      title="Balance Sheet"
      periodLabel={dayjs(bs.asOf).format('D MMMM YYYY')}
      subtitle={`Snapshot as at ${dayjs(bs.asOf).format('D MMMM YYYY')}.${bs.reconciles ? '' : ' ⚠ Does not reconcile.'}`}
    >
      <PdfSectionHead label="Assets" />
      <PdfTable columns={COLUMNS} numberFormat="money" rows={[
        ['Bank cash', bs.bank],
        ['Invoice receivable', bs.invoiceReceivable],
        ['Loan receivable', bs.loanReceivable],
        ...(Math.abs(bs.fixedAssets) > 0.005 ? [['Fixed assets', bs.fixedAssets] as [string, number]] : []),
        ...(Math.abs(bs.otherAssets) > 0.005 ? [['Other assets', bs.otherAssets] as [string, number]] : []),
        ['Total assets', bs.totalAssets],
      ]} />
      <PdfSectionHead label="Liabilities" />
      <PdfTable columns={COLUMNS} numberFormat="money" rows={[
        ['Fund sources payable', bs.fundSourcesPayable],
        ['Total liabilities', bs.fundSourcesPayable],
      ]} />
      <PdfSectionHead label="Equity" />
      <PdfTable columns={COLUMNS} numberFormat="money" rows={[
        ...(Math.abs(bs.equityBalances) > 0.005 ? [['Share capital / paid-in equity', bs.equityBalances] as [string, number]] : []),
        ['Retained earnings (YTD)', bs.retainedEarnings],
        ['Total equity', bs.equityBalances + bs.retainedEarnings],
      ]} />
      {bs.internalFundLines.length > 0 ? (
        <>
          <PdfSectionHead label="Internal Funds" />
          <PdfTable columns={COLUMNS} numberFormat="money" rows={[
            ...bs.internalFundLines.map((l) => [`${l.code} ${l.name}`, l.balance] as [string, number]),
            ['Total internal funds', bs.internalFundsTotal],
          ]} />
        </>
      ) : null}
      <PdfSectionHead label="Total Liabilities + Equity" />
      <PdfTable columns={COLUMNS} numberFormat="money" rows={[
        ['Total liabilities + equity', bs.totalLiabilitiesEquity],
      ]} />
    </PdfDocument>
  )
}
```

- [ ] **Step 3: Create the route handler**

`src/app/(portal)/reports/balance-sheet/export/route.ts`:

```ts
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { fetchBalanceSheet } from '@/lib/cfo-reports'
import { exportXlsxResponse, exportPdfResponse } from '@/lib/export/response'
import { buildBalanceSheetXlsx } from './_format/xlsx'
import { BalanceSheetPdf } from './_format/pdf'
import dayjs from 'dayjs'

export async function GET(req: Request) {
  await requireRole(['principal', 'finance'])
  const url = new URL(req.url)
  const format = url.searchParams.get('format') === 'pdf' ? 'pdf' : 'xlsx'
  const asOf = url.searchParams.get('as_of') ?? dayjs().format('YYYY-MM-DD')

  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf)) {
    return Response.json({ error: 'invalid as_of date' }, { status: 400 })
  }

  const supabase = await createClient()
  const bs = await fetchBalanceSheet(supabase, { asOf })

  const filename = `balance-sheet-${asOf.replace(/-/g, '')}`
  if (format === 'xlsx') {
    return exportXlsxResponse({ filename, buffer: buildBalanceSheetXlsx(bs) })
  }
  return exportPdfResponse({ filename, element: <BalanceSheetPdf bs={bs} /> })
}
```

- [ ] **Step 4: Page edit** — wrap the existing date form + add two `<Link>` Export buttons forwarding `as_of`. Same shape as Task 5 Step 4.

- [ ] **Step 5: Smoke + commit**

```bash
curl -s -o bs.xlsx -w "%{http_code}\n" -L --max-time 30 "http://localhost:3000/reports/balance-sheet/export?format=xlsx&as_of=2026-05-15"
curl -s -o bs.pdf  -w "%{http_code}\n" -L --max-time 30 "http://localhost:3000/reports/balance-sheet/export?format=pdf&as_of=2026-05-15"
file bs.xlsx bs.pdf
rm -f bs.xlsx bs.pdf
git add "src/app/(portal)/reports/balance-sheet"
git -c user.email="chew.acchouzs@gmail.com" -c user.name="wenwei4046" commit -m "feat(export): Balance Sheet Excel + PDF endpoint + page buttons"
```

---

### Task 8: Cash Flow export — **landscape PDF**

**Files:** standard 4.

**Page param**: `from`, `to`, `period`. **Fetcher**: `fetchCashflowStatement(supabase, { from, to })` → `CashflowStatement`.

**`CashflowStatement` shape**: `{ sections: CashflowSection[], netChange }`; each section has `category` ('operating'/'investing'/'financing'), `pools: CashflowPoolBlock[]`, `net`. Each pool block has `pool, poolLabel, inflowLines: Line[], outflowLines: Line[], net`.

- [ ] **Step 1: xlsx builder** (`_format/xlsx.ts`)

```ts
import { buildXlsxBuffer } from '@/lib/export/excel'
import type { CashflowStatement } from '@/lib/cfo-reports'

const CAT_LABEL: Record<string, string> = {
  operating: 'OPERATING',
  investing: 'INVESTING',
  financing: 'FINANCING',
}

export function buildCashflowXlsx(stmt: CashflowStatement): Buffer {
  const rows: (string | number | null)[][] = []
  const breaks: { afterRow: number; title: string }[] = []
  for (const section of stmt.sections) {
    breaks.push({ afterRow: rows.length, title: CAT_LABEL[section.category] ?? section.category.toUpperCase() })
    for (const pool of section.pools) {
      rows.push([`${pool.poolLabel} — Inflows`, null, null])
      for (const l of pool.inflowLines)  rows.push([`  ${l.label}`, l.amount, null])
      rows.push([`${pool.poolLabel} — Outflows`, null, null])
      for (const l of pool.outflowLines) rows.push([`  ${l.label}`, null, l.amount])
      rows.push([`${pool.poolLabel} — Net`, null, null, pool.net])
    }
    rows.push([`Section net (${section.category})`, null, null, section.net])
  }
  rows.push(['Total net change', null, null, stmt.netChange])

  return buildXlsxBuffer({
    sheetName: 'Cash Flow',
    headerRow: ['Line', 'Inflow', 'Outflow', 'Net'],
    rows,
    columnWidths: [42, 14, 14, 14],
    sectionBreaks: breaks,
  })
}
```

- [ ] **Step 2: pdf builder** (`_format/pdf.tsx`) — `orientation="landscape"`

```tsx
import React from 'react'
import { PdfDocument, PdfTable, PdfSectionHead } from '@/lib/export/pdf'
import type { CashflowStatement, CashflowPoolBlock } from '@/lib/cfo-reports'

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

export function CashflowPdf({ stmt, periodLabel }: { stmt: CashflowStatement; periodLabel: string }) {
  function poolRows(p: CashflowPoolBlock): (string | number | null)[][] {
    const out: (string | number | null)[][] = []
    out.push([`${p.poolLabel} — Inflows`, null, null, null])
    for (const l of p.inflowLines)  out.push([`  ${l.label}`, l.amount, null, null])
    out.push([`${p.poolLabel} — Outflows`, null, null, null])
    for (const l of p.outflowLines) out.push([`  ${l.label}`, null, l.amount, null])
    out.push([`${p.poolLabel} — Net`, null, null, p.net])
    return out
  }

  return (
    <PdfDocument title="Cash Flow" periodLabel={periodLabel} orientation="landscape">
      {stmt.sections.map((section) => (
        <React.Fragment key={section.category}>
          <PdfSectionHead label={CAT_TITLE[section.category] ?? section.category} />
          <PdfTable
            columns={COLUMNS}
            numberFormat="money"
            rows={[
              ...section.pools.flatMap(poolRows),
              [`Section net (${section.category})`, null, null, section.net],
            ]}
          />
        </React.Fragment>
      ))}
      <PdfSectionHead label="Total" />
      <PdfTable columns={COLUMNS} numberFormat="money" rows={[
        ['Total net change', null, null, stmt.netChange],
      ]} />
    </PdfDocument>
  )
}
```

- [ ] **Step 3: route handler** — identical shape to Task 6 route but with `fetchCashflowStatement` instead of `fetchIncomeStatement`, and filename `cash-flow-${from}-${to}`.

```ts
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { fetchCashflowStatement } from '@/lib/cfo-reports'
import { exportXlsxResponse, exportPdfResponse } from '@/lib/export/response'
import { buildCashflowXlsx } from './_format/xlsx'
import { CashflowPdf } from './_format/pdf'
import dayjs from 'dayjs'

export async function GET(req: Request) {
  await requireRole(['principal', 'finance'])
  const url = new URL(req.url)
  const format = url.searchParams.get('format') === 'pdf' ? 'pdf' : 'xlsx'
  const from = url.searchParams.get('from') ?? dayjs().startOf('month').format('YYYY-MM-DD')
  const to = url.searchParams.get('to') ?? dayjs().format('YYYY-MM-DD')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return Response.json({ error: 'invalid from/to date' }, { status: 400 })
  }
  const supabase = await createClient()
  const stmt = await fetchCashflowStatement(supabase, { from, to })
  const periodLabel = `${dayjs(from).format('D MMM YYYY')} – ${dayjs(to).format('D MMM YYYY')}`
  const filename = `cash-flow-${from}-${to}`
  if (format === 'xlsx') {
    return exportXlsxResponse({ filename, buffer: buildCashflowXlsx(stmt) })
  }
  return exportPdfResponse({ filename, element: <CashflowPdf stmt={stmt} periodLabel={periodLabel} /> })
}
```

- [ ] **Step 4: page edit** — wrap action area + 2 Export Links forwarding `from`+`to`. Same shape as Task 6 Step 4.

- [ ] **Step 5: smoke + commit**

```bash
curl -s -o cf.xlsx -w "%{http_code}\n" -L --max-time 30 "http://localhost:3000/reports/cash-flow/export?format=xlsx&from=2026-05-01&to=2026-05-15"
curl -s -o cf.pdf  -w "%{http_code}\n" -L --max-time 30 "http://localhost:3000/reports/cash-flow/export?format=pdf&from=2026-05-01&to=2026-05-15"
file cf.xlsx cf.pdf
rm -f cf.xlsx cf.pdf
git add "src/app/(portal)/reports/cash-flow"
git -c user.email="chew.acchouzs@gmail.com" -c user.name="wenwei4046" commit -m "feat(export): Cash Flow Excel + PDF (landscape) endpoint + page buttons"
```

---

### Task 9: Fund Summary export

**Files:** standard 4.

**Page params**: none (page is parameterless). **Data**: Read `src/app/(portal)/reports/fund-summary/page.tsx` to discover what data it shows (likely a single Supabase view / RPC call). Replicate the same data fetch in the route handler. The Excel sheet should mirror what's on screen.

**Filename**: `fund-summary-<YYYYMMDD>.<ext>` where date is today.

- [ ] **Step 1: Read `fund-summary/page.tsx`** to identify the data fetch + the on-screen columns/sections.

- [ ] **Step 2: Create `_format/xlsx.ts`** with `buildFundSummaryXlsx(data)` returning a Buffer. Use `buildXlsxBuffer` with column headers matching what the page renders. Specifics depend on the data shape discovered in Step 1.

- [ ] **Step 3: Create `_format/pdf.tsx`** with `<FundSummaryPdf data={...} />` using `<PdfDocument>` + `<PdfTable>`. Portrait orientation. Table columns mirror Step 2's xlsx headers.

- [ ] **Step 4: Create `route.ts`** following the Task 5 template — no searchParams to validate; just fetch + format + respond.

```ts
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { exportXlsxResponse, exportPdfResponse } from '@/lib/export/response'
import { buildFundSummaryXlsx } from './_format/xlsx'
import { FundSummaryPdf } from './_format/pdf'
import dayjs from 'dayjs'

export async function GET(req: Request) {
  await requireRole(['principal', 'finance'])
  const url = new URL(req.url)
  const format = url.searchParams.get('format') === 'pdf' ? 'pdf' : 'xlsx'
  const supabase = await createClient()
  // Replicate fund-summary/page.tsx's data fetch — see Step 1.
  const data = await fetchFundSummaryData(supabase)  // implement in Step 1; could be inlined.

  const filename = `fund-summary-${dayjs().format('YYYYMMDD')}`
  if (format === 'xlsx') {
    return exportXlsxResponse({ filename, buffer: buildFundSummaryXlsx(data) })
  }
  return exportPdfResponse({ filename, element: <FundSummaryPdf data={data} /> })
}
```

(`fetchFundSummaryData` is whatever the page already does — extract it to `lib/fund-summary.ts` if useful, OR inline the Supabase query.)

- [ ] **Step 5: Page edit + smoke + commit**

Standard pattern. Final commit:
```bash
git add "src/app/(portal)/reports/fund-summary"
git -c user.email="chew.acchouzs@gmail.com" -c user.name="wenwei4046" commit -m "feat(export): Fund Summary Excel + PDF endpoint + page buttons"
```

---

### Task 10: Base Rate export

**Files:** standard 4. **Page params**: none. **Data**: Read `reports/base-rate/page.tsx` for the data fetch.

The page likely shows a history of quarterly base-rate decisions. Columns: Quarter, Weighted cost %, Op margin %, Base rate %, Effective date, Approved by.

- [ ] **Step 1: Read `base-rate/page.tsx`** to lock in the column set + data fetch.

- [ ] **Step 2-5: Same shape as Task 9** — `_format/xlsx.ts` with `buildBaseRateXlsx(rows)`, `_format/pdf.tsx` with `<BaseRatePdf rows={...} />` (portrait), `route.ts` with no validation (no params), page edit with two Export Links (no params to forward), smoke + commit.

Commit message: `feat(export): Base Rate history Excel + PDF endpoint + page buttons`

---

### Task 11: Claims export

**Files:** standard 4. **Data**: Read `reports/claims/page.tsx` for the data fetch + searchParams (if any).

- [ ] **Step 1: Read `claims/page.tsx`** to lock in: searchParam names, data fetch, table column set.

- [ ] **Step 2-5: Same shape as Task 9.** Portrait orientation. Forward whichever searchParams the page reads (likely a status filter).

Commit message: `feat(export): Claims Excel + PDF endpoint + page buttons`

---

### Task 12: General Ledger export — **landscape PDF**

**Files:** standard 4.

**Page params**: `code`, `from`, `to`. **Fetcher**: `fetchLedger(supabase, { code, from, to })` → `Ledger`. The fetcher can throw (account not found, header account) — the route handler MUST catch and return HTTP 400 JSON instead of letting it crash.

- [ ] **Step 1: xlsx builder**

`src/app/(portal)/reports/ledger/export/_format/xlsx.ts`:

```ts
import { buildXlsxBuffer } from '@/lib/export/excel'
import type { Ledger } from '@/lib/cfo-reports'
import dayjs from 'dayjs'

function fmtBalance(signed: number): string {
  if (Math.abs(signed) < 0.005) return '—'
  const abs = Math.abs(signed).toLocaleString('en-MY', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  return `${abs} ${signed >= 0 ? 'Dr' : 'Cr'}`
}

export function buildLedgerXlsx(led: Ledger): Buffer {
  const rows: (string | number | null)[][] = []
  rows.push([`Account: ${led.code} ${led.accountName}`, null, null, null, null, null])
  rows.push([`Period: ${dayjs(led.from).format('D MMM YYYY')} – ${dayjs(led.to).format('D MMM YYYY')}`, null, null, null, null, null])
  rows.push([])
  rows.push([`Opening balance (${dayjs(led.from).subtract(1, 'day').format('D MMM YYYY')})`, null, null, null, null, fmtBalance(led.openingBalance)])
  for (const l of led.lines) {
    rows.push([
      dayjs(l.entryDate).format('D MMM YYYY'),
      l.entryNo,
      l.description,
      l.debit > 0 ? l.debit : null,
      l.credit > 0 ? l.credit : null,
      fmtBalance(l.runningBalance),
    ])
  }
  rows.push([`Period totals`, null, null, led.periodTotals.debit, led.periodTotals.credit, null])
  rows.push([`Closing balance (${dayjs(led.to).format('D MMM YYYY')})`, null, null, null, null, fmtBalance(led.closingBalance)])

  return buildXlsxBuffer({
    sheetName: 'Ledger',
    headerRow: ['Date', 'Entry', 'Description', 'Debit', 'Credit', 'Balance'],
    rows,
    columnWidths: [14, 16, 50, 14, 14, 18],
  })
}
```

- [ ] **Step 2: pdf builder** — landscape orientation

`src/app/(portal)/reports/ledger/export/_format/pdf.tsx`:

```tsx
import React from 'react'
import dayjs from 'dayjs'
import { PdfDocument, PdfTable } from '@/lib/export/pdf'
import type { Ledger } from '@/lib/cfo-reports'

function fmtBalance(signed: number): string {
  if (Math.abs(signed) < 0.005) return '—'
  const abs = Math.abs(signed).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return `${abs} ${signed >= 0 ? 'Dr' : 'Cr'}`
}

export function LedgerPdf({ led }: { led: Ledger }) {
  const periodLabel = `${dayjs(led.from).format('D MMM YYYY')} – ${dayjs(led.to).format('D MMM YYYY')}`
  const subtitle = `${led.code} ${led.accountName} · Opening ${fmtBalance(led.openingBalance)} · Closing ${fmtBalance(led.closingBalance)}`

  return (
    <PdfDocument title="General Ledger" periodLabel={periodLabel} subtitle={subtitle} orientation="landscape">
      <PdfTable
        columns={[
          { label: 'Date',        width: 70 },
          { label: 'Entry',       width: 80 },
          { label: 'Description', width: 300 },
          { label: 'Debit',       width: 80, align: 'right' },
          { label: 'Credit',      width: 80, align: 'right' },
          { label: 'Balance',     width: 100, align: 'right' },
        ]}
        numberFormat="money"
        rows={[
          ...led.lines.map((l) => [
            dayjs(l.entryDate).format('D MMM YYYY'),
            l.entryNo,
            l.description,
            l.debit > 0 ? l.debit : null,
            l.credit > 0 ? l.credit : null,
            fmtBalance(l.runningBalance),
          ] as (string | number | null)[]),
          ['Period totals', '', '', led.periodTotals.debit, led.periodTotals.credit, ''],
        ]}
      />
    </PdfDocument>
  )
}
```

- [ ] **Step 3: route handler** — wrap `fetchLedger` in try/catch, return 400 on the header-account error

```ts
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { fetchLedger } from '@/lib/cfo-reports'
import { exportXlsxResponse, exportPdfResponse } from '@/lib/export/response'
import { buildLedgerXlsx } from './_format/xlsx'
import { LedgerPdf } from './_format/pdf'
import dayjs from 'dayjs'

export async function GET(req: Request) {
  await requireRole(['principal', 'finance'])
  const url = new URL(req.url)
  const format = url.searchParams.get('format') === 'pdf' ? 'pdf' : 'xlsx'
  const code = url.searchParams.get('code')
  const from = url.searchParams.get('from') ?? dayjs().startOf('month').format('YYYY-MM-DD')
  const to = url.searchParams.get('to') ?? dayjs().format('YYYY-MM-DD')

  if (!code) return Response.json({ error: 'code is required' }, { status: 400 })
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return Response.json({ error: 'invalid from/to date' }, { status: 400 })
  }

  const supabase = await createClient()
  let led
  try {
    led = await fetchLedger(supabase, { code, from, to })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown error'
    return Response.json({ error: msg }, { status: 400 })
  }

  const filename = `ledger-${code}-${from}-${to}`
  if (format === 'xlsx') {
    return exportXlsxResponse({ filename, buffer: buildLedgerXlsx(led) })
  }
  return exportPdfResponse({ filename, element: <LedgerPdf led={led} /> })
}
```

- [ ] **Step 4: page edit** — `ledger/page.tsx` has the LedgerPicker client component in the action area. Add two `<Link>` Export buttons AFTER the LedgerPicker, inside the same flex container. Disable them visually when `!code` (the picker's required state). Forward all three params.

Concretely, in `ledger/page.tsx`, replace the action area:

```tsx
        <LedgerPicker accounts={accounts} selectedCode={code ?? ''} from={from} to={to} />
```

With:

```tsx
        <div className="flex items-center gap-3">
          <LedgerPicker accounts={accounts} selectedCode={code ?? ''} from={from} to={to} />
          {code ? (
            <>
              <Link
                href={`/reports/ledger/export?format=xlsx&code=${encodeURIComponent(code)}&from=${from}&to=${to}`}
                className="px-3 py-1.5 bg-surface hover:bg-surface-2 border border-hairline rounded-md text-xs font-mono text-graphite hover:text-ink transition-colors"
              >
                Export Excel
              </Link>
              <Link
                href={`/reports/ledger/export?format=pdf&code=${encodeURIComponent(code)}&from=${from}&to=${to}`}
                className="px-3 py-1.5 bg-surface hover:bg-surface-2 border border-hairline rounded-md text-xs font-mono text-graphite hover:text-ink transition-colors"
              >
                Export PDF
              </Link>
            </>
          ) : null}
        </div>
```

- [ ] **Step 5: smoke + commit**

```bash
curl -s -o ledger.xlsx -w "%{http_code}\n" -L --max-time 30 "http://localhost:3000/reports/ledger/export?format=xlsx&code=3030&from=2026-05-01&to=2026-05-15"
curl -s -o ledger.pdf  -w "%{http_code}\n" -L --max-time 30 "http://localhost:3000/reports/ledger/export?format=pdf&code=3030&from=2026-05-01&to=2026-05-15"
file ledger.xlsx ledger.pdf
rm -f ledger.xlsx ledger.pdf
# Header account should 400:
curl -s -w "%{http_code}\n" -L --max-time 30 "http://localhost:3000/reports/ledger/export?format=xlsx&code=1000&from=2026-05-01&to=2026-05-15"
# Expected: 400 (or 307 if auth, but the body should be a JSON error)
git add "src/app/(portal)/reports/ledger"
git -c user.email="chew.acchouzs@gmail.com" -c user.name="wenwei4046" commit -m "feat(export): General Ledger Excel + PDF (landscape) endpoint + page buttons"
```

---

### Task 13: Invoices listing export — `/statements/export`

**Files:** standard 4.

**Page**: `src/app/(portal)/statements/page.tsx` (the Invoices tab landing). It thin-wraps `<BillingView>`. The data fetch happens inside `BillingView` from `billing/_components/BillingView.tsx`.

**Page params**: `period?: string`.

- [ ] **Step 1: Read `BillingView.tsx`** to see what data the page renders. Extract or replicate the relevant Supabase query for the export. Likely candidate query: `supabase.from('invoices').select(...).gte('period_month', ...).lte('period_month', ...).order(...)`. The columns Excel needs to mirror are the on-screen list columns: invoice_no, company short_code, period_month, billing_mode, billable_to_type, total_amount, status, due_date.

- [ ] **Step 2: `_format/xlsx.ts`** — `buildInvoicesXlsx(rows)` where `rows` is the array shape returned by the Step 1 query, mapped to xlsx column order.

- [ ] **Step 3: `_format/pdf.tsx`** — `<InvoicesPdf rows={...} periodLabel={...} />` landscape orientation.

- [ ] **Step 4: `route.ts`** — read `period` searchParam, default to current month. Run the Step 1 query, format, respond. Filename `invoices-<YYYYMM>` (no separators in the month).

- [ ] **Step 5: page edit** — `statements/page.tsx` doesn't have an action area today (it's a thin wrapper). Add the Export buttons via `BillingView`'s header instead OR add them next to the `<StatementsTabHeader>`. Recommended: insert the two Export buttons immediately above the BillingView component, right-aligned. Pass `&period=${period}` if known.

```tsx
return (
  <div>
    <StatementsTabHeader active="invoices" />
    <div className="flex justify-end gap-2 -mb-6">
      <Link href={`/statements/export?format=xlsx${period ? `&period=${period}` : ''}`}
            className="...">Export Excel</Link>
      <Link href={`/statements/export?format=pdf${period ? `&period=${period}` : ''}`}
            className="...">Export PDF</Link>
    </div>
    <BillingView {...props} />
  </div>
)
```

The `period` value is obtained by awaiting `searchParams` first.

- [ ] **Step 6: smoke + commit**

```bash
curl -s -o inv.xlsx -w "%{http_code}\n" -L --max-time 30 "http://localhost:3000/statements/export?format=xlsx&period=2026-05"
curl -s -o inv.pdf  -w "%{http_code}\n" -L --max-time 30 "http://localhost:3000/statements/export?format=pdf&period=2026-05"
file inv.xlsx inv.pdf
rm -f inv.xlsx inv.pdf
git add "src/app/(portal)/statements/export" "src/app/(portal)/statements/page.tsx"
git -c user.email="chew.acchouzs@gmail.com" -c user.name="wenwei4046" commit -m "feat(export): Invoices listing Excel + PDF (landscape) endpoint + page buttons"
```

---

### Task 14: Monthly Statements listing export — `/statements/monthly/export`

**Files:** standard 4.

**Page**: `src/app/(portal)/statements/monthly/page.tsx` (the Monthly Statements landing). Already fetches `monthly_statements` joined to `companies` (see existing code lines 13–25 — `supabase.from('monthly_statements').select('*').order(...)`).

**Page params**: none today (the page shows all statements grouped by period).

- [ ] **Step 1: `_format/xlsx.ts`** — `buildStatementsXlsx(rows)`. Columns: Period, Subsidiary, Total Invoice, Total Contra, Net Amount, Status, Issued At, Paid At.

- [ ] **Step 2: `_format/pdf.tsx`** — `<StatementsPdf rows={...} />` landscape orientation, same columns.

- [ ] **Step 3: `route.ts`** — replicates the page's fetch (statements + companies, build a companyMap, project rows). Filename `statements-<YYYYMM>` where the month is taken from a `?period=` param if supplied, otherwise current month. Validation: if `period` is supplied, must match `/^\d{4}-\d{2}$/`.

- [ ] **Step 4: page edit** — add the two Export buttons in the page-head action area (currently the `Generate statements` button lives there for Finance role; add the Export Links next to it).

- [ ] **Step 5: smoke + commit**

```bash
curl -s -o stmts.xlsx -w "%{http_code}\n" -L --max-time 30 "http://localhost:3000/statements/monthly/export?format=xlsx&period=2026-05"
curl -s -o stmts.pdf  -w "%{http_code}\n" -L --max-time 30 "http://localhost:3000/statements/monthly/export?format=pdf&period=2026-05"
file stmts.xlsx stmts.pdf
rm -f stmts.xlsx stmts.pdf
git add "src/app/(portal)/statements/monthly"
git -c user.email="chew.acchouzs@gmail.com" -c user.name="wenwei4046" commit -m "feat(export): Monthly Statements listing Excel + PDF (landscape) endpoint + page buttons"
```

---

### Task 15: Payment Vouchers listing export — `/payments/export`

**Files:** standard 4.

**Page**: `src/app/(portal)/payments/page.tsx`. Reads 8 searchParams: `status, q, type, pool, from, to, min, max`. Fetches `payment_vouchers` joined to `payment_voucher_sources`/`chart_of_accounts` for pool + account labels.

- [ ] **Step 1: Read `payments/page.tsx`** to identify the FULL filter chain. Decide which filters apply server-side (Supabase `.eq`/`.gte`/etc.) vs in-memory after the fetch. The route handler must apply the SAME filters as the page so the exported set matches what's on screen.

- [ ] **Step 2: `_format/xlsx.ts`** — `buildVouchersXlsx(rows)`. Columns: Voucher No, Date, Direction (OR/PV), Type, Status, Payee, Amount, Bank, Pools, Categories, Description. (Match the page's table columns.)

- [ ] **Step 3: `_format/pdf.tsx`** — `<VouchersPdf rows={...} />` landscape orientation, same columns.

- [ ] **Step 4: `route.ts`** — accepts all 8 searchParams, runs the filtered fetch, formats, responds. Filename `payment-vouchers-<YYYYMMDD>` where the date is today.

```ts
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { exportXlsxResponse, exportPdfResponse } from '@/lib/export/response'
import { buildVouchersXlsx } from './_format/xlsx'
import { VouchersPdf } from './_format/pdf'
import dayjs from 'dayjs'

export async function GET(req: Request) {
  await requireRole(['principal', 'finance'])
  const url = new URL(req.url)
  const format = url.searchParams.get('format') === 'pdf' ? 'pdf' : 'xlsx'

  const supabase = await createClient()
  // Replicate the page's filter+fetch chain. Exact shape depends on the page's
  // current implementation — see Step 1.
  const rows = await fetchPaymentVouchersFiltered(supabase, {
    status: url.searchParams.get('status') ?? undefined,
    q: url.searchParams.get('q') ?? undefined,
    type: url.searchParams.get('type') ?? undefined,
    pool: url.searchParams.get('pool') ?? undefined,
    from: url.searchParams.get('from') ?? undefined,
    to: url.searchParams.get('to') ?? undefined,
    min: url.searchParams.get('min') ? parseFloat(url.searchParams.get('min')!) : undefined,
    max: url.searchParams.get('max') ? parseFloat(url.searchParams.get('max')!) : undefined,
  })

  const filename = `payment-vouchers-${dayjs().format('YYYYMMDD')}`
  if (format === 'xlsx') {
    return exportXlsxResponse({ filename, buffer: buildVouchersXlsx(rows) })
  }
  return exportPdfResponse({ filename, element: <VouchersPdf rows={rows} /> })
}
```

`fetchPaymentVouchersFiltered` should be extracted from `payments/page.tsx` into a shared helper (`lib/payments-list.ts` or similar) — both the page AND this route then call the same fetch. This is a real DRY improvement worth doing as part of this task.

- [ ] **Step 5: page edit** — the Payments page-head already has an action area (likely with filters / "New voucher" button). Add the two Export Links forwarding all 8 searchParams via `URLSearchParams`.

```tsx
const exportQs = new URLSearchParams(
  Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== ''))
).toString()
// ...
<Link href={`/payments/export?format=xlsx&${exportQs}`} className="...">Export Excel</Link>
<Link href={`/payments/export?format=pdf&${exportQs}`} className="...">Export PDF</Link>
```

- [ ] **Step 6: smoke + commit**

```bash
curl -s -o pv.xlsx -w "%{http_code}\n" -L --max-time 30 "http://localhost:3000/payments/export?format=xlsx&status=paid"
curl -s -o pv.pdf  -w "%{http_code}\n" -L --max-time 30 "http://localhost:3000/payments/export?format=pdf&status=paid"
file pv.xlsx pv.pdf
rm -f pv.xlsx pv.pdf
git add "src/app/(portal)/payments/export" "src/app/(portal)/payments/page.tsx" src/lib/payments-list.ts
git -c user.email="chew.acchouzs@gmail.com" -c user.name="wenwei4046" commit -m "feat(export): Payment Vouchers Excel + PDF (landscape) endpoint + page buttons + shared list helper"
```

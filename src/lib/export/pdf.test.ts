import { describe, it, expect, beforeAll } from 'vitest'
import React from 'react'
import { Text, View } from '@react-pdf/renderer'
import PDFParser, {
  type Output, type Page, type Text as PdfJsonText, type TextRun,
} from 'pdf2json'
import {
  renderPdfBuffer, PdfDocument, PdfTable, PdfSectionHead,
  type PdfColumn, type PdfRowKind,
} from './pdf'

// ---------------------------------------------------------------------------
// WHY THIS FILE ASSERTS GEOMETRY AND NOT JUST BYTES
//
// The original test here checked `buf.slice(0,4) === '%PDF'` and nothing else.
// That assertion cannot fail for any layout reason. @react-pdf/layout applies
// every style through an OPTIONAL call on the Yoga node -- see setYogaValue in
// @react-pdf/layout/lib/index.js, which does `yogaNode[fixedMethod]?.(...)`.
// If the Yoga build in node_modules is missing a setter (a version mismatch, a
// hand-patched WASM loader, a bundler swapping the binary), the style is
// DROPPED SILENTLY: no throw, no warning, and the renderer still emits a
// structurally perfect PDF in which every box has collapsed onto its
// neighbours. Bytes starting with %PDF prove only that the writer ran.
//
// So we render through the REAL wrappers (all 23 export routes go through
// PdfDocument / PdfTable / renderPdfBuffer), parse with pdf2json, and assert on
// where things actually landed.
//
// CHOICE OF ASSERTIONS: structural invariants, not a golden coordinate dump.
// A pinned snapshot of every x/y would break on a @react-pdf/renderer patch
// bump or a font-metric tweak, and a test that cries wolf gets deleted. Every
// assertion below is either (a) derivable from the test's own inputs -- column
// x deltas must equal the declared column widths -- or (b) a property true of
// any correct layout and false of a collapsed one: strictly increasing column
// positions, no two columns sharing an x, rows advancing monotonically down the
// page, page overflow happening at all, the fixed footer's render callback
// firing on every page, and bold/italic/font-face flags differing where the
// styles differ. The only quasi-golden numbers are the declared column widths,
// which live a few lines above the assertion that consumes them -- plus the four
// page-frame anchors, which say so where they are used.
//
// WHAT THIS FILE ACTUALLY COVERS, MEASURED
// ----------------------------------------
// The silently-droppable setters are exactly the fourteen routed through
// setYogaValue, which is the only place @react-pdf/layout uses an optional call.
// Every other Yoga setter it touches (setJustifyContent, setAlignItems,
// setFlexDirection, setDisplay, setOverflow, setFlexWrap, setPositionType,
// setAspectRatio) is called WITHOUT `?.`, so a missing one throws and needs no
// test here.
//
// Deleting each of the fourteen from the Yoga prototype and re-running this file
// (tools/yoga-setter-sweep.mjs does exactly that) gives:
//
//   CAUGHT (6)     setWidth  setMargin  setPadding  setPosition  setBorder
//                  setFlexGrow
//   UNREACHABLE (8)
//     setHeight setMaxHeight setMinWidth setMaxWidth setGap
//     setFlexBasis setFlexShrink
//                  -- no style anywhere under the PDF formatters sets height,
//                     maxHeight, minWidth, maxWidth, gap/rowGap/columnGap or a
//                     numeric flexBasis/flexShrink, so these setters are never
//                     called with a value that changes anything. `flex: 1`
//                     resolves flexBasis to 0% (setFlexBasisPercent, a different
//                     method) and flexShrink to 1 (already the default).
//     setMinHeight -- set once, `minHeight: 14` on styles.row in ./pdf.tsx, but
//                     a row's own content is ~19pt tall, so the minimum never
//                     binds and dropping it is byte-identical.
//
// So the coverage gap is not "eight untested setters"; it is eight setters that
// cannot affect any document this app produces. If a formatter later sets one of
// those styles for real, it needs a fixture here -- that is the trigger to
// revisit this list.
// ---------------------------------------------------------------------------

const A4_WIDTH_PT = 595.276

interface TextItem {
  page: number
  /** pdf2json units converted to PDF points via a scale derived from the page. */
  x: number
  y: number
  text: string
  bold: boolean
  italic: boolean
  /** pdf2json font-face id -- differs between Helvetica and Courier. */
  face: number
  size: number
}

/**
 * pdf2json cannot be handed a pooled Buffer. Its parseBuffer does:
 *
 *   if (b.buffer.byteLength !== b.length) b = Buffer.from(b.buffer, 0, b.byteLength)
 *
 * -- re-wrapping from offset 0 of the UNDERLYING ArrayBuffer and discarding
 * `byteOffset`. Node carves every allocation under 4096 bytes out of a shared
 * 8 KiB pool, so a small PDF is a view at some non-zero offset, and pdf2json
 * then parses that many bytes of unrelated pool memory followed by a PDF with
 * its trailer sliced off. pdf.js reads a truncated `startxref`, seeks into the
 * middle of an object and reports "Invalid XRef stream header".
 *
 * It presents as flakiness, because the offset depends on where the pool cursor
 * happens to be: the same fixture parsed 39 times out of 40 in one measurement
 * and 0 times out of 8 in another. Documents at or above 4096 bytes are never
 * pooled, which is why the large fixture never showed it.
 *
 * Copying the exact byte range into its own ArrayBuffer makes pdf2json's re-wrap
 * a no-op. Do not "fix" a parse failure here by padding a fixture past 4096
 * bytes -- that only hides it until the fixture shrinks again.
 */
function detach(buf: Buffer): Buffer {
  return Buffer.from(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength))
}

function parsePdf(buf: Buffer): Promise<Output> {
  const detached = detach(buf)
  // Guard, so deleting detach() fails loudly rather than reintroducing the flake.
  expect(detached.byteOffset, 'pdf2json must be given a detached buffer').toBe(0)
  return new Promise<Output>((resolve, reject) => {
    const p = new PDFParser()
    p.on('pdfParser_dataError', (e) => reject(e.parserError ?? e))
    p.on('pdfParser_dataReady', resolve)
    p.parseBuffer(detached)
  })
}

/**
 * Flatten to {page, x, y, text, font flags}. x/y are converted to PDF points
 * using a scale derived from the page itself, so nothing depends on pdf2json's
 * internal unit.
 *
 * pdf2json reports x about 4pt to the LEFT of the true PDF x. That offset is
 * measured, not assumed: the running head is a direct child of Page, so its true
 * x IS the 36pt page padding, and it reports at 32; a table header cell (36pt
 * page padding + 4pt cell padding = 40pt) reports at 36; and deleting the padding
 * setter entirely reports -4, the same offset seen from zero. PAGE_FRAME below
 * carries the offset so absolute positions can be asserted, not just deltas.
 */
function flatten(doc: Output): TextItem[] {
  const out: TextItem[] = []
  const pages: Page[] = doc.Pages ?? []
  pages.forEach((pg, pi) => {
    const scale = A4_WIDTH_PT / pg.Width
    ;(pg.Texts ?? []).forEach((t: PdfJsonText) => {
      const runs: TextRun[] = t.R ?? []
      const text = runs.map((r) => decodeURIComponent(r.T)).join('')
      // TS = [fontFaceId, fontSize, boldFlag, italicFlag]
      const ts: number[] = runs[0]?.TS ?? [0, 0, 0, 0]
      out.push({
        page: pi,
        x: t.x * scale,
        y: t.y * scale,
        text,
        face: ts[0],
        size: ts[1],
        bold: ts[2] === 1,
        italic: ts[3] === 1,
      })
    })
  })
  return out
}

/** Items sharing a y on one page, left to right. react-pdf splits a string into
 *  several Text runs, so a "row" is every item at the same y. */
function lineAt(items: TextItem[], page: number, y: number, tol = 0.6): TextItem[] {
  return items
    .filter((i) => i.page === page && Math.abs(i.y - y) <= tol)
    .sort((a, b) => a.x - b.x)
}

function distinctYs(items: TextItem[], page: number): number[] {
  const ys = new Set<number>()
  items.filter((i) => i.page === page).forEach((i) => ys.add(+i.y.toFixed(1)))
  return [...ys].sort((a, b) => a - b)
}

/** y of the line containing the given text on page 0. */
function yOf(items: TextItem[], label: string): number {
  const hit = items.find((i) => i.page === 0 && i.text.trim() === label)
  if (!hit) throw new Error(`text "${label}" not found on page 0`)
  return hit.y
}

// --- the document under test -----------------------------------------------
// Table A is a geometry probe: all columns left-aligned, so each column's text
// starts exactly at that column's left edge and the x deltas MUST equal the
// declared widths. Table B is shaped like a real report -- right-aligned money,
// rowKinds, repeatHeader, sized to overflow -- so we exercise what the 23
// routes actually exercise.

const PROBE_COLS: PdfColumn[] = [
  { label: 'Aaa', width: 160 },
  { label: 'Bbb', width: 120 },
  { label: 'Ccc', width: 120 },
  { label: 'Ddd', width: 100 },
]
const PROBE_ROWS: (string | number | null)[][] = [
  ['r0c0', 'r0c1', 'r0c2', 'r0c3'],
  ['r1c0', 'r1c1', 'r1c2', 'r1c3'],
  ['r2c0', 'r2c1', 'r2c2', 'r2c3'],
]

const REPORT_COLS: PdfColumn[] = [
  { label: 'Account', width: 280 },
  { label: 'Debit', width: 100, align: 'right' },
  { label: 'Credit', width: 100, align: 'right' },
]
const DETAIL_COUNT = 70
const REPORT_ROWS: (string | number | null)[][] = [
  ['CURRENT ASSETS', null, null],
  ...Array.from({ length: DETAIL_COUNT }, (_, i) => [
    `${4000 + i} Ledger account`,
    // Same digit count in every row AND in both money columns: Courier is
    // monospace, so a right-aligned column of equal-length numbers lands on
    // exactly one x, and the two columns' x values differ by exactly the
    // declared column width. That is what makes the alignment assertion exact.
    1000000 + i,
    2000000 + i,
  ]),
  ['Subtotal', 1000000, 2000000],
  ['TOTAL', 0, 0],
]
const REPORT_KINDS: PdfRowKind[] = [
  'section',
  ...Array.from({ length: DETAIL_COUNT }, () => 'detail' as PdfRowKind),
  'group',
  'total',
]

export function buildGeometryFixture(): React.ReactElement {
  return React.createElement(
    PdfDocument,
    { title: 'Trial Balance', subtitle: 'Geometry regression fixture', periodLabel: 'May 2026' },
    React.createElement(PdfTable, { columns: PROBE_COLS, rows: PROBE_ROWS }),
    React.createElement(PdfSectionHead, { label: 'Ledger detail' }),
    React.createElement(PdfTable, {
      columns: REPORT_COLS,
      rows: REPORT_ROWS,
      numberFormat: 'money',
      rowKinds: REPORT_KINDS,
      repeatHeader: true,
    }),
  )
}

// --- fixture B: the flex layout the bespoke formatters use -------------------
// PdfTable lays every column out at a FIXED width, so a fixture built only from
// it can never exercise the flex setters -- and eight of the fourteen silently
// droppable setters are therefore unreachable from fixture A no matter what is
// asserted about it. The three bespoke document formatters do not use PdfTable:
//   src/app/(portal)/billing/_format/invoice-doc-pdf.tsx
//   src/app/(portal)/billing/_format/credit-note-doc-pdf.tsx
//   src/app/(portal)/payments/_format/voucher-doc-pdf.tsx
// all draw on one sheet (src/lib/export/doc-sheet.tsx, 2026-10-15), whose item
// and total rows are `flexDirection: 'row'` with a `flex: 1` first cell and
// fixed-width right-aligned amounts (DocItemRow, DocTotals). That is what this
// fixture reproduces.
//
// It is the `flex: 1` that matters. It expands the label to fill the row, which
// pushes the amount cell against the right edge of the content box. Drop
// setFlexGrow or setFlexBasisPercent and the label collapses to its text width,
// the amount slides ~420pt to the left, and -- as always -- nothing throws and a
// valid PDF still comes out.

const AMOUNT_COL_WIDTH = 110
const FLEX_ROW_COUNT = 30
const FLEX_ROWS: [string, string][] = Array.from({ length: FLEX_ROW_COUNT }, (_, i) => [
  `Billing line ${String(i + 1).padStart(2, '0')} recharge`,
  (123456.78 + i * 1111.11).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
])
FLEX_ROWS[0] = ['Subscription fee', '123,456.78']

export function buildFlexFixture(): React.ReactElement {
  const amountRow = (label: string, amount: string, key: number) =>
    React.createElement(
      View,
      { key, style: { flexDirection: 'row', paddingVertical: 6 } },
      // flex: 1 -- expands to fill, pushing the amount cell to the right edge
      React.createElement(Text, { style: { flex: 1, fontSize: 10, paddingLeft: 4 } }, label),
      React.createElement(
        Text,
        {
          style: {
            width: AMOUNT_COL_WIDTH,
            textAlign: 'right' as const,
            fontFamily: 'Courier',
            fontSize: 9,
          },
        },
        amount,
      ),
    )
  return React.createElement(
    PdfDocument,
    { title: 'Invoice INV-0001', subtitle: 'Flex regression fixture', periodLabel: 'May 2026' },
    // headerRow: space-between, the other way these formatters reach the right edge
    React.createElement(
      View,
      { style: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 } },
      React.createElement(Text, { style: { fontSize: 10 } }, 'BILLED TO'),
      React.createElement(Text, { style: { fontFamily: 'Courier', fontSize: 9 } }, 'REF0000001'),
    ),
    ...FLEX_ROWS.map(([l, a], i) => amountRow(l, a, i)),
    // totalRow -- same shape, bold, with a rule above it
    React.createElement(
      View,
      { style: { flexDirection: 'row', paddingVertical: 8, borderTop: '0.5pt solid #aaa' } },
      React.createElement(
        Text,
        { style: { flex: 1, fontFamily: 'Helvetica-Bold', fontSize: 11, paddingLeft: 4 } },
        'TOTAL DUE',
      ),
      React.createElement(
        Text,
        {
          style: {
            width: AMOUNT_COL_WIDTH,
            textAlign: 'right' as const,
            fontFamily: 'Courier',
            fontSize: 9,
          },
        },
        '703,703.57',
      ),
    ),
  )
}

describe('renderPdfBuffer', () => {
  let buf: Buffer
  let doc: Output
  let items: TextItem[]

  beforeAll(async () => {
    buf = await renderPdfBuffer(buildGeometryFixture())
    doc = await parsePdf(buf)
    items = flatten(doc)
  }, 60_000)

  // --- the original assertion, kept verbatim -------------------------------
  it('produces a PDF buffer whose first 4 bytes are %PDF', () => {
    expect(buf.length).toBeGreaterThan(100)
    // PDF files start with the magic bytes '%PDF'.
    expect(buf.slice(0, 4).toString('ascii')).toBe('%PDF')
  })

  // --- geometry ------------------------------------------------------------

  it('overflows onto multiple pages instead of collapsing onto one', () => {
    // 70 detail rows at ~14pt cannot fit on one A4 page. A layout whose box
    // heights have collapsed produces exactly one page.
    expect(doc.Pages.length).toBeGreaterThanOrEqual(2)
    // Sanity band, not a golden: catches the opposite failure (every row on its
    // own page) without breaking on a font-metric change.
    expect(doc.Pages.length).toBeLessThanOrEqual(5)
  })

  it('places each column at its declared width offset', () => {
    // The strong one. Column i's left edge sits sum(widths[0..i-1]) to the right
    // of column 0's, so consecutive x deltas must equal the declared widths.
    // Derived entirely from PROBE_COLS -- no golden coordinates.
    const labels = PROBE_COLS.map((c) => c.label)
    const header = lineAt(items, 0, yOf(items, labels[0].toUpperCase()))
    const cells = labels.map((l) =>
      header.find((i) => i.text.trim().toUpperCase() === l.toUpperCase()),
    )
    cells.forEach((c, i) => {
      expect(c, `header cell "${labels[i]}" missing from the header row`).toBeDefined()
    })
    const xs = cells.map((c) => c!.x)

    // no two columns sharing an x -- the collapse signature is every cell drawn
    // at the same place
    expect(
      new Set(xs.map((x) => +x.toFixed(1))).size,
      `columns share an x position: ${xs.map((x) => x.toFixed(1)).join(', ')}`,
    ).toBe(PROBE_COLS.length)
    // strictly increasing
    for (let i = 1; i < xs.length; i++) {
      expect(xs[i], `column ${i} is not to the right of column ${i - 1}`).toBeGreaterThan(xs[i - 1])
    }
    // and each gap equals the declared width of the column to its left
    for (let i = 1; i < xs.length; i++) {
      expect(
        xs[i] - xs[i - 1],
        `gap between columns ${i - 1} and ${i} should equal the declared width ${PROBE_COLS[i - 1].width}pt`,
      ).toBeCloseTo(PROBE_COLS[i - 1].width, 0)
    }

    // the data rows sit on the same column grid as the header
    for (const row of PROBE_ROWS) {
      const cellTexts = row.map(String)
      const found = cellTexts.map((t) => items.find((i) => i.page === 0 && i.text.trim() === t))
      found.forEach((f, i) => {
        expect(f, `probe cell "${cellTexts[i]}" not found`).toBeDefined()
        expect(f!.x, `probe cell "${cellTexts[i]}" is off its column`).toBeCloseTo(xs[i], 0)
      })
    }
  })

  it('right-aligns the money columns onto one x per column, without overlap', () => {
    // Equal-length monospace numbers right-aligned in equal-width columns: every
    // detail row must share one x per column, and the gap between the two money
    // columns must equal the Debit column's declared width.
    const debits = items.filter((i) => /^1,0\d\d,\d\d\d\.00$/.test(i.text.trim()))
    expect(debits.length, 'money cells missing entirely').toBeGreaterThanOrEqual(DETAIL_COUNT)
    const debitXs = [...new Set(debits.map((i) => +i.x.toFixed(1)))]
    expect(
      debitXs.length,
      `Debit column is not aligned; found ${debitXs.length} x positions: ${debitXs.join(', ')}`,
    ).toBe(1)

    const credits = items.filter((i) => /^2,0\d\d,\d\d\d\.00$/.test(i.text.trim()))
    expect(credits.length, 'credit cells missing entirely').toBeGreaterThanOrEqual(DETAIL_COUNT)
    const creditXs = [...new Set(credits.map((i) => +i.x.toFixed(1)))]
    expect(
      creditXs.length,
      `Credit column is not aligned; found ${creditXs.length} x positions: ${creditXs.join(', ')}`,
    ).toBe(1)

    // Credit sits exactly one Debit-column-width to the right of Debit.
    expect(
      creditXs[0] - debitXs[0],
      `gap between the money columns should equal the Debit width ${REPORT_COLS[1].width}pt`,
    ).toBeCloseTo(REPORT_COLS[1].width, 0)

    // the zero cells in the TOTAL row render as the em-dash, not '0.00'
    expect(items.some((i) => i.text.trim() === '—'), 'zero cells missing').toBe(true)
  })

  it('advances rows monotonically down each page', () => {
    // A collapsed layout stacks every row on one y. Page 0 is always full, so
    // it must carry many distinct row positions; the last page holds only the
    // tail of the table, so we only require monotonicity there.
    expect(
      distinctYs(items, 0).length,
      'page 1 has too few distinct row positions -- rows are stacked',
    ).toBeGreaterThan(20)
    for (let p = 0; p < doc.Pages.length; p++) {
      const ys = distinctYs(items, p)
      for (let i = 1; i < ys.length; i++) expect(ys[i]).toBeGreaterThan(ys[i - 1])
    }
    // and the detail rows are evenly spaced -- a real table, not a pile
    const detail = items.filter((i) => i.page === 1 && /^\d{4}$/.test(i.text.trim()))
    const rowYs = [...new Set(detail.map((i) => +i.y.toFixed(2)))].sort((a, b) => a - b)
    expect(rowYs.length, 'not enough detail rows on page 2 to measure spacing').toBeGreaterThan(5)
    const gaps = rowYs.slice(1).map((y, i) => y - rowYs[i])
    const med = gaps.slice().sort((a, b) => a - b)[Math.floor(gaps.length / 2)]
    expect(med, 'detail rows are stacked on top of each other').toBeGreaterThan(5)
    for (const g of gaps) expect(g).toBeCloseTo(med, 0)
  })

  it('emits the account rows in the order they were supplied', () => {
    const codes = items
      .filter((i) => /^\d{4}$/.test(i.text.trim()))
      .sort((a, b) => a.page - b.page || a.y - b.y || a.x - b.x)
      .map((i) => parseInt(i.text.trim(), 10))
    expect(codes.length).toBeGreaterThanOrEqual(DETAIL_COUNT)
    const expected = Array.from({ length: DETAIL_COUNT }, (_, i) => 4000 + i)
    expect(codes.slice(0, DETAIL_COUNT)).toEqual(expected)
  })

  it('repeats the fixed table header on every page', () => {
    for (let p = 0; p < doc.Pages.length; p++) {
      const hdr = items.filter((i) => i.page === p && i.text.trim() === 'ACCOUNT')
      expect(hdr.length, `page ${p} lost the repeated table header`).toBe(1)
    }
  })

  it('runs the fixed footer render callback on every page', () => {
    const total = doc.Pages.length
    for (let p = 0; p < total; p++) {
      const joined = items
        .filter((i) => i.page === p)
        .sort((a, b) => a.y - b.y || a.x - b.x)
        .map((i) => i.text)
        .join('')
      expect(joined.replace(/\s+/g, ' '), `page ${p} footer missing`).toContain(
        `Page ${p + 1} of ${total}`,
      )
    }
  })

  it('distinguishes bold, italic and monospace where the styles differ', () => {
    // The title is the largest text on page 1. (Selecting it by string would
    // also match the running head, which repeats the title inside it.)
    const page0 = items.filter((i) => i.page === 0)
    const title = page0.reduce((a, b) => (b.size > a.size ? b : a))
    expect(title.text, 'largest text on page 1 is not the title').toContain('Trial Balance')
    expect(title.bold, 'Helvetica-Bold title did not render bold').toBe(true)

    const runningHead = page0.find((i) => i.text.includes('HOUZS'))
    expect(runningHead, 'running head missing').toBeDefined()
    expect(runningHead!.italic, 'Helvetica-Oblique running head did not render italic').toBe(true)

    // money cells are Courier, label cells are Helvetica -- different faces
    const money = items.find((i) => /^1,000,000\.00$/.test(i.text.trim()))
    const label = items.find((i) => i.text.trim() === '4000')
    expect(money, 'money cell missing').toBeDefined()
    expect(label, 'label cell missing').toBeDefined()
    expect(
      money!.face,
      'Courier money cell shares a font face with the Helvetica label cell',
    ).not.toBe(label!.face)

    // the TOTAL row is Helvetica-Bold where the detail rows are not
    const totalLabel = items.find((i) => i.text.trim() === 'TOTAL')
    expect(totalLabel, 'TOTAL row missing').toBeDefined()
    expect(totalLabel!.bold, 'TOTAL row did not render bold').toBe(true)
    expect(label!.bold, 'detail row should not be bold').toBe(false)
  })

  it('anchors the layout to the page frame, not merely to itself', () => {
    // WHY THIS TEST EXISTS ON TOP OF THE COLUMN-DELTA TEST ABOVE
    // ---------------------------------------------------------
    // Every other geometry assertion in this file is a DELTA -- column x minus
    // column x, row y minus row y. Deltas are the right shape for most collapse
    // modes, but they are blind to a whole class: drop the page `padding` or a
    // `margin` and EVERY box shifts by the same amount, so every delta still
    // checks out while the document silently loses its margins and repaginates.
    // That was measured, not imagined: with `setPadding` deleted from the Yoga
    // prototype this file stayed 10/10 green while the leftmost text moved from
    // x=32 to x=-4, i.e. off the page.
    //
    // The cure is to measure against the page EDGE. Each number below is a
    // deliberately pinned golden -- the only ones in the file -- and each traces
    // to a style constant in ./pdf.tsx, less the ~4pt pdf2json offset documented
    // on flatten(). Re-pin them only for a deliberate style or renderer change,
    // and never to turn a red run green: the message on each says what breaking
    // it means.
    //
    // Measured effect of deleting each setter (baseline in brackets):
    //   setPadding   minX -4 [32],  minY -2.99 [33.01],  header y 53.74 [93.74]
    //   setMargin    header y 75.74 [93.74]
    //   setWidth     minX 183.16 [32], minY 188.93 [33.01]
    //   setPosition  minY 31.20 [33.01], distinct x 13 [14]
    const PAGE_FRAME = {
      leftEdge: 32,      // page padding 36pt, as pdf2json reports it
      topEdge: 33.01,    // the same 36pt padding plus the first line box
      firstHeaderY: 93.74, // AAA header row: title + subtitle + their margins
      distinctXOnPage0: 14,
    }

    const page0 = items.filter((i) => i.page === 0)
    const minX = Math.min(...page0.map((i) => i.x))
    const minY = Math.min(...page0.map((i) => i.y))

    expect(
      minX,
      `leftmost text on page 1 sits at x=${minX.toFixed(2)}, expected ~${PAGE_FRAME.leftEdge} ` +
        `(the 36pt page padding). The page padding or a margin was dropped, which every ` +
        `column-delta assertion in this file survives.`,
    ).toBeCloseTo(PAGE_FRAME.leftEdge, 0)

    expect(
      minY,
      `topmost text on page 1 sits at y=${minY.toFixed(2)}, expected ~${PAGE_FRAME.topEdge} ` +
        `(the 36pt page padding). The page padding or a margin was dropped.`,
    ).toBeCloseTo(PAGE_FRAME.topEdge, 0)

    // The table header's absolute y. Everything above it -- the running head, the
    // title, the subtitle and their margins -- has to have taken up its real
    // height for this to land. A dropped `marginBottom` shows up here and nowhere
    // else, because it moves the whole table up as one block.
    const headerY = yOf(items, PROBE_COLS[0].label.toUpperCase())
    expect(
      headerY,
      `the first table header row sits at y=${headerY.toFixed(2)}, expected ` +
        `~${PAGE_FRAME.firstHeaderY}. The heading block above it collapsed -- a dropped ` +
        `margin on the title, subtitle or header.`,
    ).toBeCloseTo(PAGE_FRAME.firstHeaderY, 0)

    // An exact count, not a floor. The floor version ("more than one x") passes
    // with the footer sitting on top of the table; this catches a single column
    // or a single absolutely-positioned element losing its place.
    const distinctX = new Set(page0.map((i) => +i.x.toFixed(2))).size
    expect(
      distinctX,
      `page 1 carries ${distinctX} distinct x positions, expected exactly ` +
        `${PAGE_FRAME.distinctXOnPage0}. Two elements that should be on different ` +
        `columns have landed on the same one, or an absolutely-positioned element ` +
        `(the fixed footer) lost its offset.`,
    ).toBe(PAGE_FRAME.distinctXOnPage0)
  })

  it('draws the table rules and shaded rows', () => {
    const rules = doc.Pages.reduce((n, p) => n + (p.HLines?.length ?? 0), 0)
    const fills = doc.Pages.reduce((n, p) => n + (p.Fills?.length ?? 0), 0)
    expect(rules, 'no horizontal row rules drawn').toBeGreaterThan(DETAIL_COUNT / 2)
    expect(fills, 'no shaded rows drawn').toBeGreaterThan(5)
  })
})

describe('renderPdfBuffer — flex layout (the bespoke document formatters)', () => {
  // Everything above renders through PdfTable, which lays every column out at a
  // FIXED width. That makes the flex setters unreachable: with setFlexGrow,
  // setFlexBasis, setFlexShrink, setHeight, setGap, setMinWidth, setMinHeight,
  // setMaxWidth or setMaxHeight deleted from the Yoga prototype, the suite above
  // stays entirely green because no style in it depends on them.
  //
  // The invoice, credit-note and payment-voucher formatters do not use PdfTable.
  // They lay amount rows out as a flex row with a `flex: 1` label, which is what
  // this fixture reproduces -- so this block is where those setters get tested.
  let buf: Buffer
  let doc: Output
  let items: TextItem[]

  beforeAll(async () => {
    buf = await renderPdfBuffer(buildFlexFixture())
    doc = await parsePdf(buf)
    items = flatten(doc)
  }, 60_000)

  it('expands the flex:1 label so the amount column reaches the page right edge', () => {
    // THE ASSERTION THAT MATTERS. `flex: 1` on the label is the only thing
    // pushing the amount cell right; without it the label shrinks to its text
    // width and the amount lands ~420pt further left, hard against the label.
    // Both edges are page-frame anchors, so this also fails if the page padding
    // goes -- see the equivalent test on the table fixture above for why deltas
    // alone cannot catch that.
    //
    // Derived, not golden: right-aligned Courier text ends at the content right
    // edge, so its reported left x is
    //   pageWidth - padding - textWidth - pdf2jsonOffset
    //   = 595.28 - 36 - (10 chars x 5.4pt) - 4  = 501.28
    const PADDING = 36
    const PDF2JSON_X_OFFSET = 4
    const COURIER_9_CHAR_W = 5.4 // 0.6em at fontSize 9
    const amountText = '123,456.78'
    const expectedX =
      A4_WIDTH_PT - PADDING - amountText.length * COURIER_9_CHAR_W - PDF2JSON_X_OFFSET

    const amount = items.find((i) => i.page === 0 && i.text.trim() === amountText)
    expect(amount, `amount cell "${amountText}" not found`).toBeDefined()
    expect(
      amount!.x,
      `the amount cell sits at x=${amount?.x.toFixed(2)}, expected ~${expectedX.toFixed(2)} ` +
        `(hard against the content right edge). The flex:1 label did not expand, so ` +
        `flexGrow/flexBasis was dropped -- or the page padding was.`,
    ).toBeCloseTo(expectedX, 0)

    // ...and the label itself starts at the content left edge (padding + its own
    // paddingLeft: 4), so a collapse that moved BOTH cells would still be caught.
    const label = items.find((i) => i.page === 0 && i.text.trim() === 'Subscription fee')
    expect(label, 'the flex:1 label cell is missing').toBeDefined()
    expect(
      label!.x,
      `the flex:1 label starts at x=${label?.x.toFixed(2)}, expected ~${PADDING} ` +
        `(36pt page padding + 4pt paddingLeft - 4pt pdf2json offset)`,
    ).toBeCloseTo(PADDING, 0)
  })

  it('keeps every amount on one right-aligned x, including the bold total row', () => {
    // The total row differs from the detail rows in font, size and padding, but
    // its amount cell has the same width and alignment, so it must land on the
    // SAME x. A flex or width setter that survives on one row and not another
    // shows up here and nowhere else.
    const amounts = items.filter((i) => /^\d{3},\d{3}\.\d{2}$/.test(i.text.trim()))
    expect(amounts.length, 'amount cells missing').toBeGreaterThanOrEqual(FLEX_ROW_COUNT)
    const xs = [...new Set(amounts.map((i) => +i.x.toFixed(1)))]
    expect(
      xs.length,
      `amount cells are not aligned; found ${xs.length} x positions: ${xs.join(', ')}`,
    ).toBe(1)
  })

  it('pushes the space-between header to both edges of the content box', () => {
    // justifyContent: 'space-between' is not itself droppable -- the layout lib
    // calls setJustifyContent without the optional-call guard, so a missing one
    // throws. What IS droppable is the padding this measures against.
    const left = items.find((i) => i.page === 0 && i.text.trim() === 'BILLED TO')
    const right = items.find((i) => i.page === 0 && i.text.trim() === 'REF0000001')
    expect(left, 'left header cell missing').toBeDefined()
    expect(right, 'right header cell missing').toBeDefined()
    // 36pt page padding, less the 4pt pdf2json offset documented on flatten()
    expect(
      left!.x,
      'the left header cell is not at the content left edge',
    ).toBeCloseTo(32, 0)
    expect(
      right!.x - left!.x,
      'the space-between header collapsed -- the two cells are not at opposite edges',
    ).toBeGreaterThan(400)
  })

  it('advances the amount rows monotonically down the page', () => {
    // paddingVertical on each row is what separates them. Drop it and every row
    // stacks on one y while the document still renders.
    const ys = distinctYs(items, 0)
    expect(ys.length, 'rows are stacked on one y').toBeGreaterThan(FLEX_ROW_COUNT)
    for (let i = 1; i < ys.length; i++) expect(ys[i]).toBeGreaterThan(ys[i - 1])
  })
})

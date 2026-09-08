/**
 * Deployment health probe for the yoga-layout WebAssembly fix.
 *
 * WHY THIS ROUTE EXISTS
 * ---------------------
 * yoga-layout ships its flexbox engine as a base64 Emscripten blob and compiles it
 * with WebAssembly.instantiate() at first render. workerd forbids that, so without
 * tools/patch-yoga-wasm.mjs every PDF export route returns HTTP 500 — and neither
 * `next build` nor `opennextjs-cloudflare build` says a word about it.
 *
 * tools/assert-open-next-wasm.mjs catches a MISSING fix by inspecting the bundle.
 * It cannot catch a fix that is present and fails to load at runtime, because it
 * reads the shape of the code and not which branch executes. Only a real request to
 * a real worker can tell those apart. This route is the target of that request; see
 * tools/smoke-worker-pdf.mjs.
 *
 * It renders through the same PdfDocument/PdfTable wrappers as the 23 export routes,
 * so it exercises the identical Yoga path — including the `fixed` footer with its
 * page-number render callback and a repeating header, which are the parts a flat
 * table never reaches.
 *
 * DISABLED BY DEFAULT. Without PDF_WASM_SMOKE=1 in the worker's environment this
 * returns 404, so it is inert in production. The smoke script sets it for the
 * lifetime of one `wrangler dev` process; nothing sets it on a deploy.
 */
import React from 'react'
import { PdfDocument, PdfTable, renderPdfBuffer, type PdfColumn } from '@/lib/export/pdf'

export const dynamic = 'force-dynamic'

const COLUMNS: PdfColumn[] = [
  { label: 'Date', width: 90 },
  { label: 'Description', width: 250 },
  { label: 'Debit', width: 100, align: 'right' },
  { label: 'Credit', width: 100, align: 'right' },
  { label: 'Balance', width: 100, align: 'right' },
]

// Deterministic, and long enough to force a page break so pagination and the
// repeating header are exercised rather than merely present.
//
// Debit and Balance are deliberately kept to the SAME digit count across all 60
// rows -- 123,456.78 .. 124,253.28 and 900,000.00 .. 854,502.40, both ten
// characters. Money cells are Courier (monospace) and right-aligned, and pdf2json
// reports a text run by its LEFT edge, so two right-aligned columns are separated
// by exactly the declared column widths only when their strings are equally long.
// Let the digit counts differ and the separation comes up short by one character
// width, which would force the smoke gate to carry a font-metric fudge factor
// instead of a number derived from the column widths. See tools/smoke-worker-pdf.mjs.
const ROWS: (string | number | null)[][] = Array.from({ length: 60 }, (_, i) => [
  `${String((i % 28) + 1).padStart(2, '0')}/08/2026`,
  `TXN ${1000 + i} INTERNAL BILLING ALLOCATION`,
  123456.78 + i * 13.5,
  i % 3 === 0 ? -(500 + i) : 0,
  900000 - i * 771.4,
])

export async function GET() {
  if (process.env.PDF_WASM_SMOKE !== '1') {
    // Body is diagnostic: a 404 from the router itself looks different, which
    // matters because the two failures have completely different causes.
    return new Response('PDF_WASM_HEALTH_DISABLED', { status: 404 })
  }
  try {
    const element = React.createElement(
      PdfDocument,
      {
        title: 'WASM Health Probe',
        subtitle: 'Synthetic document — not a report',
        periodLabel: 'FY2026',
        orientation: 'landscape' as const,
      },
      React.createElement(PdfTable, {
        columns: COLUMNS,
        rows: ROWS,
        numberFormat: 'money' as const,
        repeatHeader: true,
      }),
    )
    const buf = await renderPdfBuffer(element)
    return new Response(new Uint8Array(buf), {
      headers: { 'content-type': 'application/pdf', 'cache-control': 'no-store' },
    })
  } catch (e) {
    // Return the error as text so the smoke script can report the real cause
    // instead of an opaque 500.
    const err = e as Error
    return new Response(
      `PDF_WASM_HEALTH_ERROR\n${err?.name}: ${err?.message}\n${err?.stack ?? ''}`,
      { status: 500, headers: { 'content-type': 'text/plain' } },
    )
  }
}

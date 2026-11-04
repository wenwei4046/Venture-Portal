// Print listing (2026-11-04, the Repayment Schedule — the user: "print 就是 right click header print listing 这样"):
// the rows a table has on show, filtered and sorted as the reader sees them, on a plain A4 sheet in a window of
// its own, the browser's print dialog opened on it. Text only — every value is escaped.

import { COMPANY_NAME } from './company'

export interface ListingColumn {
  label: string
  align?: 'left' | 'right'
}

export interface Listing {
  title: string
  /** Under the title: the month, the filter. */
  subtitle?: string
  columns: ListingColumn[]
  rows: string[][]
  /** A closing total row, its cells under the columns. */
  foot?: string[]
  /** "Printed 4 Nov 2026, 19:52" */
  printedAt: string
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export function listingHtml(l: Listing): string {
  const cell = (tag: 'td' | 'th', v: string, c: ListingColumn | undefined) =>
    `<${tag}${c?.align === 'right' ? ' class="r"' : ''}>${esc(v)}</${tag}>`
  const head = l.columns.map((c) => cell('th', c.label, c)).join('')
  const body = l.rows.map((r) => `<tr>${r.map((v, i) => cell('td', v, l.columns[i])).join('')}</tr>`).join('')
  const foot = l.foot ? `<tfoot><tr>${l.foot.map((v, i) => cell('td', v, l.columns[i])).join('')}</tr></tfoot>` : ''
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(l.title)}</title><style>
@page { size: A4 landscape; margin: 12mm; }
body { font: 10.5px/1.4 system-ui, -apple-system, "Segoe UI", Roboto, "Microsoft YaHei", sans-serif; color: #111; margin: 0; }
.co { font-size: 10px; letter-spacing: .08em; text-transform: uppercase; color: #555; }
h1 { font-size: 16px; margin: 2px 0 2px; font-weight: 600; }
.sub { color: #555; margin-bottom: 10px; }
table { width: 100%; border-collapse: collapse; }
th { text-align: left; font-weight: 600; border-bottom: 1px solid #333; padding: 5px 6px; }
td { border-bottom: 1px solid #ddd; padding: 5px 6px; vertical-align: top; }
.r { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
tfoot td { font-weight: 600; border-top: 1px solid #333; border-bottom: 0; }
thead { display: table-header-group; }
tr { page-break-inside: avoid; }
.foot { margin-top: 10px; color: #777; font-size: 9.5px; }
</style></head><body>
<div class="co">${esc(COMPANY_NAME)}</div>
<h1>${esc(l.title)}</h1>
${l.subtitle ? `<div class="sub">${esc(l.subtitle)}</div>` : ''}
<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody>${foot}</table>
<div class="foot">${esc(l.printedAt)} · ${l.rows.length} ${l.rows.length === 1 ? 'row' : 'rows'}</div>
</body></html>`
}

/** Opens the listing in a window of its own and prints it; false when the browser refused the window. */
export function printListing(l: Listing): boolean {
  const w = window.open('', '_blank', 'width=1100,height=800')
  if (!w) return false
  w.document.open()
  w.document.write(listingHtml(l))
  w.document.close()
  // The opener prints it: a script written into the sheet would answer to the portal's content policy.
  w.focus()
  w.setTimeout(() => w.print(), 150)
  return true
}

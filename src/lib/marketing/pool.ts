// Marketing's own pool (2026-10-28 — the user, of Finance's Marketing - Cash Flow under Dept Pool: "我要exactly 给他们看
// 这个part"; then "照这样做：Marketing view 加一行，打开就是 Finance 那页 Marketing 的 P&L / Cash Flow，只有 Marketing，
// Excel/PDF 也给"): that very page in Marketing's view, for Marketing alone. The segment is named here — the page, the
// lines it opens and its files never take one from the request.

import type { StatementView } from '@/lib/dept-statements'
import type { ReportRange } from '@/lib/report-range'

export const MARKETING_POOL = { path: '/marketing/pool', label: 'Marketing', segment: 'marketing' } as const

/** Its Excel or PDF: the statement on show, over the period on show. */
export function marketingPoolExport(view: StatementView, format: 'xlsx' | 'pdf', range: ReportRange): string {
  const qs = new URLSearchParams({ view, format, period: range.to })
  if (!range.wholeYear) qs.set('from', range.from)
  return `${MARKETING_POOL.path}/export?${qs.toString()}`
}

// A department's own page in the Finance phone app (2026-10-15, part E3): the
// Cash Flow unless the P&L is asked for (the desktop's `?view=pnl`, the user's
// 2026-10-12 "default 开 cash flow 先"), a month between the arrows (`?m=`,
// never past the office's), and the switch to the other statement keeping the
// month. Pure.

import { joinQuery, monthWords, shiftMonth, type PagePlace } from './page-model'

export type DeptStatementView = 'cash-flow' | 'pnl'

export const deptStatementView = (v: unknown): DeptStatementView => (v === 'pnl' ? 'pnl' : 'cash-flow')

export function deptStatementPlace(args: { slug: string; title: string; view: DeptStatementView; ym: string; thisMonth: string }): {
  place: PagePlace
  switchLabel: string
  switchHref: string
} {
  const href = `/fin-app/page/dp-${encodeURIComponent(args.slug)}`
  const month = (m: string) => (m === args.thisMonth ? '' : `m=${m}`)
  const keep = (m: string, view: DeptStatementView = args.view) => joinQuery(view === 'pnl' ? 'view=pnl' : '', month(m))
  const other: DeptStatementView = args.view === 'pnl' ? 'cash-flow' : 'pnl'
  const switchQuery = keep(args.ym, other)
  return {
    place: {
      href,
      title: args.title,
      roman: 'IV.',
      keep: keep(args.ym),
      period: { label: monthWords(args.ym), prev: keep(shiftMonth(args.ym, -1)), next: args.ym < args.thisMonth ? keep(shiftMonth(args.ym, 1)) : null },
    },
    switchLabel: other === 'pnl' ? 'P&L' : 'Cash Flow',
    switchHref: `${href}${switchQuery ? `?${switchQuery}` : ''}`,
  }
}

'use client'

import Link from 'next/link'
import dayjs from 'dayjs'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { crossYearFromChoices, shiftMonth } from '@/lib/report-range'

/**
 * A department's period row (2026-10-25, the mockup's round 11 — the user: "这个按钮做在和选月份一起"): the P&L |
 * Cash Flow switch, Period From → To, the 6 / 12 months a click away, and what the star means. From may reach back
 * across the year (12 months is Nov – Oct); a From in January is the year to date and stays out of the address, as
 * on Reports. Moving To keeps the year to date a year to date and any other span its length.
 */
export default function DeptPeriodBar({
  view,
  links,
  from,
  to,
  toOptions,
}: {
  view: 'pnl' | 'cash-flow'
  /** Each statement's address, the period kept. */
  links: Record<'pnl' | 'cash-flow', string>
  from: string
  to: string
  /** To's choices, latest first. */
  toOptions: string[]
}) {
  const router = useRouter()
  const pathname = usePathname()
  const sp = useSearchParams()
  const jan = (ym: string) => `${ym.slice(0, 4)}-01`
  // How many months From – To holds, both counted.
  const span = (Number(to.slice(0, 4)) - Number(from.slice(0, 4))) * 12 + Number(to.slice(5, 7)) - Number(from.slice(5, 7)) + 1

  const go = (f: string, t: string) => {
    const qs = new URLSearchParams(sp.toString())
    qs.set('period', t)
    if (f === jan(t)) qs.delete('from')
    else qs.set('from', f)
    router.push(`${pathname}?${qs.toString()}`)
  }
  const moveTo = (t: string) => go(from === jan(to) ? jan(t) : shiftMonth(t, -(span - 1)), t)
  const month = (ym: string) => dayjs(`${ym}-01`).format('MMM YYYY')
  // A To older than the list still shows as itself (an old link, a typed URL).
  const tos = toOptions.includes(to) ? toOptions : [...toOptions, to]

  return (
    <div className="dept-period" role="group" aria-label="Period">
      <div className="rpt-modes" role="group" aria-label="Statement">
        {([
          ['pnl', 'P&L'],
          ['cash-flow', 'Cash Flow'],
        ] as const).map(([v, label]) => (
          <Link key={v} href={links[v]} aria-current={view === v ? 'page' : undefined} className={view === v ? 'btn-pri-sheet' : 'btn-quiet-sheet'}>
            {label}
          </Link>
        ))}
      </div>
      <span className="dept-period-rule" aria-hidden />
      <div className="dept-period-field">
        <span>Period</span>
        <select aria-label="From" value={from} onChange={(e) => go(e.target.value, to)}>
          {crossYearFromChoices(to).map((ym) => (
            <option key={ym} value={ym}>
              {month(ym)}
            </option>
          ))}
        </select>
        <span className="rpt-range-word">→</span>
        <select aria-label="To" value={to} onChange={(e) => moveTo(e.target.value)}>
          {tos.map((ym) => (
            <option key={ym} value={ym}>
              {month(ym)}
            </option>
          ))}
        </select>
      </div>
      <div className="dept-quick" role="group" aria-label="Months">
        {[6, 12].map((n) => (
          <button key={n} type="button" aria-pressed={span === n} onClick={() => go(shiftMonth(to, -(n - 1)), to)}>
            {n} months
          </button>
        ))}
      </div>
      <span className="dept-period-hint">* = month still running</span>
    </div>
  )
}

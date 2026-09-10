import Link from 'next/link'
import type { RailMonth, RailState } from '@/lib/payment-cycle'

const WORD: Record<RailState, string> = {
  none: 'no run',
  drafts: 'drafts',
  submitted: 'submitted',
  funded: 'funded',
  closed: 'closed ✓',
}

/**
 * BambooHR's pay-date rail: one chip per month, how far its cycle got under
 * the name, the month on screen ringed. Replaces the ← August → arrows —
 * which month is still open is readable without clicking.
 */
export default function MonthRail({ months }: { months: RailMonth[] }) {
  const year = months.find((m) => m.current)?.year
  return (
    <nav className="pay-rail" aria-label="Months">
      {months.map((m) => (
        <Link
          key={m.period}
          href={`/hr-costing/payment?period=${m.period}`}
          className={`${m.state}${m.current ? ' cur' : ''}`}
          aria-current={m.current ? 'page' : undefined}
          title={`${m.mon} ${m.year} · ${WORD[m.state]}`}
        >
          <b>{m.year === year ? m.mon : `${m.mon} ${String(m.year).slice(2)}`}</b>
          <i>{WORD[m.state]}</i>
        </Link>
      ))}
    </nav>
  )
}

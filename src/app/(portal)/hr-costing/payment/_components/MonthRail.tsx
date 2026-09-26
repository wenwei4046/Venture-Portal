import WarmLink from '@/components/layout/WarmLink'
import type { RailMonth, RailState } from '@/lib/payment-cycle'

const WORD: Record<RailState, string> = {
  none: 'No run',
  drafts: 'Drafts',
  submitted: 'Submitted',
  funded: 'Open',
  closed: 'Closed',
}

/** Month navigation with the current cycle's status underneath. A month the
 *  pointer rests on is rendered ahead of the click (WarmLink), so switching
 *  months does not wait on the server. */
export default function MonthRail({ months }: { months: RailMonth[] }) {
  const year = months.find((m) => m.current)?.year
  return (
    <nav className="pay-rail" aria-label="Months">
      {months.map((m) => (
        <WarmLink
          key={m.period}
          href={`/hr-costing/payment?period=${m.period}`}
          className={`${m.state}${m.current ? ' cur' : ''}`}
          aria-current={m.current ? 'page' : undefined}
          title={`${m.mon} ${m.year} · ${WORD[m.state]}`}
        >
          <b>{m.year === year ? m.mon : `${m.mon} ${String(m.year).slice(2)}`}</b>
          <i>{WORD[m.state]}</i>
        </WarmLink>
      ))}
    </nav>
  )
}

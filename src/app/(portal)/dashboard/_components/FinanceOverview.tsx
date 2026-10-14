import Link from 'next/link'
import { canDo } from '@/lib/permission-actions'
import { officeClock } from '@/lib/office-clock'
import { firstName } from '@/lib/finance-view'
import { HrIcon, type HrIconName } from '@/components/hrv/icons'
import { finNavSections } from '@/components/layout/fin-nav'
import { visibleHrNav, type HrNavTone } from '@/components/layout/hr-nav'
import type { NavData } from '@/components/layout/nav-config'
import type { User } from '@/types'
import { financeSummary, type FinanceOverviewCounts } from '../_lib/finance-overview'
import s from './overview.module.css'

// The Finance view's Overview (2026-10-14, the Finance revamp v2 — D01 of
// `.design/fin-r2/handoff`): the office's date, the greeting, Create payment /
// Create invoice, one line of what waits, eight quick actions with their
// counts, then one card per category — the sidebar's, in its order, each row a
// page this viewer opens.

/** The eight quick actions, in the design's order: the page each opens (by its sidebar row), its tone and icon. */
const QUICK: ReadonlyArray<{ key: string; label: string; icon: HrIconName; tone: HrNavTone; badge?: 'payments' | 'invoices' | 'billing' }> = [
  { key: 'payments', label: 'Payment', icon: 'out', tone: 'clay', badge: 'payments' },
  { key: 'receipts', label: 'Receive', icon: 'in', tone: 'clay' },
  { key: 'invoices', label: 'Invoice', icon: 'invoice', tone: 'clay', badge: 'invoices' },
  { key: 'billing', label: 'Billing', icon: 'people', tone: 'clay', badge: 'billing' },
  { key: 'daily-bank', label: 'Daily Bank', icon: 'calendar', tone: 'clay' },
  { key: 'fund-in', label: 'Fund IN', icon: 'in', tone: 'olive' },
  { key: 'fund-out', label: 'Fund OUT', icon: 'out', tone: 'olive' },
  { key: 'ledger', label: 'Ledger', icon: 'doc', tone: 'slate' },
]

export default function FinanceOverview({ user, navData, counts }: { user: User; navData: NavData; counts: FinanceOverviewCounts }) {
  const clock = officeClock()
  const sections = visibleHrNav(finNavSections(navData), user).filter((sec) => sec.label !== null)
  const hrefOf = new Map(sections.flatMap((sec) => sec.items.map((i) => [i.key, i.href] as const)))
  const badgeOf = {
    payments: (counts.pending ?? 0) + (counts.draft ?? 0),
    invoices: counts.outstanding ?? 0,
    billing: counts.toBill ?? 0,
  }
  const summary = financeSummary(counts)
  const name = firstName(user.name, 'Finance')

  return (
    <div className={s.root}>
      <div className={s.head}>
        <div className={s.headText}>
          <div className={s.eyebrow} suppressHydrationWarning>
            {clock.date} · {clock.quarter}
          </div>
          <h1 className={s.title} suppressHydrationWarning>
            {clock.greeting}, {name}.
          </h1>
          <div className={s.rule} aria-hidden="true" />
        </div>
        <div className={s.actions}>
          {canDo(user, 'treasury', 'create') ? (
            <Link href="/payments?new=1" className={s.btn} data-kind="primary">
              Create payment
            </Link>
          ) : null}
          {canDo(user, 'billing', 'create') ? (
            <Link href="/statements" className={s.btn}>
              Create invoice
            </Link>
          ) : null}
        </div>
      </div>

      {summary ? <p className={s.summary}>{summary}</p> : null}

      <div className={s.label}>
        <span className={s.labelText}>Quick actions</span>
        <span className={s.labelRule} aria-hidden="true" />
      </div>
      <div className={s.quick}>
        {QUICK.filter((q) => hrefOf.has(q.key)).map((q) => {
          const badge = q.badge ? badgeOf[q.badge] : 0
          return (
            <Link key={q.key} href={hrefOf.get(q.key) as string} className={`${s.tile} ${s[q.tone]}`}>
              <span className={s.tileIcon}>
                <HrIcon name={q.icon} size={18} />
                {badge > 0 ? <span className={s.badge}>{badge}</span> : null}
              </span>
              <span className={s.tileLabel}>{q.label}</span>
            </Link>
          )
        })}
      </div>

      <div className={s.cats}>
        {sections.map((sec) => (
          <div key={sec.label} className={s.cat}>
            <div className={s.catHead}>
              <span className={s.catRoman}>{sec.roman}</span>
              <span className={s.catLabel}>{sec.label}</span>
              <span className={s.grow} />
              <span className={s.catCount}>
                {sec.items.length} {sec.items.length === 1 ? 'page' : 'pages'}
              </span>
            </div>
            {sec.items.map((item) => (
              <Link key={item.key} href={item.href} className={`${s.row} ${s[sec.tone]}`}>
                <span className={s.rowIcon}>
                  <HrIcon name={item.icon} size={15} />
                </span>
                <span className={s.rowLabel}>{item.label}</span>
                <span className={s.chev} aria-hidden="true">›</span>
              </Link>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

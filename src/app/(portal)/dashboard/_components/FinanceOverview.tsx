import Link from 'next/link'
import { canDo } from '@/lib/permission-actions'
import { officeClock } from '@/lib/office-clock'
import { officeTime } from '@/lib/office-time'
import { formatMoney } from '@/lib/utils'
import { firstName } from '@/lib/finance-view'
import { HrIcon, type HrIconName } from '@/components/hrv/icons'
import { finNavSections } from '@/components/layout/fin-nav'
import { visibleHrNav, type HrNavTone } from '@/components/layout/hr-nav'
import type { NavData } from '@/components/layout/nav-config'
import type { User } from '@/types'
import { financeSummary, type FinanceOverviewCounts } from '../_lib/finance-overview'
import type { PrincipalFigures, PrincipalOverview } from '../_lib/principal-overview'
import s from './overview.module.css'

// The Finance view's Overview (2026-10-14, the Finance revamp v2 — D01 of
// `.design/fin-r2/handoff`): the office's date, the greeting, Create payment /
// Create invoice, one line of what waits, eight quick actions with their
// counts, then one card per category — the sidebar's, in its order, each row a
// page this viewer opens.
//
// The Principal's own view opens on it too (2026-10-17, `principal`): its line
// leads with what waits for its decision, Approvals is its first quick action,
// and a row of the treasury's figures stands under the line (the user kept
// them: "留一排金额卡") — each card opening its page.

type QuickBadge = 'payments' | 'invoices' | 'billing' | 'approvals'
type Quick = { key: string; label: string; icon: HrIconName; tone: HrNavTone; badge?: QuickBadge }

/** The eight quick actions, in the design's order: the page each opens (by its sidebar row), its tone and icon — the phone app's Overview too. */
export const QUICK: ReadonlyArray<Quick> = [
  { key: 'payments', label: 'Payment', icon: 'out', tone: 'clay', badge: 'payments' },
  { key: 'receipts', label: 'Receive', icon: 'in', tone: 'clay' },
  { key: 'invoices', label: 'Invoice', icon: 'invoice', tone: 'clay', badge: 'invoices' },
  { key: 'billing', label: 'Billing', icon: 'people', tone: 'clay', badge: 'billing' },
  { key: 'daily-bank', label: 'Daily Bank', icon: 'calendar', tone: 'clay' },
  { key: 'fund-in', label: 'Fund IN', icon: 'in', tone: 'olive' },
  { key: 'fund-out', label: 'Fund OUT', icon: 'out', tone: 'olive' },
  { key: 'ledger', label: 'Ledger', icon: 'doc', tone: 'slate' },
]

/** The Principal's own view's (2026-10-17): Approvals first — the tab the user opens most — its badge what waits for them. */
export const PRINCIPAL_QUICK: ReadonlyArray<Quick> = [{ key: 'approvals', label: 'Approvals', icon: 'approve', tone: 'clay', badge: 'approvals' }, ...QUICK]

/** The figures' cards: the sidebar row each opens, its tone (the row's category) and icon. */
function figureCards(f: PrincipalFigures, month: string): Array<{ key: string; row: string; label: string; icon: HrIconName; tone: HrNavTone; value: number; sub: string }> {
  const bare = (n: number) => formatMoney(n).replace(/^RM /, '')
  return [
    { key: 'venture', row: 'venture-pool', label: 'Venture Pool', icon: 'bank', tone: 'gold', value: f.venturePool, sub: 'Live ledger' },
    { key: 'pool', row: 'dp', label: 'Pool', icon: 'org', tone: 'gold', value: f.pool, sub: 'Dept pools + Venture Pool' },
    { key: 'lent', row: 'fund-out', label: 'Lent out', icon: 'out', tone: 'olive', value: f.lentOut, sub: 'Loans outstanding' },
    {
      key: 'interest',
      row: 'pnl',
      label: `Interest · ${month}`,
      icon: 'percent',
      tone: 'slate',
      value: f.interest.net,
      sub: `In ${bare(f.interest.income)} · Out ${bare(f.interest.expense)}`,
    },
  ]
}

export default function FinanceOverview({
  user,
  navData,
  counts,
  principal = null,
}: {
  user: User
  navData: NavData
  counts: FinanceOverviewCounts
  /** The Principal's own view (2026-10-17): what waits for its decision and the treasury's figures. */
  principal?: PrincipalOverview | null
}) {
  const clock = officeClock()
  const sections = visibleHrNav(finNavSections(navData, { principal: !!principal }), user).filter((sec) => sec.label !== null)
  const hrefOf = new Map(sections.flatMap((sec) => sec.items.map((i) => [i.key, i.href] as const)))
  const badgeOf: Record<QuickBadge, number> = {
    payments: (counts.pending ?? 0) + (counts.draft ?? 0),
    invoices: counts.outstanding ?? 0,
    billing: counts.toBill ?? 0,
    approvals: principal?.waiting ?? 0,
  }
  const summary = financeSummary(counts, principal ? { waiting: principal.waiting } : {})
  const name = firstName(user.name, principal ? 'Principal' : 'Finance')
  const quick = (principal ? PRINCIPAL_QUICK : QUICK).filter((q) => hrefOf.has(q.key))
  const figures = principal?.figures ? figureCards(principal.figures, officeTime().format('MMM')).filter((c) => hrefOf.has(c.row)) : []

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
            <Link href="/statements?new=1" className={s.btn}>
              Create invoice
            </Link>
          ) : null}
        </div>
      </div>

      {summary ? <p className={s.summary}>{summary}</p> : null}

      {figures.length > 0 ? (
        <div className={s.figs} aria-label="Treasury today">
          {figures.map((c) => (
            <Link key={c.key} href={hrefOf.get(c.row) as string} className={`${s.fig} ${s[c.tone]}`}>
              <span className={s.figTop}>
                <span className={s.figLabel}>{c.label}</span>
                <span className={s.figIcon} aria-hidden="true">
                  <HrIcon name={c.icon} size={14} />
                </span>
              </span>
              <span className={s.figValue} data-neg={c.value < 0 ? 'true' : undefined}>
                {formatMoney(c.value)}
              </span>
              <span className={s.figSub}>{c.sub}</span>
            </Link>
          ))}
        </div>
      ) : null}

      <div className={s.label}>
        <span className={s.labelText}>Quick actions</span>
        <span className={s.labelRule} aria-hidden="true" />
      </div>
      <div className={s.quick} data-count={quick.length}>
        {quick.map((q) => {
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

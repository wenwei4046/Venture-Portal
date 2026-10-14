import Link from 'next/link'
import { can } from '@/lib/permissions'
import { officeClock } from '@/lib/office-clock'
import { firstName } from '@/lib/finance-view'
import { revenuePath } from '@/lib/revenue'
import {
  canAccessDirectorSalary,
  canAccessHRCosting,
  canAccessHiring,
  canAccessMeetingRooms,
  canAccessRevenue,
  canOpenPeople,
} from '@/lib/roles'
import { HrIcon, type HrIconName } from '@/components/hrv/icons'
import { hrNavSections, visibleHrNav, type HrNavTone } from '@/components/layout/hr-nav'
import type { User } from '@/types'
import type { HrOverviewData } from '../_lib/hr-overview'
import s from './overview.module.css'

// HR's Overview (2026-10-14, the Finance revamp v2 — `HR Overview.dc.html`,
// H01–H02): Finance's layout for HR's view. The office's date and "HR view",
// the greeting, Import payroll / Calculate director salary, one line of where
// the month stands, eight quick actions, and a card per section of HR's
// sidebar with a short note where a row has news. The payroll / staff /
// director tables it used to carry are gone (the user: 照设计拿掉).

const QUICK: ReadonlyArray<{ key: string; label: string; icon: HrIconName; tone: HrNavTone; visible: (u: User) => boolean }> = [
  { key: 'hire', label: 'Hiring requests', icon: 'hire', tone: 'clay', visible: canAccessHiring },
  { key: 'pay', label: 'Import payroll', icon: 'payroll', tone: 'clay', visible: canAccessHRCosting },
  { key: 'pmt', label: 'Payment', icon: 'out', tone: 'clay', visible: canAccessHRCosting },
  { key: 'dsal', label: 'Director salary', icon: 'director', tone: 'gold', visible: canAccessDirectorSalary },
  { key: 'ppl', label: 'People', icon: 'staff', tone: 'olive', visible: canOpenPeople },
  { key: 'mem', label: 'Member services', icon: 'approve', tone: 'olive', visible: (u) => can(u, 'member_requests_manage') || can(u, 'member_memos_manage') },
  { key: 'rooms', label: 'Book a room', icon: 'room', tone: 'walnut', visible: canAccessMeetingRooms },
  { key: 'cc', label: 'Comm Cal', icon: 'in', tone: 'slate', visible: canAccessRevenue },
]

export default function HrOverview({ user, data, revenueSub }: { user: User; data: HrOverviewData; revenueSub: string | null }) {
  const clock = officeClock()
  const { period, summary, notes, badges } = data

  const sections = visibleHrNav(hrNavSections(revenueSub), user).filter((sec) => sec.label !== null)
  const hrefOf: Record<string, string> = {
    ...Object.fromEntries(sections.flatMap((sec) => sec.items.map((i) => [i.key, i.href] as const))),
    // Import payroll opens the month's payroll; Comm Cal the sub-department last picked.
    pay: `/hr-costing/payroll/${period}`,
    cc: revenueSub ? revenuePath(revenueSub) : '/revenue',
  }
  const name = firstName(user.name, 'HR')

  return (
    <div className={`${s.root} ${s.hrRoot}`}>
      <div className={s.head}>
        <div className={s.headText}>
          <div className={s.eyebrow} suppressHydrationWarning>
            {clock.date} · {clock.quarter} · HR view
          </div>
          <h1 className={s.title} suppressHydrationWarning>
            {clock.greeting}, {name}.
          </h1>
          <div className={s.rule} aria-hidden="true" />
        </div>
        <div className={s.actions}>
          {canAccessHRCosting(user) ? (
            <Link href={`/hr-costing/payroll/${period}`} className={s.btn} data-kind="primary">
              Import payroll
            </Link>
          ) : null}
          {canAccessDirectorSalary(user) ? (
            <Link href="/director-salary" className={s.btn}>
              Calculate director salary
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
        {QUICK.filter((q) => q.visible(user) && hrefOf[q.key]).map((q) => {
          const badge = badges[q.key] ?? 0
          return (
            <Link key={q.key} href={hrefOf[q.key]} className={`${s.tile} ${s[q.tone]}`}>
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
                {notes[item.key] ? <span className={s.rowNote}>{notes[item.key]}</span> : null}
                <span className={s.chev} aria-hidden="true">›</span>
              </Link>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

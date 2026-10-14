import Link from 'next/link'
import dayjs from 'dayjs'
import type { SupabaseClient } from '@supabase/supabase-js'
import { can } from '@/lib/permissions'
import { officeClock } from '@/lib/office-clock'
import { officeTime } from '@/lib/office-time'
import { firstName } from '@/lib/finance-view'
import { revenuePath } from '@/lib/revenue'
import { loadHiringBoard } from '@/lib/hiring/board'
import { adminMemberAction } from '@/lib/member/server'
import {
  canAccessDirectorSalary,
  canAccessHiring,
  canAccessMeetingRooms,
  canAccessRevenue,
  canAccessTeam,
  canOpenPeople,
} from '@/lib/roles'
import { HrIcon, type HrIconName } from '@/components/hrv/icons'
import { hrNavSections, visibleHrNav, type HrNavTone } from '@/components/layout/hr-nav'
import type { User } from '@/types'
import s from './overview.module.css'

// HR's Overview (2026-10-14, the Finance revamp v2 — `HR Overview.dc.html`,
// H01–H02): Finance's layout for HR's view. The office's date and "HR view",
// the greeting, Import payroll / Calculate director salary, one line of where
// the month stands, eight quick actions, and a card per section of HR's
// sidebar with a short note where a row has news. The payroll / staff /
// director tables it used to carry are gone (the user: 照设计拿掉).

type HrSummary = {
  staff?: { total_count?: number }
  payroll?: { run?: { status?: string } | null; rows_count?: number; draft_count?: number }
  director?: { status?: 'not_calculated' | 'draft' | 'confirmed' }
}

const QUICK: ReadonlyArray<{ key: string; label: string; icon: HrIconName; tone: HrNavTone; visible: (u: User) => boolean }> = [
  { key: 'hire', label: 'Hiring requests', icon: 'hire', tone: 'clay', visible: canAccessHiring },
  { key: 'pay', label: 'Import payroll', icon: 'payroll', tone: 'clay', visible: canAccessTeam },
  { key: 'pmt', label: 'Payment', icon: 'out', tone: 'clay', visible: canAccessTeam },
  { key: 'dsal', label: 'Director salary', icon: 'director', tone: 'gold', visible: canAccessDirectorSalary },
  { key: 'ppl', label: 'People', icon: 'staff', tone: 'olive', visible: canOpenPeople },
  { key: 'mem', label: 'Member services', icon: 'approve', tone: 'olive', visible: (u) => can(u, 'member_requests_manage') || can(u, 'member_memos_manage') },
  { key: 'rooms', label: 'Book a room', icon: 'room', tone: 'walnut', visible: canAccessMeetingRooms },
  { key: 'cc', label: 'Comm Cal', icon: 'in', tone: 'slate', visible: canAccessRevenue },
]

export default async function HrOverview({ user, supabase, revenueSub }: { user: User; supabase: SupabaseClient; revenueSub: string | null }) {
  const clock = officeClock()
  const period = officeTime().startOf('month').format('YYYY-MM-DD')
  const monthName = dayjs(period).format('MMMM')
  const monthShort = dayjs(period).format('MMM')

  const [summaryRead, hiring, members] = await Promise.all([
    supabase.rpc('hr_dashboard_summary', { p_period: period }),
    canAccessHiring(user) ? loadHiringBoard() : Promise.resolve(null),
    can(user, 'member_requests_manage') ? adminMemberAction({ action: 'list' }) : Promise.resolve(null),
  ])
  const hr = (summaryRead.error ? null : summaryRead.data) as HrSummary | null
  const board = hiring && hiring.ok ? hiring.board : null
  const memberData = members && members.ok ? members.data : null

  const rows = Number(hr?.payroll?.rows_count ?? 0)
  const runStatus = hr?.payroll?.run?.status ?? null
  const submitted = runStatus === 'submitted' || runStatus === 'approved' || runStatus === 'paid'
  const director = hr?.director?.status ?? 'not_calculated'
  const waiting = board ? board.requests.filter((r) => r.status === 'submitted').length : null
  const talents = board ? board.talents.length : null
  const active = hr?.staff?.total_count != null ? Number(hr.staff.total_count) : null
  const newRequests = memberData ? memberData.requests.filter((r) => r.status === 'submitted').length : null

  // Where the month stands (H01): the payroll, the hiring requests, the director salary.
  const payrollWords = rows === 0 ? `${monthName} payroll is not imported yet` : submitted ? `${monthName} payroll is submitted` : `${monthName} payroll is imported`
  const directorWords = director === 'confirmed' ? 'director salary confirmed' : director === 'draft' ? 'director salary in draft' : 'director salary not calculated'
  const summary = [
    canAccessTeam(user) ? payrollWords : null,
    waiting === null ? null : `${waiting} hiring ${waiting === 1 ? 'request' : 'requests'} waiting`,
    canAccessDirectorSalary(user) ? directorWords : null,
  ]
    .filter((p): p is string => p !== null)
    .join(' · ')

  // Each row's news (H02), mono beside its chevron.
  const notes: Record<string, string | null> = {
    hire: waiting ? `${waiting} waiting` : null,
    talent: talents ? String(talents) : null,
    pay: rows === 0 ? `${monthShort} · not imported` : submitted ? `${monthShort} · submitted` : null,
    ppl: active ? `${active} active` : null,
    mem: newRequests ? `${newRequests} new` : null,
    dsal: director === 'not_calculated' ? 'Not calculated' : director === 'draft' ? 'Draft' : null,
  }
  const badges: Record<string, number> = { hire: waiting ?? 0, mem: newRequests ?? 0 }

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
          {canAccessTeam(user) ? (
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

      {summary ? <p className={s.summary}>{summary}.</p> : null}

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

import dayjs from 'dayjs'
import type { SupabaseClient } from '@supabase/supabase-js'
import { can } from '@/lib/permissions'
import { officeTime } from '@/lib/office-time'
import { loadHiringBoard } from '@/lib/hiring/board'
import { adminMemberAction } from '@/lib/member/server'
import { canAccessAttendance, canAccessDirectorSalary, canAccessHRCosting, canAccessHiring } from '@/lib/roles'
import { loadConfig, loadLedger, loadMonth, loadRequests } from '@/lib/attendance/server'
import { attendanceNews } from '@/lib/attendance/overview'
import { officeToday } from '@/lib/office-time'
import { probationsEnding, reviewsFromRow, seesProbationReminders, waitingCount } from '@/lib/probation-reviews'
import type { User } from '@/types'

// HR's Overview (2026-10-14, the Finance revamp v2 — `HR Overview.dc.html`,
// H01–H02): where the month stands — the payroll imported or not, the hiring
// requests waiting, the director salary — and each row's news for its card.
// Every part is read only for whoever opens its page; a part that cannot be
// read says nothing rather than taking the page down.

type HrSummaryRow = {
  staff?: { total_count?: number }
  payroll?: { run?: { status?: string } | null; rows_count?: number }
  director?: { status?: 'not_calculated' | 'draft' | 'confirmed' }
}

export interface HrOverviewData {
  /** The office's month, first day (`2026-10-01`). */
  period: string
  summary: string
  /** Each sidebar row's news, by its key (H02). */
  notes: Record<string, string | null>
  /** The quick actions' counts: Hiring requests waiting, Member services' new requests. */
  badges: Record<string, number>
}

export async function loadHrOverview(supabase: SupabaseClient, user: User): Promise<HrOverviewData> {
  const period = officeTime().startOf('month').format('YYYY-MM-DD')
  const monthName = dayjs(period).format('MMMM')
  const monthShort = dayjs(period).format('MMM')

  const year = Number(period.slice(0, 4))
  const seesAttendance = canAccessAttendance(user)
  const [summaryRead, hiring, members, attConfig, attMonth, attRequests, attLedger, probationRead] = await Promise.all([
    supabase.rpc('hr_dashboard_summary', { p_period: period }),
    canAccessHiring(user) ? loadHiringBoard() : Promise.resolve(null),
    can(user, 'member_requests_manage') ? adminMemberAction({ action: 'list' }) : Promise.resolve(null),
    seesAttendance ? loadConfig() : Promise.resolve(null),
    seesAttendance ? loadMonth(officeTime().format('YYYY-MM-DD')) : Promise.resolve(null),
    seesAttendance ? loadRequests() : Promise.resolve(null),
    seesAttendance ? loadLedger(year) : Promise.resolve(null),
    // The probations waiting for Acknowledge (2026-10-23 — the user: "HR Overview 首页上的数字"), as HR view's bell counts them.
    seesProbationReminders(user) ? supabase.rpc('probation_reviews') : Promise.resolve(null),
  ])
  const probations = probationRead && !probationRead.error ? waitingCount(reviewsFromRow(probationRead.data), officeToday()) : 0
  // Attendance (2026-10-15, the Attendance handoff's Overview): requests waiting for HR, who is not in yet, the close.
  const att = attConfig?.ok && attMonth?.ok && attRequests?.ok && attLedger?.ok
    ? attendanceNews(attConfig.data, attMonth.data, attRequests.data, attLedger.data)
    : null
  const hr = (summaryRead.error ? null : summaryRead.data) as HrSummaryRow | null
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
  const payroll = rows === 0 ? `${monthName} payroll is not imported yet` : submitted ? `${monthName} payroll is submitted` : `${monthName} payroll is imported`
  const directorWords = director === 'confirmed' ? 'director salary confirmed' : director === 'draft' ? 'director salary in draft' : 'director salary not calculated'
  const parts = att ? att.summary.split(' · ') : [
    canAccessHRCosting(user) ? payroll : null,
    waiting === null ? null : `${waiting} hiring ${waiting === 1 ? 'request' : 'requests'} waiting`,
    canAccessDirectorSalary(user) ? directorWords : null,
  ].filter((p): p is string => p !== null)
  // The probations HR is told of: after the requests waiting for HR, as the HR app's Home says it — only while some wait.
  if (probations > 0) parts.splice(1, 0, probationsEnding(probations))

  return {
    period,
    summary: parts.length ? `${parts.join(' · ')}.` : '',
    notes: {
      hire: waiting ? `${waiting} waiting` : null,
      talent: talents ? String(talents) : null,
      pay: rows === 0 ? `${monthShort} · not imported` : submitted ? `${monthShort} · submitted` : null,
      ppl: active ? `${active} active` : null,
      mem: newRequests ? `${newRequests} new` : null,
      dsal: director === 'not_calculated' ? 'Not calculated' : director === 'draft' ? 'Draft' : null,
    },
    // People's tile and its row in People Management (both pplPeople): the probations waiting for Acknowledge.
    badges: { hire: waiting ?? 0, mem: newRequests ?? 0, memReq: newRequests ?? 0, ...(att?.badges ?? {}), pplPeople: probations },
  }
}

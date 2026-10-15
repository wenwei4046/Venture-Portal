import { assignmentFor } from './engine'
import type { AttConfig, AttLedger, AttPerson } from './types'

/**
 * Readiness (2026-10-15, the Attendance handoff's `isReady`): what has to be
 * true before people clock — and every month after. Each row says what is
 * missing, who, and links to where it is fixed. Pure, over `att_config()` and
 * this year's `att_ledger()`.
 */

export type ReadyTone = 'danger' | 'warning' | 'success'

export interface ReadyRow {
  key: string
  tone: ReadyTone
  title: string
  sub: string
  /** The fix's word and where it opens; null = OK. */
  fix: { label: string; href: string } | null
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`
/** "1 person who clocks has", "3 people who clock have". */
const clockHave = (n: number) => (n === 1 ? 'clocks has' : 'clock have')
/** "Hafiz Rahim · Jason Tan · Ahmad Faizal" — at most four names, then "+N". */
const names = (people: readonly AttPerson[]) => {
  const shown = people.slice(0, 4).map(p => p.name).join(' · ')
  return people.length > 4 ? `${shown} +${people.length - 4}` : shown
}

export function readinessRows(config: AttConfig, ledger: AttLedger | null, today: string): ReadyRow[] {
  const rows: ReadyRow[] = []
  const year = Number(today.slice(0, 4))
  const hasDefault = config.assignments.some(a => a.level === 'company')
  if (!hasDefault) {
    rows.push({ key: 'default', tone: 'danger', title: 'No company default yet — nobody clocks', sub: 'Add the company default in Settings › Who clocks', fix: { label: 'Assign', href: '/attendance/settings' } })
  }
  const clocking = config.people.filter(p => assignmentFor(p, today, config.assignments)?.mode === 'clock')
  const byId = new Map(config.people.map(p => [p.id, p]))

  // 1. People who clock with no login of their own.
  const noLogin = clocking.filter(p => !p.hasLogin)
  if (noLogin.length) {
    rows.push({ key: 'login', tone: 'danger', title: `${plural(noLogin.length, 'person', 'people')} who ${clockHave(noLogin.length)} no login`, sub: `${names(noLogin)} — invite them in People`, fix: { label: 'Invite', href: '/team/people' } })
  }

  // 2. Uplines (of people who clock) with no personal login: their reports' requests fall back to HR.
  const uplines = new Map<string, { upline: AttPerson | null; name: string; reports: number }>()
  for (const p of clocking) {
    if (!p.uplineId) continue
    const u = byId.get(p.uplineId) ?? null
    if (u ? u.hasLogin : p.uplineHasLogin) continue
    const cur = uplines.get(p.uplineId) ?? { upline: u, name: u?.name ?? p.upline ?? 'Upline', reports: 0 }
    cur.reports++
    uplines.set(p.uplineId, cur)
  }
  if (uplines.size) {
    const list = [...uplines.values()]
    const sub = list.slice(0, 3).map(x => `${x.name}${x.upline?.title ? ` (${x.upline.title})` : ''} — ${plural(x.reports, 'report falls', 'reports fall')} back to HR`).join(' · ')
    rows.push({ key: 'upline', tone: 'danger', title: `${plural(uplines.size, 'upline has', 'uplines have')} no personal login`, sub, fix: { label: 'Invite', href: '/team/people' } })
  }

  // 3. People who clock with no schedule.
  const noSchedule = clocking.filter(p => !assignmentFor(p, today, config.assignments)?.scheduleId)
  if (noSchedule.length) {
    rows.push({ key: 'schedule', tone: 'warning', title: `${plural(noSchedule.length, 'person', 'people')} with no schedule`, sub: names(noSchedule), fix: { label: 'Assign', href: '/attendance/settings' } })
  }

  // 3b. People who clock with no hire date: their years of service count as none, so service steps never reach them
  // (2026-10-15 — the user, told the 36 without one are the Revenue team and the directors: "Readiness 提醒，到时再补").
  const noHire = clocking.filter(p => !p.hireDate)
  if (noHire.length) {
    rows.push({ key: 'hire', tone: 'warning', title: `${plural(noHire.length, 'person', 'people')} who ${clockHave(noHire.length)} no hire date`, sub: `${names(noHire)} — add it in People`, fix: { label: 'Fix', href: '/team/people' } })
  }

  // 4. Opening balances missing (annual leave, this year) for people who clock.
  const al = config.leaveTypes.find(t => t.accrues && !t.unpaid) ?? config.leaveTypes.find(t => t.code === 'AL') ?? null
  if (al && ledger) {
    const opened = new Set(ledger.entries.filter(e => e.kind === 'opening').map(e => e.staffId))
    const missing = clocking.filter(p => !opened.has(p.id))
    if (missing.length) {
      rows.push({ key: 'opening', tone: 'warning', title: `Opening balances missing for ${plural(missing.length, 'person', 'people')}`, sub: `${al.name} and leave already used this year`, fix: { label: 'Enter', href: '/attendance/balances' } })
    }
  }

  // 5. Titles with no template among people who clock: they cannot punch or ask.
  const titles = new Map<string, string>()
  for (const p of clocking) {
    if (!p.titleId) continue
    const t = config.titles.find(x => x.id === p.titleId)
    if (t && !t.hasTemplate) titles.set(t.id, t.name)
  }
  if (titles.size) {
    rows.push({ key: 'template', tone: 'warning', title: `${plural(titles.size, 'title has', 'titles have')} no template`, sub: `${[...titles.values()].slice(0, 3).join(' · ')} — cannot punch or ask`, fix: { label: 'Fix', href: '/team/hierarchy?tab=roles' } })
  }

  // 6. Next year's chosen holidays: six to pick and publish before 1 January.
  const next = year + 1
  const chosen = config.holidays.filter(h => h.kind === 'chosen' && h.day.startsWith(`${next}-`)).length
  if (chosen < 6) {
    rows.push({ key: 'holidays', tone: 'warning', title: `${next} holidays: ${chosen} of 6 chosen picked`, sub: `Publish before 1 Jan ${next}`, fix: { label: 'Pick', href: '/attendance/settings?tab=hol' } })
  }

  // 7. Every upline holds Approve · Own (their reports' requests reach them).
  const templated = new Set(clocking.map(p => byId.get(p.uplineId ?? '')?.templateId).filter((x): x is string => !!x))
  rows.push({ key: 'approve', tone: 'success', title: 'Every upline holds Approve · Own', sub: `${plural(templated.size, 'template', 'templates')} checked`, fix: null })

  return rows
}

/** How many rows want a fix (the sidebar's and Overview's badge). */
export const readinessCount = (rows: readonly ReadyRow[]) => rows.filter(r => r.fix).length

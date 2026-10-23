import { assignmentFor, balanceOf, dayInfo, dayMon, daysToDecide, indexMonth, monthGrid, monthName, serviceYears, tint, type Ctx, type DayInfo } from '@/lib/attendance/engine'
import { closeNodes, dueBy, waitingIn } from '@/lib/attendance/close'
import { ROUTE_WORDS, amountLabel, bucketOf, flowNodes, kindLabel, sinceLabel, waitingStep, whenLabel, type Bucket } from '@/lib/attendance/requests'
import type { AttConfig, AttLedger, AttLeaveType, AttMonth, AttPerson, AttRequest } from '@/lib/attendance/types'
import { correctionNth, quotaFor } from '@/lib/me/requests'
import { monthsLabel, probationEndLine } from '@/lib/employment-status'
import { officeTime } from '@/lib/office-time'
import { acknowledged, dueReviews, probationsEnding, type ProbationReview } from '@/lib/probation-reviews'

/**
 * The HR app's attendance screens (2026-10-17, the Claude Design handoff `design_handoff_hr_mobile` — HR Mobile):
 * Today's tiles and list, Approve's three lists and a request's page, a person's page, Leave balances, Month close,
 * Records, the org chart and the levels — worked out from HR › Attendance's own readers (att_config, att_month,
 * att_requests_list, att_ledger), with HR › Attendance's own words (lib/attendance/requests.ts) wherever the desktop
 * already says it. Pure: the screen and the tests read the same answers.
 */

export interface HrAtt {
  config: AttConfig
  month: AttMonth
  requests: AttRequest[]
  ledger: AttLedger | null
}

const ctxOf = (a: HrAtt): Ctx => ({ config: a.config, month: a.month, today: a.config.today, now: a.config.now })

// ── People's colours ─────────────────────────────────────────────────────────

/** The avatar's tint (the prototype's `tint()`: the name hashed → clay, slate, olive, gold, walnut) and initials. */
export function avatarOf(name: string): { bg: string; fg: string; ini: string } {
  const { tone, ini } = tint(name)
  return { bg: `rgb(var(--tone-${tone}))`, fg: `rgb(var(--tone-${tone}-deep))`, ini: ini.toUpperCase() }
}

export type TodayKey = 'present' | 'late' | 'notin' | 'leave'

/** Today's four states: the chip's word, its colours, the count tile's top border. */
export const TODAY_ST: Readonly<Record<TodayKey, { word: string; bg: string; fg: string; bar: string }>> = {
  present: { word: 'In', bg: 'var(--hr2-in-bg)', fg: 'var(--ds-success)', bar: 'rgb(var(--tone-olive-deep))' },
  late: { word: 'Late', bg: 'var(--hr2-late-bg)', fg: 'rgb(var(--tone-clay-deep))', bar: 'var(--hr2-accent)' },
  notin: { word: 'Not in', bg: 'var(--ds-danger-bg)', fg: 'var(--ds-danger)', bar: 'var(--ds-danger)' },
  leave: { word: 'Leave', bg: 'rgb(var(--tone-slate))', fg: 'rgb(var(--tone-slate-deep))', bar: 'rgb(var(--tone-slate-deep))' },
}
const ORDER: Readonly<Record<TodayKey, number>> = { notin: 0, late: 1, leave: 2, present: 3 }

// ── Today ────────────────────────────────────────────────────────────────────

export interface TodayRow {
  id: string
  name: string
  sub: string
  state: TodayKey
  chip: string
}

const OFF_CODES = new Set(['W', 'H', 'CH', 'SO'])

/** "IN 09:12 · HQ · 17 m", "IN 08:40 · 2.1 km from HQ · Outside fence", "IN 09:08 · HQ · 30 m · From a computer". */
export const inLine = (d: Pick<DayInfo, 'in' | 'place' | 'flags'>) => `IN ${d.in}${d.place ? ` · ${d.place}` : ''}${d.flags.length ? ` · ${d.flags.join(' · ')}` : ''}`

/** One person's state today — null when today is not theirs to be in (an off day, a holiday, not clocking). */
export function todayOf(a: HrAtt, p: AttPerson, idx = indexMonth(a.month)): { state: TodayKey; info: DayInfo } | null {
  const { config } = a
  const today = config.today
  const as = assignmentFor(p, today, config.assignments)
  if (!as || as.mode === 'off') return null
  const info = dayInfo(p, today, ctxOf(a), idx)
  if (config.leaveTypes.some(t => t.code === info.code)) return { state: 'leave', info }
  // Fixed hours (no clock-in): only on the day they are on leave (HR › Today's own rule).
  if (as.mode === 'no_clock' || OFF_CODES.has(info.code)) return null
  if (info.code === 'L') return { state: 'late', info }
  if (info.code === 'P') return { state: 'present', info }
  return { state: 'notin', info }
}

/** Today's list, Not in → Late → Leave → In, each by name (the prototype's order). */
export function todayRows(a: HrAtt): TodayRow[] {
  const idx = indexMonth(a.month)
  const leaveName = (code: string) => a.config.leaveTypes.find(t => t.code === code.replace(/\?$/, ''))?.name ?? code
  const rows: TodayRow[] = []
  for (const p of a.config.people) {
    const t = todayOf(a, p, idx)
    if (!t) continue
    const title = p.title ?? 'No title'
    const { state, info } = t
    const sub = state === 'leave' ? `${title} · ${leaveName(info.code).toLowerCase()}`
      : state === 'notin' ? (info.code.endsWith('?') ? `${title} · ${leaveName(info.code).toLowerCase()} waiting` : `${title} · no punch yet`)
        : inLine(info)
    rows.push({ id: p.id, name: p.name, sub, state, chip: TODAY_ST[state].word + (state === 'late' && info.lateMin ? ` ${info.lateMin}m` : '') })
  }
  return rows.sort((x, y) => ORDER[x.state] - ORDER[y.state] || x.name.localeCompare(y.name))
}

export function todayCounts(rows: readonly TodayRow[]): Record<TodayKey, number> {
  const n: Record<TodayKey, number> = { present: 0, late: 0, notin: 0, leave: 0 }
  for (const r of rows) n[r.state]++
  return n
}

// ── Approve ──────────────────────────────────────────────────────────────────

export interface ApproveRow {
  id: string
  who: string
  kind: string
  when: string
  /** "At HR" / "At upline" / "Approved" / "Rejected" / "Withdrawn". */
  st: string
  stFg: string
  since: string
}

/** The request's state as the list says it, and its colour. */
export function stateOf(r: AttRequest): [string, string, string] {
  const w = waitingStep(r)
  if (w) return [w.role === 'hr' ? 'At HR' : 'At upline', 'rgb(var(--tone-clay-deep))', 'var(--hr2-late-bg)']
  if (r.status === 'rejected') return ['Rejected', 'var(--ds-danger)', 'var(--ds-danger-bg)']
  if (r.status === 'cancelled') return ['Withdrawn', 'var(--ds-ink-3)', 'var(--ds-surface-3)']
  return ['Approved', 'var(--ds-success)', 'var(--hr2-in-bg)']
}

/** One of Approve's lists: waiting ones oldest first, decided ones latest first. */
export function approveRows(a: Pick<HrAtt, 'requests' | 'config'>, bucket: Bucket, now: Date): ApproveRow[] {
  const list = a.requests.filter(r => bucketOf(r) === bucket)
  const at = (r: AttRequest) => (bucket === 'decided' ? r.decidedAt ?? r.sentAt : waitingStep(r)?.arrivedAt ?? r.sentAt)
  list.sort((x, y) => (bucket === 'decided' ? (at(x) < at(y) ? 1 : -1) : at(x) < at(y) ? -1 : 1))
  return list.map(r => {
    const [st, stFg] = stateOf(r)
    return { id: r.id, who: r.who, kind: kindLabel(r, a.config.leaveTypes), when: whenLabel(r), st, stFg, since: sinceLabel(r, now) }
  })
}

export function approveCounts(requests: readonly AttRequest[]): Record<Bucket, number> {
  const n: Record<Bucket, number> = { hr: 0, upline: 0, decided: 0 }
  for (const r of requests) n[bucketOf(r)]++
  return n
}

/**
 * "16 SL left after this", "To payroll as 2 unpaid days" — the desktop drawer's Balance (HR › Attendance › Requests),
 * for a leave request still waiting.
 */
export function balanceLine(r: AttRequest, config: AttConfig, ledger: AttLedger | null): string | null {
  if (r.kind !== 'leave') return null
  const type = config.leaveTypes.find(t => t.code === r.leaveCode)
  const person = config.people.find(p => p.id === r.staffId)
  if (!type || !person) return null
  if (type.unpaid) return `To payroll as ${r.days ?? ''} unpaid day${r.days === 1 ? '' : 's'}`.replace('  ', ' ')
  if (r.status !== 'pending' || !ledger) return null
  const b = balanceOf(person, type, config, ledger, config.today)
  return b.left != null ? `${Math.round(b.left * 100) / 100} ${type.drawsFrom ?? type.code} left after this` : null
}

export type NodeState = 'done' | 'current' | 'next' | 'rejected'

export interface RequestView {
  facts: Array<[string, string]>
  changes: Array<{ f: string; from: string; to: string }>
  nodes: Array<{ text: string; label: string; at: string; state: NodeState; fg: string }>
  /** Waiting for HR or (on their behalf) the upline. */
  waitsAt: 'hr' | 'upline' | null
  st: string
  stFg: string
  stBg: string
}

/** A request's amount: the desktop's words — and a correction's place in its month's quota, "1 of 3" (the handoff). */
export function amountOf(r: AttRequest, config: Pick<AttConfig, 'policies'>, all: readonly AttRequest[]): string {
  if (r.kind !== 'correction') return amountLabel(r)
  const nth = correctionNth(r, all.filter(x => x.staffId === r.staffId))
  return nth != null && r.from ? `${nth} of ${quotaFor(config, r.from)}` : amountLabel(r)
}

/** A request's page: its facts, the changes a profile change asks for, the approval flow. */
export function requestView(r: AttRequest, config: AttConfig, ledger: AttLedger | null, all: readonly AttRequest[] = []): RequestView {
  const bal = balanceLine(r, config, ledger)
  const changes = Array.isArray(r.detail.changes) ? (r.detail.changes as Array<{ field?: string; from?: string; to?: string }>) : []
  const [st, stFg, stBg] = stateOf(r)
  const w = waitingStep(r)
  return {
    facts: [['Amount', amountOf(r, config, all)], ['Route', ROUTE_WORDS[r.route]], ['Reason', r.reason || '—'], ...(bal ? [['Balance', bal] as [string, string]] : [])],
    changes: changes.map(c => ({ f: c.field ?? '', from: c.from || '—', to: c.to ?? '' })),
    nodes: flowNodes(r).map(n => ({ text: `${n.role} · ${n.who}`, label: n.label, at: n.at, state: n.state, fg: n.stateFg })),
    waitsAt: w ? w.role : null,
    st, stFg, stBg,
  }
}

/** The prototype's toast once decided: "Rajesh Kumar · Sick leave approved". */
export const decidedWords = (r: AttRequest, leaveTypes: readonly AttLeaveType[], approve: boolean) =>
  `${r.who} · ${kindLabel(r, leaveTypes)} ${approve ? 'approved' : 'rejected'}`

// ── A person ─────────────────────────────────────────────────────────────────

export interface LeaveCard {
  name: string
  code: string
  left: string
  of: string
  bar: string
  pct: string
}

export interface PersonView {
  name: string
  title: string
  dept: string
  chip: { label: string; bg: string; fg: string }
  facts: Array<{ k: string; v: string; mono: boolean }>
  leave: LeaveCard[]
}

const OT_WORDS: Readonly<Record<string, string>> = { by_wage: 'by wage', statutory: 'statutory', none: 'none' }
const CARDS: ReadonlyArray<[string, string]> = [['AL', 'rgb(var(--tone-slate-deep))'], ['SL', 'var(--ds-info)'], ['HL', 'var(--ds-info)'], ['RL', 'rgb(var(--tone-slate-deep))']]
const num = (n: number) => String(Math.round(n * 100) / 100)

/** A person's page: today's chip, the facts, the four leave cards (the leave types HR keeps of those four). */
export function personView(a: HrAtt, p: AttPerson): PersonView {
  const { config } = a
  const t = todayOf(a, p)
  const info = t?.info ?? null
  const chip = t
    ? { label: `Today · ${TODAY_ST[t.state].word}${info?.in ? ` ${info.in}` : ''}`, bg: TODAY_ST[t.state].bg, fg: TODAY_ST[t.state].fg }
    : { label: `Today · ${assignmentFor(p, config.today, config.assignments)?.mode === 'clock' ? 'Off' : 'Not clocking'}`, bg: 'var(--ds-surface-3)', fg: 'var(--ds-ink-2)' }
  const yrs = serviceYears(p.hireDate, config.today)
  const ot = assignmentFor(p, config.today, config.assignments)?.ot
  const leave: LeaveCard[] = []
  if (a.ledger) {
    for (const [code, bar] of CARDS) {
      const type = config.leaveTypes.find(x => x.code === code)
      if (!type) continue
      const b = balanceOf(p, type, config, a.ledger, config.today)
      if (b.left == null || b.of == null) continue
      leave.push({ name: type.name, code, left: num(b.left), of: num(b.of), bar, pct: `${b.of ? Math.max(0, Math.min(100, (b.left / b.of) * 100)) : 0}%` })
    }
  }
  return {
    name: p.name,
    title: p.title ?? 'No title',
    dept: p.department ?? 'No department',
    chip,
    facts: [
      { k: 'Service', v: yrs == null ? '—' : `${yrs} year${yrs === 1 ? '' : 's'}`, mono: false },
      { k: 'Upline', v: p.upline ?? '—', mono: false },
      { k: 'Today', v: info?.in ? `IN ${info.in}${info.place ? ` · ${info.place}` : ''}` : '—', mono: true },
      { k: 'OT', v: ot ? OT_WORDS[ot] ?? ot : '—', mono: false },
    ],
    leave,
  }
}

// ── Leave balances ───────────────────────────────────────────────────────────

export interface BalanceRow {
  id: string
  name: string
  left: string
  low: boolean
  pct: string
}

/** Annual leave for everybody HR keeps it for: "left / of", low at 2 days or less. */
export function balanceRows(a: HrAtt): BalanceRow[] {
  const { config, ledger } = a
  const al = config.leaveTypes.find(t => t.code === 'AL') ?? config.leaveTypes.find(t => t.accrues && !t.unpaid) ?? null
  if (!al || !ledger) return []
  const rows: BalanceRow[] = []
  for (const p of config.people) {
    const b = balanceOf(p, al, config, ledger, config.today)
    if (b.left == null || b.of == null) continue
    rows.push({ id: p.id, name: p.name, left: `${num(b.left)} / ${num(b.of)}`, low: b.left <= 2, pct: `${Math.max(0, Math.min(100, (b.left / (b.of || 1)) * 100))}%` })
  }
  return rows.sort((x, y) => x.name.localeCompare(y.name))
}

// ── Month close ──────────────────────────────────────────────────────────────

export interface CloseView {
  month: string
  due: string
  steps: Array<{ label: string; note: string; state: 'done' | 'current' | 'next' }>
}

/** The month being closed (this one), when it is due, and where its four steps stand. */
export function closeView(a: HrAtt): CloseView {
  const month = a.month.month
  const closed = a.month.close?.status === 'closed'
  const waiting = waitingIn(a.requests, month).length
  const undecided = closed ? 0 : daysToDecide(ctxOf(a)).filter(x => !x.decision).length
  const nodes = closeNodes(waiting, undecided, closed, closed && a.month.close?.closedAt ? dayMon(a.month.close.closedAt.slice(0, 10)) : null)
  // The handoff names the last step "Register + payroll" (the close writes the register into the payroll).
  const steps = nodes.map(n => ({ ...n, label: n.label === 'Register + file' ? 'Register + payroll' : n.label }))
  const cur = steps.findIndex(s => !s.done)
  return {
    month: `${monthName(month)} ${month.slice(0, 4)}`,
    due: `Due ${dayMon(dueBy(month))} · before payroll on the 7th`,
    steps: steps.map((s, i) => ({ label: s.label, note: s.note, state: s.done ? 'done' : i === cur ? 'current' : 'next' })),
  }
}

/** Home's line: "4 requests waiting for HR · 2 not in yet · 3 late · October closes 3 Nov." */
export function homeSummary(waiting: number, today: Record<TodayKey, number> | null, month: string | null, probations = 0): string {
  const parts = [`${waiting} request${waiting === 1 ? '' : 's'} waiting for HR`]
  // The probations still waiting for Acknowledge (2026-10-23) — only while there are some.
  if (probations > 0) parts.push(probationsEnding(probations))
  if (today) parts.push(`${today.notin} not in yet`, `${today.late} late`)
  if (month) parts.push(`${monthName(month)} closes ${dayMon(dueBy(month))}`)
  return `${parts.join(' · ')}.`
}

// ── A probation ending (2026-10-23 — the user: "HR 手机 app 里的提醒和推送") ──────────

export interface ProbationRow {
  id: string
  name: string
  /** "Ends 31 Oct 2026 · in 8 days · HR" — the desktop bell's own line. */
  sub: string
}

/** Home's *Probation ending*: those still waiting for Acknowledge, soonest first — each opens the person. */
export function probationRows(list: readonly ProbationReview[], today: string): ProbationRow[] {
  return dueReviews(list, today).filter(r => !acknowledged(r)).map(r => ({
    id: r.id,
    name: r.name,
    sub: [r.endsOn ? probationEndLine(r.endsOn, today) : null, r.department].filter(Boolean).join(' · '),
  }))
}

/**
 * A person's page, while they are on probation: the period and its end, and — once given for the end it stands at —
 * who acknowledged the reminder and when (the desktop's Employment well, in the app's facts).
 */
export function probationFacts(r: ProbationReview, today: string): Array<{ k: string; v: string; mono: boolean }> {
  const facts = [{
    k: 'Probation',
    v: [r.months ? monthsLabel(r.months) : null, r.endsOn ? probationEndLine(r.endsOn, today, true) : 'no end — the hire date is missing'].filter(Boolean).join(' · '),
    mono: false,
  }]
  if (acknowledged(r)) {
    facts.push({ k: 'Reminder', v: `Acknowledged by ${r.ackName ?? 'HR'}${r.ackAt ? ` · ${officeTime(r.ackAt).format('D MMM YYYY')}` : ''}`, mono: false })
  }
  return facts
}

// ── Records, the org chart, the levels ──────────────────────────────────────

export interface RecordRow {
  id: string
  name: string
  sub: string
  right: string
}

/** Records · October: each person's month so far, and today's IN. */
export function recordsView(a: HrAtt): { tiles: Array<[string, string]>; rows: RecordRow[] } {
  const g = monthGrid(ctxOf(a))
  const ti = g.days.indexOf(a.config.today)
  const rows = g.rows.map(r => ({
    id: r.person.id,
    name: r.person.name,
    sub: `${r.t.inD} in · ${r.t.late} late · ${r.t.leave} leave`,
    right: ti >= 0 ? r.cells[ti].in ?? '—' : '—',
  })).sort((x, y) => x.name.localeCompare(y.name))
  const n = g.rows.length
  const avg = n ? Math.round((g.rows.reduce((s, r) => s + r.t.inD, 0) / n) * 10) / 10 : 0
  return {
    tiles: [[String(avg), 'Days in, avg'], [String(g.rows.reduce((s, r) => s + r.t.late, 0)), 'Late this month'], [String(g.rows.reduce((s, r) => s + r.t.abs, 0)), 'Absent']],
    rows,
  }
}

/** The org chart: every person under their upline, depth by depth (a cycle or a missing upline starts a new top). */
export function orgRows(people: readonly AttPerson[]): Array<{ person: AttPerson; depth: number }> {
  const ids = new Set(people.map(p => p.id))
  const kids = new Map<string, AttPerson[]>()
  for (const p of people) {
    if (p.uplineId && ids.has(p.uplineId) && p.uplineId !== p.id) kids.set(p.uplineId, [...(kids.get(p.uplineId) ?? []), p])
  }
  const byRank = (x: AttPerson, y: AttPerson) => (y.level ?? 0) - (x.level ?? 0) || x.name.localeCompare(y.name)
  const out: Array<{ person: AttPerson; depth: number }> = []
  const seen = new Set<string>()
  const walk = (p: AttPerson, depth: number) => {
    if (seen.has(p.id)) return
    seen.add(p.id)
    out.push({ person: p, depth })
    for (const k of [...(kids.get(p.id) ?? [])].sort(byRank)) walk(k, depth + 1)
  }
  for (const p of people.filter(x => !x.uplineId || !ids.has(x.uplineId)).sort(byRank)) walk(p, 0)
  for (const p of [...people].sort(byRank)) walk(p, 0)
  return out
}

/** The levels, lowest first: "L3 · Executive", how many people stand on each. */
export function levelRows(config: Pick<AttConfig, 'levels' | 'people'>): Array<{ rank: number; name: string; people: number }> {
  return [...config.levels].sort((x, y) => x.rank - y.rank).map(l => ({ rank: l.rank, name: l.name, people: config.people.filter(p => p.level === l.rank).length }))
}

/** Everybody by department, as People lists them ("MARKETING · 7"), the search over name and title. */
export function peopleGroups(people: ReadonlyArray<{ id: string; name: string; title: string; dept: string }>, q: string) {
  const s = q.trim().toLowerCase()
  const shown = people.filter(p => !s || `${p.name}${p.title}`.toLowerCase().includes(s))
  const depts = [...new Set(shown.map(p => p.dept || 'No department'))]
  return depts.map(d => {
    const xs = shown.filter(p => (p.dept || 'No department') === d).sort((x, y) => x.name.localeCompare(y.name))
    return { name: d, n: xs.length, people: xs }
  })
}

export { bucketOf, waitingStep }
export type { Bucket }
export const monthOf = (a: Pick<HrAtt, 'month'>) => a.month.month
export const dayMonOf = dayMon
export type { AttPerson, AttRequest, AttConfig, AttLedger, AttMonth }

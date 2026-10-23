// A deliverable's Assignment Plan (②b-2a — `Assignment Plan.dc.html`; the user's answer 10: each deliverable its own
// START day): who does each stage (the manager assigns, or 🔓 the stage before picks from its candidates), who approves
// it (up to three levels: a manager, the PIC on the link), its working days, whether it splits into subtasks — and the
// day it starts. What the page draws (each stage's dates, the summary, who is on it), what stops Save, which changes
// need a reason once it has opened, and what mkt_deliverable_plan takes. Pure.

import { addDays, longDay, shortDay, weekdayOf, type MktHoliday, type MktPerson, type MktStageStatus } from './board'
import { MAX_APPROVALS, MAX_SLA, stageDates } from './tasks'
import type { MktTaskPage, PlanAppr } from './task'

export interface PlanStage {
  idx: number
  name: string
  /** Its group — a People title. */
  dept: string
  mode: 'assign' | 'prev'
  cands: string[]
  /** null: picked by the stage before (🔓 — a 'prev' stage), or nobody chosen yet. */
  owner: string | null
  extra: string
  appr: PlanAppr[]
  sla: number
  split: boolean
  status: MktStageStatus
}

export interface PlanDraft {
  start: string
  stages: PlanStage[]
}

/** The plan as it stands: a deliverable not planned yet, its template's; once planned, what was saved. A locked
 * template leaves nothing to the stage before and no subtasks. */
export function planFromTask(page: MktTaskPage): PlanDraft {
  const p = page.project
  return {
    start: p.status === 'planning' ? '' : p.startsOn ?? '',
    stages: page.stages.map(s => ({
      idx: s.idx,
      name: s.name,
      dept: s.dept,
      mode: s.mode === 'prev' && !p.locked && s.idx > 0 ? 'prev' : 'assign',
      cands: s.cands,
      owner: s.owner,
      extra: s.extra ?? '',
      appr: s.levels,
      sla: s.sla,
      split: s.split && !p.locked,
      status: s.status,
    })),
  }
}

/** Opened: its start day has come — stage 1 is on somebody's plate. Its start day stays then; a change of hands says why. */
export const planOpen = (page: Pick<MktTaskPage, 'project' | 'today'>) =>
  page.project.status === 'active' && !!page.project.startsOn && !!page.today && page.project.startsOn <= page.today

/** What may still change on a stage: nothing once done; a stage waiting for its approval keeps its people; a stage
 * begun keeps its days. Before the plan opens, everything. */
export function stageEditable(s: PlanStage, open: boolean): { people: boolean; days: boolean; split: boolean } {
  if (!open) return { people: true, days: true, split: true }
  if (s.status === 'done') return { people: false, days: false, split: false }
  return { people: s.status !== 'review', days: s.status === 'planned', split: true }
}

/** Each stage's first and last day, as the database counts them (mkt_stage_dates): from the start day, weekends and the
 * holidays given skipped. */
export function planDates(d: PlanDraft, holidays: ReadonlySet<string>): { startsOn: string; dueOn: string }[] {
  return d.start ? stageDates(d.start, d.stages.map(s => s.sla), holidays) : []
}

/** "2 Nov → 4 Nov", or the one day. */
export const datesLabel = (x: { startsOn: string; dueOn: string } | undefined) =>
  !x ? '—' : x.startsOn === x.dueOn ? longDay(x.startsOn) : `${shortDay(x.startsOn)} → ${shortDay(x.dueOn)}`

export interface PlanSummary {
  days: number
  pic: number
  internal: number
  starts: string
  finishes: string
  /** The holidays the dates step over, by name — or "none in this range". */
  skipped: string
}

export function planSummary(d: PlanDraft, holidays: readonly MktHoliday[]): PlanSummary {
  const set = new Set(holidays.map(h => h.day))
  const dates = planDates(d, set)
  const last = dates.at(-1)?.dueOn ?? ''
  const names = d.start && last ? holidays.filter(h => h.day >= d.start && h.day <= last).map(h => h.name) : []
  return {
    days: d.stages.reduce((n, s) => n + s.sla, 0),
    pic: d.stages.reduce((n, s) => n + s.appr.filter(a => a.kind === 'pic').length, 0),
    internal: d.stages.reduce((n, s) => n + s.appr.filter(a => a.kind !== 'pic').length, 0),
    starts: d.start ? longDay(d.start) : '—',
    finishes: last ? longDay(last) : '—',
    skipped: names.length ? [...new Set(names)].join(', ') : 'none in this range',
  }
}

/** Who is on the plan: each stage's person and each approver once, in order — and the PIC, when they approve one. */
export function planCrew(d: PlanDraft, team: readonly MktPerson[], pic: string | null): { id: string; name: string; pic: boolean }[] {
  const ids: string[] = []
  for (const s of d.stages) {
    if (s.owner && !ids.includes(s.owner)) ids.push(s.owner)
    for (const a of s.appr) if (a.kind === 'person' && !ids.includes(a.staff)) ids.push(a.staff)
  }
  const crew = ids.map(id => ({ id, name: team.find(p => p.id === id)?.first || 'someone', pic: false }))
  return d.stages.some(s => s.appr.some(a => a.kind === 'pic')) ? [...crew, { id: 'pic', name: `${pic || 'PIC'} (PIC)`, pic: true }] : crew
}

/** A stage with nobody on it (a 🔓 stage is the stage before's to pick — not unassigned). */
export const unassigned = (s: PlanStage) => !s.owner && !(s.mode === 'prev' && s.idx > 0)

/** The stages whose person changed after the plan opened — each needs its reason. */
export function reasonsNeeded(saved: PlanDraft, d: PlanDraft, open: boolean): number[] {
  if (!open) return []
  return d.stages.filter(s => {
    const was = saved.stages[s.idx]
    return !!was && was.status !== 'done' && !!was.owner && was.owner !== s.owner
  }).map(s => s.idx)
}

export const REASON_MIN = 5
export const REASON_MAX = 300

/** What stops Save, in the words the database would use. Empty = it may save. */
export function planProblems(saved: PlanDraft, d: PlanDraft, open: boolean, today: string, reasons: Readonly<Record<number, string>>): string[] {
  const out: string[] = []
  if (!open) {
    if (!d.start) out.push('Pick the day it starts')
    else if (today && d.start < today) out.push('Pick the day it starts — today or later')
  }
  const n = d.stages.filter(unassigned).length
  if (n) out.push(`${n} stage${n === 1 ? '' : 's'} unassigned`)
  for (const s of d.stages) {
    if (s.appr.some(a => a.kind === 'assign')) out.push(`Stage ${s.idx + 1} (${s.name}): pick who approves it`)
    if (s.appr.length > MAX_APPROVALS) out.push(`Stage ${s.idx + 1} (${s.name}): at most ${MAX_APPROVALS} approvals`)
    if (s.sla < 1 || s.sla > MAX_SLA) out.push(`Stage ${s.idx + 1} (${s.name}): 1 to ${MAX_SLA} working days`)
  }
  for (const i of reasonsNeeded(saved, d, open)) {
    const r = (reasons[i] ?? '').trim()
    if (r.length < REASON_MIN || r.length > REASON_MAX) out.push(`Stage ${i + 1} (${d.stages[i].name}): say why it changes hands`)
  }
  return out
}

/** Anything changed since the plan was saved (a plan not saved yet always has something to save). */
export function planChanged(saved: PlanDraft, d: PlanDraft, planning: boolean): boolean {
  return planning || JSON.stringify(payloadStages(saved)) !== JSON.stringify(payloadStages(d)) || saved.start !== d.start
}

const payloadStages = (d: PlanDraft) => d.stages.map(s => ({
  owner: s.owner, extra: s.extra.trim() || null,
  appr: s.appr.filter((a): a is Exclude<PlanAppr, { kind: 'assign' }> => a.kind !== 'assign'),
  sla: s.sla, split: s.split,
}))

/** What mkt_deliverable_plan takes. */
export function planPayload(d: PlanDraft, reasons: Readonly<Record<number, string>>, needed: readonly number[]) {
  const why: Record<string, string> = {}
  for (const i of needed) if ((reasons[i] ?? '').trim()) why[String(i)] = reasons[i].trim()
  return { start: d.start, stages: payloadStages(d), ...(Object.keys(why).length ? { reasons: why } : {}) }
}

/** The start day the date input offers first: tomorrow — or the next working day after it. */
export function firstStart(today: string, holidays: ReadonlySet<string>): string {
  let d = addDays(today, 1)
  for (let i = 0; i < 14 && (weekdayOf(d) >= 5 || holidays.has(d)); i++) d = addDays(d, 1)
  return d
}

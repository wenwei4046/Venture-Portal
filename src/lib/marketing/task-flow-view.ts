// The task page's top as each viewer sees it (Workflow Builder 2a handoff, `docs/design_handoff_workflow_builder/` ›
// Task Flow.dc.html — 2026-11-13): the header's four facts, the role banner, the compact workflow strip, the focused
// stage's panel, the sections and fields that stage fills in, Next up, and the PIC's simpler page. One model
// (`FlowTask`) is drawn for a running task (`task-flow-page.ts`, from mkt_project) and for the Builder's ▶ Preview
// (`task-flow-sample.ts`, from the draft) — the rules are flow.ts's. Pure.

import { officeTime } from '@/lib/office-time'
import { shortDay } from './board'
import {
  actorsNow, addWorkDays, bannerOf, defaultFocus, isWorkDay, lateDays, levelWaits, overdueFires, PIC_ID, turnOf,
  type ApprLevel, type FinishCfg, type FlowAt, type FlowStage, type OverdueCfg,
} from './flow'

export interface FlowPerson {
  id: string
  name: string
  role: string
  /** Tasks they have open right now. */
  load: number
}

export interface FlowStageIn {
  name: string
  sla: number
  /** Who does it — null while a 🔓 handoff waits for the stage before to pick. */
  doer: string | null
  /** A 🔓 handoff's shortlist. */
  cands: string[]
  levels: ApprLevel[]
  back: number | null
  /** What the PIC reads on the link while the task is here. */
  picText: string
  /** When it opened (an instant) — its clock restarts when changes send it back. */
  enteredAt: string | null
  dueOn: string | null
  /** When it was done (an instant). */
  doneAt: string | null
}

export interface FlowCol {
  id: string
  name: string
  type: string
  /** The stage that fills the column (an index), null = any. */
  stage: number | null
  req: boolean
  pic: boolean
  /** Added on this task by its doer (× takes it off). */
  added: boolean
}

export interface FlowField {
  id: string
  label: string
  type: string
  stage: number | null
  req: boolean
  pic: boolean
  cols: FlowCol[]
}

export interface FlowSection {
  id: string
  emoji: string
  title: string
  stage: number | null
  req: boolean
  pic: boolean
  fields: FlowField[]
}

export type FlowValue = string | boolean | string[]
export interface FlowRow {
  id: string
  cells: Record<string, string | boolean>
  /** Added on this task (× takes it off); a preset row stays. */
  added: boolean
}

export interface FlowLog {
  icon: string
  text: string
  at: string
}

export interface FlowTask {
  title: string
  trackId: string
  /** "{category} · {template} v{n}". */
  tplChip: string
  category: string
  /** The day the work started. */
  startOn: string | null
  promise: number | null
  /** The promised day when it is known as a day (a running task's own); else start + promise. */
  deadline?: string | null
  stages: FlowStageIn[]
  at: FlowAt
  sections: FlowSection[]
  values: Record<string, FlowValue>
  rows: Record<string, FlowRow[]>
  overdue: OverdueCfg
  finish: FinishCfg
  people: FlowPerson[]
  /** The PIC's name (for 'pic' on a level). */
  pic: string
  /** When the task was done (an instant). */
  doneAt: string | null
  log: FlowLog[]
}

export type Tone4 = 'ok' | 'wait' | 'red' | 'done'
const DAY = 864e5
const HOUR = 36e5

/** "2d 4h" · "3h" — how long, as the prototype's `dur`. */
export function dur(ms: number): string {
  const d = Math.floor(Math.max(0, ms) / DAY)
  const h = Math.floor((Math.max(0, ms) % DAY) / HOUR)
  return d ? `${d}d ${h}h` : `${Math.max(1, h)}h`
}

const dayOf = (at: string) => officeTime(at).format('YYYY-MM-DD')
const dayText = (day: string | null) => (day ? shortDay(day) : '—')
const timeText = (at: string) => officeTime(at).format('D MMM HH:mm')

/** A person's name — 'pic' is the PIC on the link. */
export function personName(task: Pick<FlowTask, 'people' | 'pic'>, id: string | null | undefined): string {
  if (!id) return '—'
  if (id === PIC_ID) return `${task.pic || 'PIC'} (PIC)`
  return task.people.find(p => p.id === id)?.name ?? '—'
}
const shortName = (task: Pick<FlowTask, 'people' | 'pic'>, id: string) => (id === PIC_ID ? '🔗 PIC' : personName(task, id))
export const initialOf = (task: Pick<FlowTask, 'people' | 'pic'>, id: string | null | undefined) =>
  !id ? '?' : id === PIC_ID ? '🔗' : (personName(task, id).charAt(0) || '?')

/** A steady hue for a person's avatar (the prototype's soft oklch circles). */
export function hueOf(id: string | null | undefined): number {
  if (!id) return 60
  let h = 0
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) % 360
  return h
}

/** The stages as the rules (flow.ts) take them. */
export const flowStages = (task: Pick<FlowTask, 'stages' | 'at'>): FlowStage[] =>
  task.stages.map((s, i) => ({ doer: s.doer, levels: s.levels, dueOn: s.dueOn, done: task.at.done || i < task.at.cur }))

const isDone = (task: Pick<FlowTask, 'at'>, i: number) => task.at.done || i < task.at.cur
const isCur = (task: Pick<FlowTask, 'at'>, i: number) => !task.at.done && i === task.at.cur

/** How late a stage is: a done one by its finish, the one now by now; later ones never. */
export function stageLate(task: Pick<FlowTask, 'stages' | 'at'>, i: number, now: Date): number {
  const s = task.stages[i]
  if (!s) return 0
  if (isDone(task, i)) return s.doneAt ? lateDays(s.dueOn, new Date(s.doneAt)) : 0
  if (isCur(task, i)) return lateDays(s.dueOn, now)
  return 0
}

/** When each stage is (or is expected to be) due: as planned up to the stage now, then each its SLA after the one
 * before — never from a day already gone. */
export function projected(task: Pick<FlowTask, 'stages' | 'at'>, now: Date): (string | null)[] {
  const today = officeTime(now).format('YYYY-MM-DD')
  const out = task.stages.map(s => s.dueOn)
  let prev = task.stages[task.at.cur]?.dueOn ?? today
  for (let i = task.at.cur + 1; i < task.stages.length; i += 1) {
    let base = prev < today ? today : prev
    while (!isWorkDay(base)) base = addWorkDays(base, 1)
    prev = addWorkDays(base, Math.max(1, task.stages[i].sla))
    out[i] = task.at.done ? task.stages[i].dueOn : prev
  }
  return out
}

/** The promised day: the start plus the promise in working days. */
export function deadlineOf(task: Pick<FlowTask, 'startOn' | 'promise' | 'deadline'>): string | null {
  if (task.deadline !== undefined) return task.deadline
  return task.startOn && task.promise ? addWorkDays(task.startOn, task.promise) : null
}

// ── The header ─────────────────────────────────────────────────────────────────

export interface HeaderView {
  status: { label: string; tone: Tone4 }
  nowWith: { name: string; init: string; hue: number; done: boolean }
  inStage: string
  inStageRed: boolean
  stageDue: string
  stageDueRed: boolean
  deadline: string
  deadlineRed: boolean
}

export function headerView(task: FlowTask, now: Date): HeaderView {
  const cur = task.stages[task.at.cur]
  const late = task.at.done ? 0 : stageLate(task, task.at.cur, now)
  const act = actorsNow(flowStages(task), task.at)
  const proj = projected(task, now)
  const deadline = deadlineOf(task)
  const last = proj[proj.length - 1]
  const atRisk = !task.at.done && !!deadline && !!last && last > deadline
  const status: HeaderView['status'] = task.at.done
    ? { label: task.finish.after === 'feedback' ? 'Done · PIC feedback open 3 days' : 'Done', tone: 'done' }
    : late ? { label: `${late} day${late > 1 ? 's' : ''} overdue`, tone: 'red' }
      : task.at.level >= 0 ? { label: 'Waiting for approval', tone: 'wait' } : { label: 'On track', tone: 'ok' }
  return {
    status,
    nowWith: task.at.done
      ? { name: '—', init: '✓', hue: 150, done: true }
      : { name: (act.map(id => personName(task, id)).join(' & ') || '—') + (task.at.level >= 0 ? ' (approving)' : ''), init: initialOf(task, act[0]), hue: hueOf(act[0]), done: false },
    inStage: task.at.done || !cur?.enteredAt ? '—' : dur(now.getTime() - new Date(cur.enteredAt).getTime()),
    inStageRed: late > 0,
    stageDue: task.at.done || !cur?.dueOn ? '—' : `${shortDay(cur.dueOn)}${late ? ` · ${late}d overdue` : ''}`,
    stageDueRed: late > 0,
    deadline: deadline ? `${shortDay(deadline)}${atRisk ? ' · at risk' : ''}` : '—',
    deadlineRed: atRisk,
  }
}

// ── The strip ──────────────────────────────────────────────────────────────────

export interface StripCard {
  idx: number
  mark: string
  name: string
  state: 'done' | 'cur' | 'later'
  late: boolean
  you: boolean
  who: string
  init: string
  hue: number
  /** Nobody on it yet (a 🔓 handoff) — a dashed ring. */
  open: boolean
  mini: string
  miniTone: 'ok' | 'red' | 'ink' | 'muted'
  focused: boolean
  /** The line after it is green (it is done). */
  linkDone: boolean
}

/** Who a stage is with in words: the doer, or "🔓 {who} picks". */
function whoOf(task: FlowTask, i: number): { who: string; sub: string; init: string; hue: number; open: boolean } {
  const s = task.stages[i]
  if (s.doer) {
    const p = task.people.find(x => x.id === s.doer)
    return { who: personName(task, s.doer), sub: p?.role ?? '', init: initialOf(task, s.doer), hue: hueOf(s.doer), open: false }
  }
  const before = task.stages[i - 1]
  const picker = before?.doer ? personName(task, before.doer) : before ? `whoever does ${before.name}` : 'MM'
  return { who: `🔓 ${picker} picks`, sub: s.cands.map(c => personName(task, c)).join(' / '), init: '?', hue: 0, open: true }
}

export function stripView(task: FlowTask, me: string | null, focus: number, now: Date): StripCard[] {
  return task.stages.map((s, i) => {
    const done = isDone(task, i)
    const cur = isCur(task, i)
    const late = stageLate(task, i, now)
    const w = whoOf(task, i)
    const mini = done ? (late ? `${late}d late` : '✓') : cur ? (s.enteredAt ? dur(now.getTime() - new Date(s.enteredAt).getTime()) : '—') : `${s.sla}d`
    return {
      idx: i,
      mark: done ? '✓' : String(i + 1),
      name: s.name || 'Untitled stage',
      state: done ? 'done' : cur ? 'cur' : 'later',
      late: cur && late > 0,
      you: !!me && s.doer === me && !done,
      who: w.who,
      init: w.init,
      hue: w.hue,
      open: w.open,
      mini,
      miniTone: done ? (late ? 'red' : 'ok') : cur ? (late ? 'red' : 'ink') : 'muted',
      focused: i === focus,
      linkDone: done,
    }
  })
}

/** Where the focus starts: flow.ts's defaultFocus (the viewer's own stage). */
export const focusOf = (task: FlowTask, me: string | null) => defaultFocus(flowStages(task), task.at, me)

/** The focus resets when the viewer changes or the task moves on: its key. */
export const focusKey = (task: Pick<FlowTask, 'at'>, me: string | null) =>
  `${task.at.cur}:${task.at.level}:${task.at.done ? 1 : 0}:${me ?? ''}`

// ── The focused stage's panel ───────────────────────────────────────────────────

export interface GateView {
  n: number
  rule: '' | 'any' | 'all'
  tone: 'passed' | 'active' | 'later'
  people: { text: string; tone: 'ok' | 'wait' | 'plain'; strong: boolean }[]
}

export interface PanelView {
  n: number
  name: string
  who: string
  whoSub: string
  init: string
  hue: number
  open: boolean
  timeK: string
  timeV: string
  timeRed: boolean
  dueK: string
  dueV: string
  dueTone: 'ok' | 'red' | 'ink'
  gates: GateView[]
  canReassign: boolean
  /** Its line: the stage now's colour (orange, red late), else quiet. */
  line: 'cur' | 'late' | 'quiet'
}

export function panelView(task: FlowTask, i: number, isManager: boolean, now: Date): PanelView {
  const s = task.stages[i]
  const done = isDone(task, i)
  const cur = isCur(task, i)
  const late = stageLate(task, i, now)
  const w = whoOf(task, i)
  const proj = projected(task, now)
  let timeK = 'Planned'
  let timeV = `${s.sla}d`
  let dueK = 'Expected by'
  let dueV = dayText(proj[i])
  let dueTone: PanelView['dueTone'] = 'ink'
  if (done) {
    timeK = 'Took'
    timeV = s.enteredAt && s.doneAt ? dur(new Date(s.doneAt).getTime() - new Date(s.enteredAt).getTime()) : '—'
    dueK = `Due ${dayText(s.dueOn)}`
    dueV = late ? `${late}d late` : 'On time'
    dueTone = late ? 'red' : 'ok'
  } else if (cur) {
    timeK = task.at.level >= 0 ? 'Waiting approval' : 'In stage'
    timeV = s.enteredAt ? dur(now.getTime() - new Date(s.enteredAt).getTime()) : '—'
    dueK = 'Due'
    dueV = `${dayText(s.dueOn)}${late ? ` · ${late}d overdue` : ''}`
    dueTone = late ? 'red' : 'ink'
  }
  const gates: GateView[] = s.levels.map((l, j) => {
    const active = cur && task.at.level === j
    const passed = done || (cur && task.at.level > j)
    const ok = active ? task.at.ok : {}
    return {
      n: j + 1,
      rule: l.ids.length > 1 ? l.rule : '',
      tone: passed ? 'passed' : active ? 'active' : 'later',
      people: l.ids.map(id => ({
        text: `${shortName(task, id)}${ok[id] ? ' ✓' : active ? ' …' : ''}`,
        tone: ok[id] ? 'ok' : active ? 'wait' : 'plain',
        strong: active && !ok[id],
      })),
    }
  })
  return {
    n: i + 1,
    name: s.name || 'Untitled stage',
    who: w.who,
    whoSub: w.sub,
    init: w.init,
    hue: w.hue,
    open: w.open,
    timeK,
    timeV,
    timeRed: cur && late > 0,
    dueK,
    dueV,
    dueTone,
    gates,
    canReassign: isManager && !done,
    line: cur ? (late ? 'late' : 'cur') : 'quiet',
  }
}

// ── What the focused stage fills in; what is missing ───────────────────────────────

const fillsAt = (sec: FlowSection, i: number) =>
  sec.stage === i || sec.fields.some(f => f.stage === i || f.cols.some(c => c.stage === i))

/** Only the sections the focused stage fills in (a section's own stage, a field's, a table column's). */
export const focusSections = (task: Pick<FlowTask, 'sections'>, i: number) => task.sections.filter(sec => fillsAt(sec, i))

const empty = (v: FlowValue | undefined) => v === undefined || v === false || v === '' || (typeof v === 'string' && !v.trim()) || (Array.isArray(v) && !v.length)

export interface Missing {
  /** The field's id — a table column's is `<field>:<col>`. */
  id: string
  label: string
}

/** What the stage now still needs before it is submitted: its required fields empty, its required table columns empty
 * on any row (or no row at all) — a table's checkbox column never is (unticked is an answer there), as the prototype. */
export function missingOf(task: Pick<FlowTask, 'sections' | 'values' | 'rows' | 'at'>, files: (fieldId: string) => boolean = () => false): Missing[] {
  if (task.at.done) return []
  const i = task.at.cur
  const out: Missing[] = []
  for (const sec of task.sections) {
    for (const f of sec.fields) {
      if (f.type === 'Table') {
        const rows = task.rows[f.id] ?? []
        for (const c of f.cols) {
          if (c.stage !== i || !c.req || c.type === 'Checkbox') continue
          if (!rows.length || rows.some(r => empty(r.cells[c.id]))) out.push({ id: `${f.id}:${c.id}`, label: `${f.label} · ${c.name}` })
        }
        continue
      }
      if (f.stage !== i || !f.req || f.type === 'Note') continue
      if (f.type === 'File' && files(f.id)) continue
      if (empty(task.values[f.id])) out.push({ id: f.id, label: f.label })
    }
  }
  return out
}

/** "Fill 2 required fields first: Draft video, Shot list · Clip link". */
export const missingToast = (miss: readonly Missing[]) =>
  `Fill ${miss.length} required field${miss.length > 1 ? 's' : ''} first: ${miss.map(m => m.label).join(', ')}`

/** May the viewer fill in this field now? Only the current doer, before submit, the field of the stage now. */
export const mayFill = (task: Pick<FlowTask, 'stages' | 'at'>, me: string | null, stage: number | null) =>
  !!me && !task.at.done && task.at.level < 0 && stage === task.at.cur && task.stages[task.at.cur]?.doer === me

/** A section's state at its right: "Your turn · fill in", "✓ Done", "With Ali", "Later · Edit", "Read-only". */
export function sectionState(task: FlowTask, sec: FlowSection, me: string | null): { text: string; tone: 'wait' | 'ok' | 'muted'; mine: boolean } {
  const mine = sec.fields.some(f => mayFill(task, me, f.stage) || f.cols.some(c => mayFill(task, me, c.stage))) || mayFill(task, me, sec.stage)
  if (mine) return { text: 'Your turn · fill in', tone: 'wait', mine: true }
  const isTable = sec.fields.some(f => f.type === 'Table')
  const owner = sec.stage
  const act = actorsNow(flowStages(task), task.at)
  if (isTable) {
    const owners = new Set(sec.fields.flatMap(f => f.cols.map(c => c.stage)))
    return { text: !task.at.done && owners.has(task.at.cur) ? `With ${personName(task, act[0])}` : 'Read-only', tone: 'muted', mine: false }
  }
  if (owner === null) return { text: 'Read-only', tone: 'muted', mine: false }
  if (task.at.done || owner < task.at.cur) {
    const filled = sec.fields.length > 0 && sec.fields.every(f => !f.req || !empty(task.values[f.id]))
    return { text: filled ? '✓ Done' : 'Done', tone: 'ok', mine: false }
  }
  if (owner === task.at.cur) return { text: `With ${act.map(id => personName(task, id)).join(' & ')}`, tone: 'muted', mine: false }
  return { text: `Later · ${task.stages[owner]?.name ?? ''}`, tone: 'muted', mine: false }
}

/** A section's badges: "🎯 Edit", "⭐ Required", "👁 PIC sees". */
export function sectionBadges(task: Pick<FlowTask, 'stages'>, sec: FlowSection): string[] {
  return [
    sec.stage !== null && task.stages[sec.stage] ? `🎯 ${task.stages[sec.stage].name}` : null,
    sec.req ? '⭐ Required' : null,
    sec.pic ? '👁 PIC sees' : null,
  ].filter((x): x is string => !!x)
}

/** A read-only field's words: its answer, else where it is filled in. */
export function fieldDisplay(task: Pick<FlowTask, 'stages' | 'values'>, f: FlowField): { text: string; filled: boolean } {
  const v = task.values[f.id]
  if (!empty(v)) return { text: v === true ? '✓ Yes' : Array.isArray(v) ? v.join(', ') : String(v), filled: true }
  return { text: f.stage === null || !task.stages[f.stage] ? '—' : `Filled at ${task.stages[f.stage].name}`, filled: false }
}

/** The table's note under it. */
export function tableNote(task: Pick<FlowTask, 'stages' | 'rows'>, f: FlowField, mine: boolean): string {
  const n = (task.rows[f.id] ?? []).length
  const rows = `${n} row${n === 1 ? '' : 's'}`
  if (mine) return `${rows} · you fill the highlighted columns`
  const owners = [...new Set(f.cols.map(c => (c.stage === null ? null : task.stages[c.stage]?.name)).filter((x): x is string => !!x))]
  return `${rows} · columns are filled at ${owners.join(', ') || 'any stage'}`
}

// ── The banner ─────────────────────────────────────────────────────────────────

export type BannerAction = 'submit' | 'changes' | 'approve' | 'reassign' | 'nudge' | 'replay'
export interface BannerView {
  tone: 'me' | 'late' | 'calm' | 'done'
  icon: string
  title: string
  text: string
  actions: { key: BannerAction; label: string; primary: boolean }[]
}

export function bannerView(task: FlowTask, me: string | null, isManager: boolean, now: Date, missing: number): BannerView {
  const fs = flowStages(task)
  const kind = bannerOf(fs, task.at, me, isManager)
  const cur = task.stages[task.at.cur]
  const act = actorsNow(fs, task.at)
  const actNames = act.map(id => personName(task, id)).join(' & ') || 'nobody yet'
  const late = task.at.done ? 0 : stageLate(task, task.at.cur, now)
  const deadline = deadlineOf(task)
  const proj = projected(task, now)
  if (kind === 'done') {
    const fin = task.doneAt ? dayOf(task.doneAt) : null
    const before = fin && deadline ? fin <= deadline : false
    return {
      tone: 'done', icon: '🎉', title: 'This task is done',
      text: `Finished ${dayText(fin)}${before && deadline ? `, before the ${shortDay(deadline)} deadline` : deadline && fin ? `, after the ${shortDay(deadline)} deadline` : ''}.${task.finish.after === 'feedback' ? ' PIC can still comment for 3 working days.' : ''}`,
      actions: [{ key: 'replay', label: 'Replay celebration', primary: true }],
    }
  }
  if (kind === 'approver') {
    const lv = cur.levels[task.at.level]
    const how = lv && lv.ids.length > 1 ? (lv.rule === 'all' ? 'Everyone on this level must approve.' : 'Any one approval moves it on.') : 'Approve to move it on, or send it back.'
    return {
      tone: 'me', icon: '👀', title: `Your approval · ${cur.name}`, text: `${personName(task, cur.doer)} submitted it. ${how}`,
      actions: [{ key: 'changes', label: 'Request changes', primary: false }, { key: 'approve', label: 'Approve', primary: true }],
    }
  }
  if (kind === 'doer') {
    const next = task.stages[task.at.cur + 1]
    const first = cur.levels[0]
    const then = first ? `${first.ids.map(id => personName(task, id)).join(' & ')} is notified to approve`
      : next ? (next.doer ? `${personName(task, next.doer)} is notified to start ${next.name}` : `you pick who does ${next.name}`) : 'the task is done'
    return {
      tone: late ? 'late' : 'me', icon: late ? '⏰' : '👉', title: `Your turn · ${cur.name}${late ? ` · ${late}d overdue` : ''}`,
      text: missing ? `Fill ${missing} required field${missing > 1 ? 's' : ''} below, then submit.` : `Everything required is filled. When you submit, ${then}.`,
      actions: [{ key: 'submit', label: `Submit ${cur.name}`, primary: true }],
    }
  }
  if (kind === 'mm') {
    const held = cur.enteredAt ? dur(now.getTime() - new Date(cur.enteredAt).getTime()) : '—'
    if (overdueFires(late, task.overdue) && task.overdue.action === 'reassign') {
      return {
        tone: 'late', icon: '⏰', title: `${cur.name} is ${late}d overdue · reassign it?`,
        text: `It has been with ${actNames} for ${held}. Your overdue rule asks you to pick someone else.`,
        actions: [{ key: 'nudge', label: '🔔 Nudge', primary: false }, { key: 'reassign', label: '⇄ Reassign now', primary: true }],
      }
    }
    return {
      tone: late ? 'late' : 'calm', icon: '🧭', title: `You manage this task · now with ${actNames}`,
      text: `${cur.name} has been there ${held}${late ? `, ${late} day${late > 1 ? 's' : ''} past due` : ''}. Nudge, or reassign any stage that isn’t done.`,
      actions: [{ key: 'reassign', label: '⇄ Reassign current', primary: false }, { key: 'nudge', label: '🔔 Nudge', primary: true }],
    }
  }
  // On a later 🔓 stage's shortlist: up next too (the rules count doers and approvers only).
  const listed = !!me && task.stages.some((s, i) => i > task.at.cur && !s.doer && s.cands.includes(me))
  if ((kind === 'upcoming' || ((kind === 'none' || kind === 'finished') && listed)) && me) {
    const mine = task.stages.findIndex((s, i) => i > task.at.cur && (s.doer === me || s.cands.includes(me) || s.levels.some(l => l.ids.includes(me))))
    const at = mine > -1 ? mine : task.at.cur
    const steps = at - task.at.cur
    return {
      tone: 'calm', icon: '⏳', title: `You’re up ${steps <= 1 ? 'next' : `in ${steps} stages`} · ${task.stages[at].name}`,
      text: `Expected around ${dayText(proj[at])}. You’ll get a notification when it’s your turn.`, actions: [],
    }
  }
  const finished = me ? task.stages.filter((s, i) => i < task.at.cur && s.doer === me).map(s => s.name) : []
  return {
    tone: 'calm', icon: '✓', title: finished.length ? `You finished ${finished.join(' and ')}` : 'You’re not on this task',
    text: `It’s now at ${cur?.name ?? '—'} with ${actNames}. You’ll hear when it’s done.`, actions: [],
  }
}

// ── Next up ────────────────────────────────────────────────────────────────────

export interface NextView {
  title: string
  sub: string
  init: string
  hue: number
  when: string
}

export function nextUpView(task: FlowTask, now: Date): NextView {
  if (task.at.done) return { title: 'Nothing left', sub: 'Every stage is done', init: '✓', hue: 150, when: 'Sent when the last approval came in' }
  const fs = flowStages(task)
  const cur = task.stages[task.at.cur]
  const act = actorsNow(fs, task.at).map(id => personName(task, id)).join(' / ') || 'nobody'
  const lv = task.at.level >= 0 ? cur.levels[task.at.level] : null
  const pend = lv ? levelWaits(lv, task.at.ok) : []
  const proj = projected(task, now)
  if (lv && lv.rule === 'all' && pend.length && pend.length < lv.ids.length) {
    return { title: `Waiting for ${pend.map(id => personName(task, id)).join(' & ')}`, sub: `Level ${task.at.level + 1} needs everyone`, init: initialOf(task, pend[0]), hue: hueOf(pend[0]), when: `Already notified · “Please approve ${cur.name}.”` }
  }
  const nextLv = task.at.level < 0 ? cur.levels[0] : cur.levels[task.at.level + 1]
  const verb = task.at.level < 0 ? 'submits' : 'approves'
  if (nextLv) {
    const ids = nextLv.ids
    return {
      title: `${ids.map(id => personName(task, id)).join(nextLv.rule === 'all' ? ' & ' : ' or ')} approve${ids.length > 1 ? '' : 's'} ${cur.name}`,
      sub: `Level ${task.at.level + 2} of ${cur.levels.length}${ids.length > 1 ? (nextLv.rule === 'all' ? ' · all must approve' : ' · any one is enough') : ''}`,
      init: initialOf(task, ids[0]), hue: hueOf(ids[0]),
      when: `Sent the moment ${act} ${verb} · “Please approve ${cur.name}.”`,
    }
  }
  const nx = task.stages[task.at.cur + 1]
  if (nx) {
    if (nx.doer) {
      const due = addWorkDays(officeTime(now).format('YYYY-MM-DD'), Math.max(1, nx.sla))
      return {
        title: `${personName(task, nx.doer)} · ${nx.name}`, sub: `Stage ${task.at.cur + 2} · expected by ${dayText(proj[task.at.cur + 1])}`,
        init: initialOf(task, nx.doer), hue: hueOf(nx.doer), when: `Sent the moment ${act} ${verb} · “Your turn — ${nx.name}, due ${shortDay(due)}.”`,
      }
    }
    const picker = cur.doer ? personName(task, cur.doer) : 'MM'
    return {
      title: `${picker} picks who does ${nx.name}`, sub: `From ${nx.cands.map(c => personName(task, c)).join(' / ') || 'the shortlist'} · or MM assigns now`,
      init: '?', hue: 0, when: `${picker} is asked when this stage is done · the person picked gets “Your turn — ${nx.name}”.`,
    }
  }
  return { title: '🏁 Task done', sub: 'This is the last stage', init: '🏁', hue: 150, when: 'When this stage is approved · everyone on the task is told, and the celebration plays.' }
}

/** The activity in the prototype's words: the latest three, or all. */
export const activityShown = (log: readonly FlowLog[], all: boolean) =>
  (all ? log : log.slice(0, 3)).map(l => ({ ...l, time: timeText(l.at) }))

/** "{team} each get +60 XP": everybody who did a stage. */
export function celebTeam(task: Pick<FlowTask, 'stages' | 'people' | 'pic'>): string {
  const ids = [...new Set(task.stages.map(s => s.doer).filter((x): x is string => !!x))]
  return ids.map(id => personName(task, id)).join(', ')
}

/** The reassign / handoff modal's people: the shortlist (a handoff), else everybody but the manager; the person now
 * ticked; load red at 5 or more. */
export function modalPeople(task: FlowTask, i: number, kind: 'reassign' | 'pick', exclude: string | null = null) {
  const s = task.stages[i]
  const list = kind === 'pick' ? task.people.filter(p => s.cands.includes(p.id)) : task.people.filter(p => p.id !== exclude)
  return list.map(p => ({ ...p, hue: hueOf(p.id), current: s.doer === p.id, busy: p.load >= 5 }))
}

// ── The PIC's page ─────────────────────────────────────────────────────────────

export interface PicView {
  tone: 'done' | 'wait' | 'calm'
  icon: string
  title: string
  text: string
  /** The PIC is a pending approver now. */
  answer: boolean
  steps: { name: string; state: 'done' | 'cur' | 'next' }[]
  eta: string
  secs: {
    id: string
    emoji: string
    title: string
    /** 📋 Requirements' words. */
    text?: string
    fields: { name: string; text: string; filled: boolean }[]
    table: { cols: string[]; cells: { text: string; filled: boolean }[][] } | null
  }[]
}

/** The PIC's simpler page: the stage's PIC text, Approve / Request changes when they are a pending approver, the steps,
 * "Expected by", and only the 👁 sections, fields and columns ("Coming soon" where empty) — no staff names, no prices. */
export function picView(task: FlowTask, now: Date, requirements: string | null = null): PicView {
  const cur = task.stages[task.at.cur]
  const answer = !!turnOf(flowStages(task), task.at, PIC_ID)
  const proj = projected(task, now)
  const head = task.at.done
    ? { tone: 'done' as const, icon: '🎉', title: task.finish.picText || 'It’s ready', text: `Finished ${dayText(task.doneAt ? dayOf(task.doneAt) : null)}.` }
    : answer ? { tone: 'wait' as const, icon: '👀', title: 'Your approval is needed', text: `${cur.picText || 'It’s ready'}. Approve, or tell us what to change.` }
      : { tone: 'calm' as const, icon: '⏳', title: cur?.picText || 'The team is working on it', text: `Step ${task.at.cur + 1} of ${task.stages.length}. We’ll message you when it needs your approval.` }
  const cell = (v: FlowValue | undefined) => (empty(v) ? { text: 'Coming soon', filled: false } : { text: v === true ? '✓' : Array.isArray(v) ? v.join(', ') : String(v), filled: true })
  return {
    ...head,
    answer,
    steps: task.stages.map((s, i) => ({ name: s.name, state: isDone(task, i) ? 'done' : isCur(task, i) ? 'cur' : 'next' })),
    eta: task.at.done ? 'All steps done.' : `Expected by ${dayText(proj[proj.length - 1])}`,
    secs: ([...(requirements ? [{ id: 'req', emoji: '📋', title: 'Requirements', text: requirements, fields: [], table: null }] : []), ...task.sections.filter(sec => sec.pic).map(sec => {
      const table = sec.fields.find(f => f.type === 'Table' && f.pic)
      const cols = table ? table.cols.filter(c => c.pic) : []
      return {
        id: sec.id,
        emoji: sec.emoji,
        title: sec.title,
        fields: sec.fields.filter(f => f.pic && f.type !== 'Table' && f.type !== 'Note').map(f => ({ name: f.label, ...cell(task.values[f.id]) })),
        table: table ? { cols: cols.map(c => c.name), cells: (task.rows[table.id] ?? []).map(r => cols.map(c => cell(r.cells[c.id]))) } : null,
      }
    })] as PicView['secs']).filter(x => !!x.text || x.fields.length > 0 || !!x.table),
  }
}

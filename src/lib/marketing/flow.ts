// The workflow's rules, once (Workflow Builder 2a handoff, docs/design_handoff_workflow_builder/README.md › Interactions
// & behavior — 2026-11-13). The Builder, its ▶ Preview, My Space's My turn / Waiting, the task page and the PIC's link
// all reckon from these; the database's twins say the same (mkt_level_waits, mkt_stage_dates — the PGlite checks use
// the same days). Pure.
//
// - Stage order = flow; the last stage is the end. Done = the last stage submitted with no approval, or approved by
//   its last level.
// - An approval level names up to everybody it needs (people by staff id, 'pic' — the PIC on the link, 'assign' — one
//   picked at assignment, resolved to a person when the work is planned). `any` passes on the first approval; `all`
//   waits for everyone on the level. Levels run in order (≤ 3).
// - Request changes goes back to the stage's `back` (or stays), clearing the approvals from there to here.
// - Due dates: working days, Monday to Friday (the user, 2026-11-13: "只算周一到周五" — no holidays), ending 18:00
//   in the office. Late = whole days past due, rounded up.

import { addDays, weekdayOf } from './board'

export type ApprRule = 'any' | 'all'
/** One approval level: who (staff ids, 'pic', 'assign') and whether one of them or all of them must approve. */
export interface ApprLevel {
  ids: string[]
  rule: ApprRule
}

export const PIC_ID = 'pic'
export const ASSIGN_ID = 'assign'
export const MAX_LEVELS = 3

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

/** A level as any version of the data keeps it: `{ids, rule}` (2026-11-13), or the older one-person forms
 * (`{kind: 'person', staff}`, `{kind: 'pic', all?}`, `{kind: 'assign'}`). Unknown → null. */
export function levelFromRow(v: unknown): ApprLevel | null {
  if (!isObj(v)) return null
  if (Array.isArray(v.ids)) {
    const ids = [...new Set(v.ids.filter((x): x is string => typeof x === 'string' && x.length > 0))]
    return { ids, rule: v.rule === 'all' ? 'all' : 'any' }
  }
  if (v.kind === 'person' && typeof v.staff === 'string') return { ids: [v.staff], rule: 'any' }
  if (v.kind === 'pic') return { ids: [PIC_ID], rule: 'any' }
  if (v.kind === 'assign') return { ids: [typeof v.staff === 'string' && v.staff ? v.staff : ASSIGN_ID], rule: 'any' }
  return null
}

export const levelsFromRow = (v: unknown): ApprLevel[] =>
  Array.isArray(v) ? v.map(levelFromRow).filter((l): l is ApprLevel => !!l) : []

/** Who on a level has approved so far (this version, this level): id → when. */
export type LevelOk = Record<string, string>

/** Who a level still waits for. `any`: everyone on it until one approves, then nobody; `all`: those who have not. */
export function levelWaits(level: ApprLevel, ok: LevelOk): string[] {
  const done = level.ids.filter(id => !!ok[id])
  if (level.rule === 'any') return done.length ? [] : [...level.ids]
  return level.ids.filter(id => !ok[id])
}

/** Has the level passed? (A level with nobody on it passes — the builder refuses to publish one.) */
export const levelPassed = (level: ApprLevel, ok: LevelOk) => levelWaits(level, ok).length === 0

/** A level in words: "Rachel" · "Rachel & Daniel" (everyone) · "Rachel or Daniel" (any one). */
export function levelText(level: ApprLevel, nameOf: (id: string) => string): string {
  const names = level.ids.map(nameOf)
  if (!names.length) return 'Choose approvers'
  return names.join(level.rule === 'all' ? ' & ' : ' or ')
}

/** The levels in words, joined by "→"; "—" when there is no approval. */
export const levelsText = (levels: readonly ApprLevel[], nameOf: (id: string) => string) =>
  levels.length ? levels.map(l => levelText(l, nameOf)).join(' → ') : '—'

/** Where changes requested on stage `at` go back to: its `back` (an earlier stage), else the stage itself. */
export const backTarget = (at: number, back: number | null | undefined) =>
  typeof back === 'number' && back >= 0 && back < at ? back : at

// ── Days ───────────────────────────────────────────────────────────────────────

/** A working day: Monday to Friday. */
export const isWorkDay = (day: string) => weekdayOf(day) < 5

/** `n` working days after `day` (n ≥ 0; 0 = the day itself). */
export function addWorkDays(day: string, n: number): string {
  let d = day
  for (let left = Math.max(0, Math.trunc(n)); left > 0; ) {
    d = addDays(d, 1)
    if (isWorkDay(d)) left -= 1
  }
  return d
}

/** Each stage's first and last day: the first starts on `base`, each is due its SLA in working days after the one
 * before (the first, after `base`); a later stage starts the working day after the one before is due. As
 * mkt_stage_dates. */
export function flowDates(base: string, slas: readonly number[]): { idx: number; startsOn: string; dueOn: string }[] {
  const out: { idx: number; startsOn: string; dueOn: string }[] = []
  let day = base
  slas.forEach((sla, idx) => {
    let start = base
    if (idx > 0) {
      start = addDays(day, 1)
      while (!isWorkDay(start)) start = addDays(start, 1)
    }
    day = addWorkDays(day, Math.max(1, Math.trunc(sla) || 1))
    out.push({ idx, startsOn: start, dueOn: day })
  })
  return out
}

/** When a stage due on `dueOn` is due: 18:00 in the office (UTC+8), as an instant. */
export const dueAt = (dueOn: string) => new Date(`${dueOn.slice(0, 10)}T18:00:00+08:00`)

const DAY_MS = 864e5

/** Whole days past due, rounded up; 0 when on time. `end` = now for a stage running, its finish for one done. */
export function lateDays(dueOn: string | null | undefined, end: Date): number {
  if (!dueOn) return 0
  const diff = Math.ceil((end.getTime() - dueAt(dueOn).getTime()) / DAY_MS)
  return diff > 0 ? diff : 0
}

// ── What happens when a stage is late; what happens when the task is done ─────────

export type OverdueNotify = 'doer' | 'mm' | 'director' | 'next'
export interface OverdueCfg {
  /** Late by (1–10): from this many days past due the rule fires. */
  days: number
  notify: OverdueNotify[]
  /** remind: the people above are reminded; reassign: the manager is also asked to reassign it. */
  action: 'remind' | 'reassign'
  /** Remind again every day until the stage moves on. */
  repeat: boolean
}
export const DEFAULT_OVERDUE: OverdueCfg = { days: 1, notify: ['doer', 'mm'], action: 'remind', repeat: true }
const OD_NOTIFY: readonly OverdueNotify[] = ['doer', 'mm', 'director', 'next']

export function overdueFromRow(v: unknown): OverdueCfg {
  if (!isObj(v)) return { ...DEFAULT_OVERDUE, notify: [...DEFAULT_OVERDUE.notify] }
  const days = typeof v.days === 'number' && Number.isFinite(v.days) ? Math.min(10, Math.max(1, Math.trunc(v.days))) : DEFAULT_OVERDUE.days
  const notify = Array.isArray(v.notify) ? OD_NOTIFY.filter(k => (v.notify as unknown[]).includes(k)) : [...DEFAULT_OVERDUE.notify]
  return { days, notify, action: v.action === 'reassign' ? 'reassign' : 'remind', repeat: v.repeat !== false }
}

/** Has the overdue rule fired for a stage this late? */
export const overdueFires = (late: number, cfg: OverdueCfg) => late > 0 && late >= cfg.days

/** "⏰ Late 1d → doer + MM" (· reassign). */
export function overdueSummary(cfg: OverdueCfg): string {
  const short: Record<OverdueNotify, string> = { doer: 'doer', mm: 'MM', director: 'Director', next: 'next' }
  return `⏰ Late ${cfg.days}d → ${cfg.notify.map(k => short[k]).join(' + ') || 'nobody'}${cfg.action === 'reassign' ? ' · reassign' : ''}`
}

export type FinishNotify = 'all' | 'mm' | 'pic' | 'req'
export type Celebration = 'fireworks' | 'cheers' | 'movie' | 'confetti' | 'custom'
export const CELEBRATIONS: readonly { key: Exclude<Celebration, 'custom'>; icon: string; label: string }[] = [
  { key: 'fireworks', icon: '🎆', label: 'Fireworks' },
  { key: 'cheers', icon: '🍻', label: 'Cheers' },
  { key: 'movie', icon: '🎬', label: 'Movie night' },
  { key: 'confetti', icon: '🎉', label: 'Confetti' },
]
export interface FinishCfg {
  notify: FinishNotify[]
  /** close: Done at once (XP given); feedback: open 3 more working days for the PIC's comments. */
  after: 'close' | 'feedback'
  /** What the PIC sees on the link once it is done. */
  picText: string
  celebration: Celebration
  /** The uploaded GIF / WebP / APNG — its path in the bucket `marketing` (`workflow/<uuid>/<name>`). */
  gifPath: string | null
}
const FIN_NOTIFY: readonly FinishNotify[] = ['all', 'mm', 'pic', 'req']
const CELEB_KEYS: readonly Celebration[] = ['fireworks', 'cheers', 'movie', 'confetti', 'custom']
export const GIF_MAX_BYTES = 4_000_000
export const GIF_TYPES = ['image/gif', 'image/webp', 'image/apng', 'image/png'] as const

/** The defaults the handoff draws: everyone told, close, "Your <category> is ready", fireworks. */
export const defaultFinish = (category: string): FinishCfg => ({
  notify: ['all'],
  after: 'close',
  picText: `Your ${category.toLowerCase()} is ready`,
  celebration: 'fireworks',
  gifPath: null,
})

export function finishFromRow(v: unknown, category: string): FinishCfg {
  const d = defaultFinish(category)
  if (!isObj(v)) return d
  const gifPath = typeof v.gifPath === 'string' && v.gifPath ? v.gifPath : null
  const celebration = CELEB_KEYS.find(k => k === v.celebration) ?? d.celebration
  return {
    notify: Array.isArray(v.notify) ? FIN_NOTIFY.filter(k => (v.notify as unknown[]).includes(k)) : d.notify,
    after: v.after === 'feedback' ? 'feedback' : 'close',
    picText: typeof v.picText === 'string' ? v.picText.slice(0, 120) : d.picText,
    // A custom celebration with no GIF falls back to the default.
    celebration: celebration === 'custom' && !gifPath ? d.celebration : celebration,
    gifPath,
  }
}

// ── A running task as each viewer sees it ─────────────────────────────────────────

/** The bits of a running stage the rules need. */
export interface FlowStage {
  /** Who does it (staff id); null while nobody is assigned / picked yet. */
  doer: string | null
  levels: ApprLevel[]
  dueOn: string | null
  done: boolean
}
/** Where a running task stands: the stage now (its index), the level now (-1 = being done), who approved this level. */
export interface FlowAt {
  cur: number
  level: number
  ok: LevelOk
  done: boolean
}

/** Who the task waits for right now: the doer while it is being done, else the level's people still to approve. */
export function actorsNow(stages: readonly FlowStage[], at: FlowAt): string[] {
  if (at.done) return []
  const s = stages[at.cur]
  if (!s) return []
  if (at.level < 0) return s.doer ? [s.doer] : []
  const lv = s.levels[at.level]
  return lv ? levelWaits(lv, at.ok) : []
}

/** Is it the viewer's turn, and how? `doer` (theirs to do), `approve` (theirs to approve), or null. */
export function turnOf(stages: readonly FlowStage[], at: FlowAt, me: string | null): 'doer' | 'approve' | null {
  if (!me || at.done) return null
  if (!actorsNow(stages, at).includes(me)) return null
  return at.level < 0 ? 'doer' : 'approve'
}

/** Is the viewer on the task at all — a doer or an approver of any stage? */
export const isOnTask = (stages: readonly FlowStage[], me: string | null) =>
  !!me && stages.some(s => s.doer === me || s.levels.some(l => l.ids.includes(me)))

/** My Space's tile for a task: My turn (theirs now), Waiting (on it, not theirs now), or none. */
export function tileOf(stages: readonly FlowStage[], at: FlowAt, me: string | null): 'turn' | 'waiting' | null {
  if (at.done || !me) return null
  if (turnOf(stages, at, me)) return 'turn'
  return isOnTask(stages, me) ? 'waiting' : null
}

const onStage = (s: FlowStage, me: string) => s.doer === me || s.levels.some(l => l.ids.includes(me))

/** The stage the task page opens on for a viewer: the stage now if it is their turn or their approval; else their
 * next stage; else the last stage they finished; else the stage now (a manager, or nobody on it). */
export function defaultFocus(stages: readonly FlowStage[], at: FlowAt, me: string | null): number {
  const last = Math.max(0, stages.length - 1)
  const cur = Math.min(Math.max(0, at.cur), last)
  if (!me) return cur
  if (turnOf(stages, at, me)) return cur
  if (!at.done) {
    for (let i = cur + (stages[cur] && onStage(stages[cur], me) ? 1 : 0); i < stages.length; i += 1) {
      if (i > cur && onStage(stages[i], me)) return i
    }
  }
  for (let i = at.done ? last : cur; i >= 0; i -= 1) if (onStage(stages[i], me) && (at.done || i < cur || stages[i].done)) return i
  return cur
}

/** The banner the task page shows a viewer. */
export type BannerKind = 'done' | 'doer' | 'approver' | 'mm' | 'upcoming' | 'finished' | 'none'
export function bannerOf(stages: readonly FlowStage[], at: FlowAt, me: string | null, isManager: boolean): BannerKind {
  if (at.done) return 'done'
  const t = turnOf(stages, at, me)
  if (t === 'doer') return 'doer'
  if (t === 'approve') return 'approver'
  if (isManager) return 'mm'
  if (me && stages.some((s, i) => i >= at.cur && onStage(s, me))) return 'upcoming'
  if (me && stages.some((s, i) => i < at.cur && onStage(s, me))) return 'finished'
  return 'none'
}

/** What one decision does to where the task stands (the database decides; this is its twin for the ▶ Preview and the
 * tests): `submit` by the doer, `approve` by one on the level now, `changes` by one on the level now. */
export function step(
  stages: readonly (FlowStage & { back?: number | null })[],
  at: FlowAt,
  by: string,
  what: 'submit' | 'approve' | 'changes',
): FlowAt {
  if (at.done) return at
  const s = stages[at.cur]
  const next = (i: number): FlowAt => (i >= stages.length ? { cur: stages.length - 1, level: -1, ok: {}, done: true } : { cur: i, level: -1, ok: {}, done: false })
  if (what === 'submit') {
    if (at.level >= 0) return at
    return s.levels.length ? { cur: at.cur, level: 0, ok: {}, done: false } : next(at.cur + 1)
  }
  const lv = s.levels[at.level]
  if (!lv || !levelWaits(lv, at.ok).includes(by)) return at
  if (what === 'changes') return { cur: backTarget(at.cur, s.back ?? null), level: -1, ok: {}, done: false }
  const ok = { ...at.ok, [by]: 'now' }
  if (!levelPassed(lv, ok)) return { ...at, ok }
  return at.level + 1 < s.levels.length ? { cur: at.cur, level: at.level + 1, ok: {}, done: false } : next(at.cur + 1)
}

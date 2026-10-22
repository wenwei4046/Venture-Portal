// Marketing's board (`mkt_board()`, mig 20261023214100): the roster, the subsidiaries, the projects with their stages
// and subtasks, HR's holidays — the raw facts My Space, the Calendar, Projects and Tracking reckon from. Parsed here so
// a field the database leaves out draws as nothing, and the pages work on plain types. Dates stay 'YYYY-MM-DD'
// strings, the office's (the database answers today in Asia/Kuala_Lumpur).

import type { MktTeam } from './shell'

export type MktProjectKind = 'product' | 'quick' | 'recurring'
export type MktProjectStatus = 'minutes' | 'waiting_pic' | 'changes' | 'approved' | 'active' | 'paused' | 'done' | 'cancelled'
export type MktStageStatus = 'planned' | 'todo' | 'accepted' | 'review' | 'changes' | 'done'
export type MktSubtaskStatus = 'working' | 'ready' | 'revising' | 'approved'
export type MktDept = 'content' | 'social' | 'design' | 'ads' | 'brand'

/** One level of a stage's approval: a person in the portal, or the subsidiary's PIC through the link. */
export type MktApprover = { kind: 'person'; staff: string } | { kind: 'pic' }

export interface MktPerson {
  id: string
  user: string | null
  full: string
  first: string
  title: string | null
  team: MktTeam | null
  role: string | null
  color: string | null
  capacity: number
}

export interface MktSub {
  id: string
  code: string
  name: string
  dot: string
  emoji: string
  client: boolean
  pic: string | null
}

/** A recurring series' rule as the database keeps it — its runs' opening days and whether it still runs. */
export interface MktRecur {
  runs: string[]
  status: 'active' | 'paused' | 'ended'
  /** The rule as the database keeps it — `ruleFromRow` (./recur) reads it. */
  rule: Record<string, unknown> | null
}

export interface MktProject {
  id: string
  trackId: string
  kind: MktProjectKind
  sub: string
  title: string
  status: MktProjectStatus
  workflow: string | null
  owner: string | null
  pic: string | null
  cur: number
  series: string | null
  run: number | null
  recur: MktRecur | null
  startsOn: string | null
  dueOn: string | null
  createdAt: string
  updatedAt: string
  doneAt: string | null
}

export interface MktStage {
  project: string
  idx: number
  name: string
  dept: MktDept
  owner: string | null
  appr: MktApprover[]
  split: boolean
  /** Working days the stage is planned to take. */
  sla: number
  startsOn: string | null
  dueOn: string | null
  status: MktStageStatus
  apprIdx: number
  ver: number
  /** Changes asked: by whom, why — and, sent back to this stage from a later one, which. */
  changes: { by: string; reason: string; from: string | null } | null
  enteredAt: string | null
  acceptedAt: string | null
  submittedAt: string | null
  doneAt: string | null
}

export interface MktSubtask {
  id: string
  project: string
  stage: number
  title: string
  assignee: string
  dueOn: string | null
  status: MktSubtaskStatus
  returns: number
}

export interface MktHoliday {
  day: string
  name: string
}

export interface MktBoard {
  today: string
  /** The viewer's People record, when their login has one. */
  me: string | null
  team: MktPerson[]
  subs: MktSub[]
  projects: MktProject[]
  stages: MktStage[]
  subtasks: MktSubtask[]
  holidays: MktHoliday[]
}

const TEAMS: readonly MktTeam[] = ['manager', 'content', 'social', 'design', 'ads', 'brand']
const DEPTS: readonly MktDept[] = ['content', 'social', 'design', 'ads', 'brand']
const KINDS: readonly MktProjectKind[] = ['product', 'quick', 'recurring']
const PSTATUS: readonly MktProjectStatus[] = ['minutes', 'waiting_pic', 'changes', 'approved', 'active', 'paused', 'done', 'cancelled']
const SSTATUS: readonly MktStageStatus[] = ['planned', 'todo', 'accepted', 'review', 'changes', 'done']
const TSTATUS: readonly MktSubtaskStatus[] = ['working', 'ready', 'revising', 'approved']
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const str = (v: unknown) => (typeof v === 'string' ? v : '')
const strOrNull = (v: unknown) => (typeof v === 'string' && v ? v : null)
const day = (v: unknown) => (typeof v === 'string' && DAY_RE.test(v.slice(0, 10)) ? v.slice(0, 10) : null)
const int = (v: unknown, fallback = 0) => {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? Math.trunc(n) : fallback
}
const list = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? v.filter(isObj) : [])
const oneOf = <T extends string>(v: unknown, all: readonly T[], fallback: T): T => (all.includes(v as T) ? (v as T) : fallback)

function approver(v: unknown): MktApprover | null {
  if (!isObj(v)) return null
  if (v.kind === 'pic') return { kind: 'pic' }
  if (v.kind === 'person' && str(v.staff)) return { kind: 'person', staff: str(v.staff) }
  return null
}

function recur(v: unknown): MktRecur | null {
  if (!isObj(v)) return null
  const runs = (Array.isArray(v.runs) ? v.runs : []).map(day).filter((d): d is string => !!d)
  return { runs, status: oneOf(v.status, ['active', 'paused', 'ended'] as const, 'active'), rule: isObj(v.rule) ? v.rule : null }
}

export const EMPTY_BOARD: MktBoard = { today: '', me: null, team: [], subs: [], projects: [], stages: [], subtasks: [], holidays: [] }

/** One person of the roster as the database answers them. */
export function personFromRow(p: Record<string, unknown>): MktPerson {
  return {
    id: str(p.id),
    user: strOrNull(p.user),
    full: str(p.full),
    first: str(p.first) || str(p.full).split(/s+/)[0] || '',
    title: strOrNull(p.title),
    team: TEAMS.includes(p.team as MktTeam) ? (p.team as MktTeam) : null,
    role: strOrNull(p.role),
    color: strOrNull(p.color),
    capacity: Math.max(1, int(p.capacity, 5)),
  }
}

export function subFromRow(s: Record<string, unknown>): MktSub {
  return {
    id: str(s.id),
    code: str(s.code),
    name: str(s.name) || str(s.code),
    dot: str(s.dot) || 'oklch(0.62 0.02 60)',
    emoji: str(s.emoji) || '🏢',
    client: s.client === true,
    pic: strOrNull(s.pic),
  }
}

export function projectFromRow(p: Record<string, unknown>): MktProject {
  return {
    id: str(p.id),
    trackId: str(p.trackId),
    kind: oneOf(p.kind, KINDS, 'quick'),
    sub: str(p.sub),
    title: str(p.title),
    status: oneOf(p.status, PSTATUS, 'active'),
    workflow: strOrNull(p.workflow),
    owner: strOrNull(p.owner),
    pic: strOrNull(p.pic),
    cur: Math.max(0, int(p.cur)),
    series: strOrNull(p.series),
    run: p.run == null ? null : int(p.run),
    recur: recur(p.recur),
    startsOn: day(p.startsOn),
    dueOn: day(p.dueOn),
    createdAt: str(p.createdAt),
    updatedAt: str(p.updatedAt),
    doneAt: strOrNull(p.doneAt),
  }
}

export function stageFromRow(s: Record<string, unknown>): MktStage {
  return {
    project: str(s.project),
    idx: Math.max(0, int(s.idx)),
    name: str(s.name),
    dept: oneOf(s.dept, DEPTS, 'social'),
    owner: strOrNull(s.owner),
    appr: (Array.isArray(s.appr) ? s.appr : []).map(approver).filter((a): a is MktApprover => !!a),
    split: s.split === true,
    sla: Math.max(1, int(s.sla, 1)),
    startsOn: day(s.startsOn),
    dueOn: day(s.dueOn),
    status: oneOf(s.status, SSTATUS, 'planned'),
    apprIdx: Math.max(0, int(s.apprIdx)),
    ver: Math.max(0, int(s.ver)),
    changes: isObj(s.changes) ? { by: str(s.changes.by), reason: str(s.changes.reason), from: strOrNull(s.changes.from) } : null,
    enteredAt: strOrNull(s.enteredAt),
    acceptedAt: strOrNull(s.acceptedAt),
    submittedAt: strOrNull(s.submittedAt),
    doneAt: strOrNull(s.doneAt),
  }
}

export function subtaskFromRow(t: Record<string, unknown>): MktSubtask {
  return {
    id: str(t.id),
    project: str(t.project),
    stage: Math.max(0, int(t.stage)),
    title: str(t.title),
    assignee: str(t.assignee),
    dueOn: day(t.dueOn),
    status: oneOf(t.status, TSTATUS, 'working'),
    returns: Math.max(0, int(t.returns)),
  }
}

export function holidaysFromRow(v: unknown): MktHoliday[] {
  return list(v)
    .filter(h => day(h.day))
    .map(h => ({ day: day(h.day) as string, name: str(h.name) }))
}

/** Any list of rows, each an object. */
export const rowsOf = list

export function boardFromRow(v: unknown): MktBoard {
  if (!isObj(v)) return EMPTY_BOARD
  return {
    today: day(v.today) ?? '',
    me: strOrNull(v.me),
    team: list(v.team).filter(p => str(p.id)).map(personFromRow),
    subs: list(v.subs).filter(s => str(s.id) && str(s.code)).map(subFromRow),
    projects: list(v.projects).filter(p => str(p.id) && str(p.trackId) && str(p.sub)).map(projectFromRow),
    stages: list(v.stages).filter(s => str(s.project)).map(stageFromRow),
    subtasks: list(v.subtasks).filter(x => str(x.id) && str(x.project) && str(x.assignee)).map(subtaskFromRow),
    holidays: holidaysFromRow(v.holidays),
  }
}

// ── Days ────────────────────────────────────────────────────────────────────

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const WD = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

/** Midday UTC of a day, so adding days never crosses a date line. */
export const dayValue = (d: string) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10), 12)
export const dayOf = (t: number) => new Date(t).toISOString().slice(0, 10)
export const addDays = (d: string, n: number) => dayOf(dayValue(d) + n * 864e5)
/** Whole days from a to b (b later: positive). */
export const daysBetween = (a: string, b: string) => Math.round((dayValue(b) - dayValue(a)) / 864e5)
/** 0 = Monday … 6 = Sunday. */
export const weekdayOf = (d: string) => (new Date(dayValue(d)).getUTCDay() + 6) % 7
export const mondayOf = (d: string) => addDays(d, -weekdayOf(d))

/** "21 Oct" */
export const shortDay = (d: string) => `${+d.slice(8, 10)} ${MON[+d.slice(5, 7) - 1]}`
/** "Tue 21 Oct" */
export const longDay = (d: string) => `${WD[weekdayOf(d)]} ${shortDay(d)}`
export const WEEKDAYS = WD
export const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
export const MONTH_SHORT = MON

// ── Lookups ─────────────────────────────────────────────────────────────────

export interface BoardIndex {
  person: (id: string | null | undefined) => MktPerson | undefined
  sub: (id: string | null | undefined) => MktSub | undefined
  stagesOf: (projectId: string) => MktStage[]
  subtasksOf: (projectId: string, stage: number) => MktSubtask[]
}

export function indexBoard(b: MktBoard): BoardIndex {
  const people = new Map(b.team.map(p => [p.id, p]))
  const subs = new Map(b.subs.map(s => [s.id, s]))
  const stages = new Map<string, MktStage[]>()
  for (const s of b.stages) stages.set(s.project, [...(stages.get(s.project) ?? []), s])
  for (const l of stages.values()) l.sort((a, c) => a.idx - c.idx)
  const subtasks = new Map<string, MktSubtask[]>()
  for (const t of b.subtasks) {
    const k = `${t.project}:${t.stage}`
    subtasks.set(k, [...(subtasks.get(k) ?? []), t])
  }
  return {
    person: id => (id ? people.get(id) : undefined),
    sub: id => (id ? subs.get(id) : undefined),
    stagesOf: id => stages.get(id) ?? [],
    subtasksOf: (id, stage) => subtasks.get(`${id}:${stage}`) ?? [],
  }
}

/** The approver a stage in review waits for now — null when it is not in review. */
export function approverNow(s: MktStage): MktApprover | null {
  return s.status === 'review' ? s.appr[s.apprIdx] ?? null : null
}

/** A recurring task's series: the rule and the stages each run copies — the runs are projects of their own. */
export function isSeries(p: Pick<MktProject, 'kind' | 'series'>): boolean {
  return p.kind === 'recurring' && !p.series
}

/** Where a project's stages run: open, not paused, past its plan — and a piece of work, not a series' pattern. */
export function runsStages(p: MktProject): boolean {
  return p.status === 'active' && !isSeries(p)
}

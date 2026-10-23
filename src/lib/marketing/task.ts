// A task's page (`New Task Page.dc.html`; mig 20261023234000's mkt_project): the project, its stages with their forms
// and work, its trail, its series — read here, and what the page draws for whoever looks at it: where it stands, what
// they may do now (Accept, Submit for approval / Complete stage, Approve / Request changes), the stage rail, each stage's
// work, the trail in the store's words (hm-store.js). Pure.

import { officeTime } from '@/lib/office-time'
import {
  approverNow, holidaysFromRow, longDay, personFromRow, projectFromRow, rowsOf, shortDay, stageFromRow, subFromRow,
  subtaskFromRow, type MktHoliday, type MktPerson, type MktProject, type MktProjectStatus, type MktStage,
  type MktStageStatus, type MktSub, type MktSubtask,
} from './board'
import { ruleFromRow, ruleText, periodText, type RecurRule } from './recur'
import { formFromRow, missingWork, TASK_TYPES, workFromRow, type FormField, type StageWork, type TaskType } from './tasks'

/** An approval level as a deliverable's template has it (②b-2a): a person, the PIC on the link, or one the manager picks
 * at assignment. */
export type PlanAppr = { kind: 'person'; staff: string } | { kind: 'pic' } | { kind: 'assign' }

export interface TaskStage extends MktStage {
  mode: 'person' | 'assign' | 'prev'
  cands: string[]
  /** The words beside its person ("+ talent"). */
  extra: string | null
  /** Its approval levels, one picked at assignment included. */
  levels: PlanAppr[]
  form: FormField[]
  back: number | null
  work: StageWork
}

export interface TaskEvent {
  id: number
  at: string
  actor: string
  action: string
  stage: number | null
  stageName: string | null
  fromTo: string | null
  reason: string | null
  version: string | null
  data: Record<string, unknown> | null
}

export type FreeType = 'text' | 'heading' | 'check' | 'divider'
export interface FreeBlock {
  id: string
  type: FreeType
  text: string
  done: boolean
  by: string
}

export interface TaskRun {
  id: string
  run: number
  trackId: string
  status: MktProjectStatus
  startsOn: string | null
  dueOn: string | null
  stage: MktStageStatus | null
}

export interface TaskSeries {
  id: string
  trackId: string
  title: string
  status: MktProjectStatus
  rule: RecurRule | null
  runs: TaskRun[]
}

/** What a deliverable is of its product (②b-2a): its category, its action, which of how many. */
export interface TaskDeliv {
  group: string
  item: string
  n: number
  of: number
}

export interface TaskProject extends MktProject {
  brief: string | null
  qType: TaskType | null
  createdBy: string | null
  free: FreeBlock[]
  /** A deliverable's product project. */
  parentProject: { id: string; trackId: string; title: string; status: MktProjectStatus } | null
  deliv: TaskDeliv | null
  /** A deliverable's template is locked: every stage the manager's to assign, no subtasks. */
  locked: boolean
}

export interface MktTaskPage {
  today: string
  me: string | null
  team: MktPerson[]
  sub: MktSub | null
  project: TaskProject
  stages: TaskStage[]
  subtasks: MktSubtask[]
  events: TaskEvent[]
  series: TaskSeries | null
  holidays: MktHoliday[]
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const str = (v: unknown) => (typeof v === 'string' ? v : '')
const strOrNull = (v: unknown) => (typeof v === 'string' && v ? v : null)
const day = (v: unknown) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null)
const FREE: readonly FreeType[] = ['text', 'heading', 'check', 'divider']

export function freeFromRow(v: unknown): FreeBlock[] {
  return rowsOf(v)
    .filter(b => str(b.id) && FREE.includes(b.type as FreeType))
    .map(b => ({ id: str(b.id), type: b.type as FreeType, text: str(b.text), done: b.done === true, by: str(b.by) }))
}

/** mkt_project's answer — null when there is no such project. */
/** One line of a trail as the readers give it (mkt_project, mkt_sub_feed, mkt_project_log). */
export function eventFromRow(e: Record<string, unknown>): TaskEvent {
  return {
    id: Number(e.id) || 0,
    at: str(e.at),
    actor: str(e.actor),
    action: str(e.action),
    stage: typeof e.stage === 'number' ? e.stage : null,
    stageName: strOrNull(e.stageName),
    fromTo: strOrNull(e.fromTo),
    reason: strOrNull(e.reason),
    version: strOrNull(e.version),
    data: isObj(e.data) ? e.data : null,
  }
}

export function taskFromRow(v: unknown): MktTaskPage | null {
  if (!isObj(v) || !isObj(v.project)) return null
  const p = v.project
  const base = projectFromRow(p)
  if (!base.id || !base.trackId) return null
  const qType = TASK_TYPES.find(t => t.key === p.qType)?.key ?? null
  const stages: TaskStage[] = rowsOf(v.stages).map(s => {
    const spec = isObj(s.spec) ? s.spec : {}
    return {
      ...stageFromRow(s),
      mode: s.mode === 'assign' || s.mode === 'prev' ? s.mode : 'person',
      cands: Array.isArray(s.cands) ? s.cands.filter((c): c is string => typeof c === 'string') : [],
      extra: typeof s.extra === 'string' && s.extra ? s.extra : null,
      levels: (Array.isArray(s.appr) ? s.appr : []).filter(isObj).flatMap((a): PlanAppr[] =>
        a.kind === 'pic' ? [{ kind: 'pic' }] : a.kind === 'assign' ? [{ kind: 'assign' }]
          : a.kind === 'person' && typeof a.staff === 'string' ? [{ kind: 'person', staff: a.staff }] : []),
      form: formFromRow(spec.form),
      back: typeof spec.back === 'number' ? spec.back : null,
      work: workFromRow(s.work),
    }
  })
  const series = isObj(v.series)
    ? {
        id: str(v.series.id),
        trackId: str(v.series.trackId),
        title: str(v.series.title),
        status: projectFromRow({ status: v.series.status }).status,
        rule: isObj(v.series.recur) ? ruleFromRow(v.series.recur.rule) : null,
        runs: rowsOf(v.series.runs).map(r => ({
          id: str(r.id),
          run: Number(r.run) || 0,
          trackId: str(r.trackId),
          status: projectFromRow({ status: r.status }).status,
          startsOn: day(r.startsOn),
          dueOn: day(r.dueOn),
          stage: typeof r.stage === 'string' ? (r.stage as MktStageStatus) : null,
        })),
      }
    : null
  return {
    today: day(v.today) ?? '',
    me: strOrNull(v.me),
    team: rowsOf(v.team).filter(x => str(x.id)).map(personFromRow),
    sub: isObj(v.sub) ? subFromRow(v.sub) : null,
    project: {
      ...base, brief: strOrNull(p.brief), qType, createdBy: strOrNull(p.createdBy), free: freeFromRow(p.free),
      parentProject: parentFromRow(p.parent), deliv: delivFromRow(p.deliv), locked: p.locked === true,
    },
    stages,
    subtasks: rowsOf(v.subtasks).map(subtaskFromRow),
    events: rowsOf(v.events).map(eventFromRow),
    series,
    holidays: holidaysFromRow(v.holidays),
  }
}

// ── What the page draws ─────────────────────────────────────────────────────

export type Tone = 'red' | 'waiting' | 'done' | 'draft'
export type TaskAction = 'accept' | 'submit' | 'complete' | 'approve' | 'changes'

export interface TaskViewer {
  /** Marketing · Edit — works the stages that are theirs. */
  edit: boolean
  approve: boolean
  manage: boolean
}

export interface RailStage {
  idx: number
  name: string
  who: string
  appr: string
  due: string
  mark: string
  state: 'done' | 'current' | 'next'
}

export interface WorkSection {
  idx: number
  name: string
  badge: string
  badgeTone: 'done' | 'plain'
  /** The viewer's own stage, open to them now. */
  editable: boolean
  form: FormField[]
  work: StageWork
  /** Has nothing to fill in: notes and links instead. */
  bare: boolean
}

export interface TaskView {
  isSeries: boolean
  tone: Tone
  status: string
  version: string
  actions: { key: TaskAction; label: string; disabled: boolean }[]
  note: string
  noteRed: boolean
  banner: { tone: Tone; text: string } | null
  meta: { k: string; v: string }[]
  rail: RailStage[]
  requirements: { source: string; text: string }
  work: WorkSection[]
  missing: string[]
  /** The stage now, when it is the viewer's to work. */
  mine: TaskStage | null
  /** Who the task waits on now (for Nudge): its stage's owner, or its approver — never the PIC. */
  waitingOn: string | null
}

export function nameOf(team: readonly MktPerson[], id: string | null | undefined): string {
  if (!id) return '—'
  const p = team.find(x => x.id === id)
  return p ? p.first || p.full : '—'
}

/** "👤 Rachel → 👤 Daniel" · "🔗 PIC" · "— no approval". */
export function approvalText(team: readonly MktPerson[], s: MktStage): string {
  if (!s.appr.length) return '— no approval'
  return s.appr.map(a => (a.kind === 'pic' ? '🔗 PIC' : `👤 ${nameOf(team, a.staff)}`)).join(' → ')
}

export function taskView(page: MktTaskPage, can: TaskViewer): TaskView {
  const { project: p, stages, team, today, me } = page
  const isSeries = p.kind === 'recurring' && !p.series
  const cur = stages[p.cur] ?? stages[stages.length - 1]
  const done = p.status === 'done'
  const notYet = !!p.startsOn && !!today && p.startsOn > today
  const open = p.status === 'active' && !isSeries && !notYet && !!cur
  const owner = cur ? nameOf(team, cur.owner) : '—'
  const appr = cur ? approverNow(cur) : null
  const approver = appr ? (appr.kind === 'pic' ? `${page.sub?.pic || 'the PIC'} (PIC)` : nameOf(team, appr.staff)) : '—'
  const amOwner = open && !!me && cur.owner === me
  const working = amOwner && (cur.status === 'accepted' || cur.status === 'changes')
  const amApprover = open && cur.status === 'review' && appr?.kind === 'person' && !!me && appr.staff === me
  const missing = working ? missingWork(cur.form, cur.work) : []

  const actions: TaskView['actions'] = []
  let note = ''
  let noteRed = false
  if (amOwner && cur.status === 'todo' && can.edit) {
    actions.push({ key: 'accept', label: 'Accept', disabled: false })
    note = 'New · just assigned to you'
  }
  if (working && can.edit) {
    actions.push(cur.appr.length ? { key: 'submit', label: 'Submit for approval', disabled: missing.length > 0 } : { key: 'complete', label: 'Complete stage', disabled: missing.length > 0 })
    note = missing.length ? `Fill in ${missing.join(', ')}` : 'Ready'
    noteRed = missing.length > 0
  }
  if (amApprover && can.approve) {
    actions.push({ key: 'changes', label: 'Request changes', disabled: false }, { key: 'approve', label: 'Approve', disabled: false })
  }
  if (!actions.length) {
    note = isSeries ? '' : done ? 'All stages done' : p.status === 'planning' ? 'Not planned yet — its people and start day come with the Assignment Plan'
      : notYet ? `Opens ${longDay(p.startsOn as string)}` : !open ? '' : cur.status === 'review' ? `Waiting for ${approver}` : `Now with ${owner}`
  }

  let tone: Tone = 'waiting'
  let status = cur ? `Stage ${cur.idx + 1} · ${cur.name}` : '—'
  if (isSeries) {
    tone = p.status === 'active' ? 'waiting' : p.status === 'paused' ? 'draft' : 'done'
    status = p.status === 'active' ? 'Active' : p.status === 'paused' ? 'Paused' : 'Ended'
  } else if (done) {
    tone = 'done'
    status = 'Done'
  } else if (p.status === 'cancelled') {
    tone = 'draft'
    status = 'Cancelled'
  } else if (p.status === 'paused') {
    tone = 'draft'
    status = 'Paused'
  } else if (p.status === 'planning') {
    tone = 'draft'
    status = 'Not planned yet'
  } else if (notYet) {
    tone = 'draft'
    status = `Opens ${longDay(p.startsOn as string)}`
  } else if (cur) {
    if (cur.status === 'todo') status = `Waiting for ${owner} to Accept`
    if (cur.status === 'accepted') status = `In progress · ${owner}`
    if (cur.status === 'review') status = `Waiting for ${approver}`
    if (cur.status === 'changes') {
      tone = 'red'
      status = 'Changes requested'
    }
    if (tone !== 'red' && cur.dueOn && today && cur.dueOn < today) tone = 'red'
  }

  let banner: TaskView['banner'] = null
  if (open && cur.status === 'changes' && cur.changes) {
    banner = { tone: 'red', text: `Changes requested by ${cur.changes.by}${cur.changes.from ? ` on ${cur.changes.from}` : ''}: "${cur.changes.reason}"` }
  } else if (amOwner && cur.status === 'todo') {
    banner = { tone: 'waiting', text: `You're up: ${cur.name}${cur.dueOn ? ` · due ${longDay(cur.dueOn)}` : ''}` }
  } else if (amApprover) {
    banner = { tone: 'waiting', text: `${owner} submitted ${cur.name} v${cur.ver} for your approval` }
  } else if (done && !isSeries) {
    banner = { tone: 'done', text: `All ${stages.length} stages done` }
  }

  const typeLabel = TASK_TYPES.find(t => t.key === p.qType)?.label
  const kindText = p.kind === 'quick' ? `⚡ Quick task${typeLabel ? ` · ${typeLabel}` : ''}`
    : p.kind === 'recurring' ? (isSeries ? `🔁 Recurring task${typeLabel ? ` · ${typeLabel}` : ''}` : `🔁 Run ${p.run ?? ''}${typeLabel ? ` · ${typeLabel}` : ''}`)
    : p.kind === 'deliverable' ? `📦 Deliverable${p.deliv && p.deliv.of > 1 ? ` · ${p.deliv.n} of ${p.deliv.of}` : ''}`
    : '📦 Project'
  const meta = [
    { k: 'Subsidiary', v: page.sub?.name ?? '—' },
    { k: 'Owner', v: p.owner ? nameOf(team, p.owner) : p.createdBy ?? '—' },
    { k: 'Now with', v: !open ? '—' : cur.status === 'review' ? approver : owner },
    { k: 'Type', v: kindText },
    { k: 'Deadline', v: p.dueOn ? `Due ${longDay(p.dueOn)}` : '—' },
  ]

  const rail: RailStage[] = stages.map(s => {
    const isDone = !isSeries && (done || s.status === 'done')
    const isCur = !isSeries && !done && s.idx === cur?.idx
    const who = s.owner ? nameOf(team, s.owner) : s.mode === 'prev' ? '🔓 picked by the stage before' : 'Picked at assignment'
    return {
      idx: s.idx,
      name: s.name,
      who,
      appr: approvalText(team, s),
      due: s.dueOn ? shortDay(s.dueOn) : `${s.sla}d`,
      mark: isDone ? '✓' : isCur ? (who.charAt(0) || '?') : String(s.idx + 1),
      state: isDone ? 'done' : isCur ? 'current' : 'next',
    }
  })

  const work: WorkSection[] = isSeries
    ? []
    : stages
        .filter(s => done || s.idx <= (cur?.idx ?? 0) || s.status === 'done')
        .map(s => {
          const fin = done || s.status === 'done'
          const isCur = !done && s.idx === cur?.idx
          return {
            idx: s.idx,
            name: s.name,
            badge: fin ? '✓ Done' : isCur && s.status === 'review' ? 'In review' : `${nameOf(team, s.owner)}${s.dueOn ? ` · due ${shortDay(s.dueOn)}` : ''}`,
            badgeTone: fin ? 'done' : 'plain',
            editable: isCur && working && can.edit,
            form: s.form,
            work: s.work,
            bare: s.form.length === 0,
          } satisfies WorkSection
        })
        .reverse()

  const from = p.owner ? nameOf(team, p.owner) : p.createdBy ?? '—'
  return {
    isSeries,
    tone,
    status,
    version: cur && cur.ver ? `${cur.name} · v${cur.ver}` : 'No version yet',
    actions,
    note,
    noteRed,
    banner,
    meta,
    rail,
    requirements: { source: `WHAT NEEDS TO BE DONE · FROM ${from.toUpperCase()}`, text: p.brief || 'No extra details.' },
    work,
    missing,
    mine: working ? cur : null,
    waitingOn: open && cur.status !== 'review' ? cur.owner : open && appr?.kind === 'person' ? appr.staff : null,
  }
}

// ── The trail, in the store's words ─────────────────────────────────────────

/** "23 Oct 09:14", on the office's clock. */
export const trailTime = (at: string) => (at ? officeTime(at).format('D MMM HH:mm') : '')

function parentFromRow(v: unknown): TaskProject['parentProject'] {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null
  const r = v as Record<string, unknown>
  const status = typeof r.status === 'string' ? (r.status as MktProjectStatus) : 'active'
  return typeof r.id === 'string' && r.id ? { id: r.id, trackId: String(r.trackId ?? ''), title: String(r.title ?? ''), status } : null
}

/** " · starts Mon 2 Nov" — a plan's start day, as the trail says it. */
const planStart = (e: TaskEvent) => (typeof e.data?.start === 'string' ? ` · starts ${longDay(e.data.start)}` : '')

export function delivFromRow(v: unknown): TaskDeliv | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null
  const r = v as Record<string, unknown>
  const n = Number(r.n), of = Number(r.of)
  return { group: String(r.group ?? ''), item: String(r.item ?? ''), n: Number.isFinite(n) ? n : 1, of: Number.isFinite(of) ? of : 1 }
}

export function eventText(e: TaskEvent, page: Pick<MktTaskPage, 'project' | 'stages'>): string {
  const n = e.stage != null ? e.stage + 1 : null
  const stage = e.stageName ?? (e.stage != null ? page.stages[e.stage]?.name ?? '' : '')
  const v = e.version ? ` ${e.version}` : ''
  switch (e.action) {
    case 'created': {
      const kind = e.data?.kind
      const rule = ruleFromRow(e.data?.rule)
      if (kind === 'recurring') return `${e.actor} created recurring task "${page.project.title}"${rule ? ` · ${ruleText(rule)} · ${periodText(rule)}` : ''}`
      const count = Number(e.data?.stages) || page.stages.length
      return `${e.actor} created quick task "${page.project.title}" · ${count} stage${count === 1 ? '' : 's'}`
    }
    case 'opened': return `Stage ${n} · ${stage} opened for ${e.fromTo ?? '—'}`
    case 'accepted': return `${e.actor} accepted Stage ${n} · ${stage}`
    case 'picked': return `${e.actor} picked ${e.fromTo ?? '—'} for ${stage}`
    case 'submitted': return `${e.actor} submitted ${stage}${v} → ${e.fromTo ?? '—'}`
    case 'completed': return `${e.actor} completed ${stage}`
    case 'approved': return `${e.actor} approved ${stage}${v}${e.fromTo ? ` → ${e.fromTo}` : ''}`
    case 'changes': {
      const to = typeof e.data?.to === 'string' ? ` · back to ${e.data.to}` : ''
      return `${e.actor} requested changes on ${stage}${v}: "${e.reason ?? ''}"${to}`
    }
    case 'nudged': return `${e.actor} nudged ${e.fromTo ?? '—'} · ${stage}`
    case 'closed': return 'All stages done · task closed'
    case 'paused': return `${e.actor} paused the series`
    case 'resumed': return `${e.actor} resumed the series`
    case 'ended': return e.data?.after === 'last run' ? 'The last run is done · the series ended' : `${e.actor} ended the series`
    case 'attached': return `${e.actor} attached "${e.reason ?? ''}" from the Library`
    case 'detached': return `${e.actor} took "${e.reason ?? ''}" off the task`
    // A deliverable's Assignment Plan (②b-2a).
    case 'planned': return `${e.actor} saved the plan${planStart(e)}`
    case 'replanned': return `${e.actor} changed the plan${planStart(e)}`
    case 'plan changed': return `${e.actor} changed the plan`
    case 'reassigned': return `${e.actor} moved ${stage}: ${e.fromTo ?? '—'}${e.reason ? ` · "${e.reason}"` : ''}`
    default: return `${e.actor} · ${e.action}`
  }
}

/** The trail newest first — the free space's writes are on it in the database, not on the page. */
export function trailLines(page: MktTaskPage): { id: number; t: string; text: string }[] {
  return page.events
    .filter(e => e.action !== 'free')
    .map(e => ({ id: e.id, t: trailTime(e.at), text: eventText(e, page) }))
    .reverse()
}

/** The series panel: its rule, its period, its runs. */
export function seriesView(page: MktTaskPage): { trackId: string; rule: string; period: string; status: string; tone: Tone; runs: { id: string; label: string; day: string; status: string; tone: Tone; current: boolean }[] } | null {
  const s = page.series
  if (!s) return null
  const status = s.status === 'active' ? 'Active' : s.status === 'paused' ? 'Paused' : 'Ended'
  return {
    trackId: s.trackId,
    rule: s.rule ? ruleText(s.rule) : '—',
    period: s.rule ? periodText(s.rule) : '',
    status,
    tone: s.status === 'active' ? 'waiting' : s.status === 'paused' ? 'draft' : 'done',
    runs: s.runs.map(r => {
      const future = !!r.startsOn && !!page.today && r.startsOn > page.today
      const [label, tone]: [string, Tone] = r.status === 'done' ? ['Done', 'done']
        : r.status === 'cancelled' ? ['Skipped', 'draft']
        : r.status === 'paused' ? ['Paused', 'draft']
        : future ? ['Scheduled', 'draft']
        : r.stage === 'changes' ? ['Changes requested', 'red']
        : r.stage === 'review' ? ['In review', 'waiting']
        : r.stage === 'todo' ? ['To accept', 'waiting']
        : ['In progress', 'waiting']
      return { id: r.id, label: `Run ${r.run}`, day: r.startsOn ? longDay(r.startsOn) : '—', status: label, tone, current: r.id === page.project.id }
    }),
  }
}

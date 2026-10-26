// Marketing's Workflow Builder (mig 20261023235500, `Workflow Builder.dc.html`): the templates grouped by their action,
// and a template's stages as the builder edits them — who does each (the manager picks at assignment, or 🔓 the stage
// before picks from a list), its approval levels (a person, the PIC through the link, a person picked at assignment),
// its working days, whether it splits into subtasks, what the PIC sees, where changes go back to, the fields it fills
// in, and its section on the canvas (lib/marketing/canvas.ts, mig 20261024001000). The lock as a version runs it, what
// the foot warns of and what publishing refuses — as the database checks it (mkt_workflow_check). Pure.

import type { MktGroup } from './board'
import { canvasFromRow, canvasPayload, DEFAULT_STAGE_SEC, fieldExtras, stageSecFromRow, type StageSec, type WfCanvas } from './canvas'
import { groupOf } from './groups'
import { formFromRow, stageKey, type FormField } from './tasks'

/** One approval level of a template's stage. */
export type WfAppr = { kind: 'person'; staff: string } | { kind: 'pic' } | { kind: 'assign' }

export interface WfStage {
  /** The stage's key on the page (not kept). */
  key: string
  name: string
  /** Its group — a People title, '' for none (2026-10-24). */
  dept: MktGroup
  /** assign: the manager picks when planning each project; prev: 🔓 the stage before picks from `cands`. */
  who: { mode: 'assign' | 'prev'; cands: string[] }
  sla: number
  appr: WfAppr[]
  /** May it split into subtasks. */
  split: boolean
  /** The earlier stage changes go back to; null = stay on this stage. */
  back: number | null
  /** What the PIC sees on the link. */
  picText: string
  form: FormField[]
  /** Its section on the canvas. */
  sec: StageSec
}

export interface WfTemplate {
  id: string
  action: string
  tname: string
  emoji: string
  note: string
  /** The product's promise, in working days. */
  promise: number | null
  locked: boolean
  /** The stages as last saved — kept as typed. */
  draft: WfStage[]
  /** The task page's layout as last saved (the Canvas template tab). */
  canvas: WfCanvas
  /** The draft's save count: a save names the one it was made on. */
  rev: number
  /** The last version published; 0 = never. */
  version: number
  /** Saved since the last version (or never published). */
  changed: boolean
  publishedAt: string | null
  publishedBy: string | null
  updatedAt: string | null
  updatedBy: string | null
  /** Projects running on it now, whatever their version. */
  live: number
}

export interface WfAction {
  action: string
  emoji: string
  templates: WfTemplate[]
}

export const WF_MAX_STAGES = 20
export const WF_MAX_SLA = 30
export const WF_MAX_APPROVALS = 3
export const WF_MAX_PROMISE = 365

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const str = (v: unknown) => (typeof v === 'string' ? v : '')
const strOrNull = (v: unknown) => (typeof v === 'string' && v ? v : null)
const int = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.trunc(v) : null)

function apprFromRow(v: unknown): WfAppr[] {
  if (!Array.isArray(v)) return []
  return v.filter(isObj).flatMap((a): WfAppr[] =>
    a.kind === 'pic' ? [{ kind: 'pic' }] : a.kind === 'assign' ? [{ kind: 'assign' }] : a.kind === 'person' && typeof a.staff === 'string' ? [{ kind: 'person', staff: a.staff }] : [])
}

/** A template's stage as the database keeps it. */
export function wfStageFromRow(v: unknown): WfStage {
  const s = isObj(v) ? v : {}
  const who = isObj(s.who) ? s.who : {}
  const dept = groupOf(str(s.dept))
  return {
    key: stageKey(),
    name: str(s.name),
    dept,
    who: { mode: who.mode === 'prev' ? 'prev' : 'assign', cands: Array.isArray(who.cands) ? who.cands.filter((c): c is string => typeof c === 'string') : [] },
    sla: Math.min(WF_MAX_SLA, Math.max(1, int(s.sla) ?? 1)),
    appr: apprFromRow(s.appr),
    split: s.split === true,
    back: int(s.back),
    picText: str(s.picText),
    form: formFromRow(s.form),
    sec: stageSecFromRow(s.sec),
  }
}

/** mkt_workflows(): the templates, by action and then as they were made. */
export function workflowsFromRow(v: unknown): WfTemplate[] {
  const list = isObj(v) && Array.isArray(v.workflows) ? v.workflows : []
  return list.filter(isObj).map(w => ({
    id: str(w.id),
    action: str(w.action),
    tname: str(w.tname),
    emoji: str(w.emoji) || '✨',
    note: str(w.note),
    promise: int(w.promise),
    locked: w.locked === true,
    draft: Array.isArray(w.draft) ? w.draft.map(wfStageFromRow) : [],
    canvas: canvasFromRow(w.canvas),
    rev: int(w.rev) ?? 1,
    version: int(w.version) ?? 0,
    changed: w.changed !== false,
    publishedAt: strOrNull(w.publishedAt),
    publishedBy: strOrNull(w.publishedBy),
    updatedAt: strOrNull(w.updatedAt),
    updatedBy: strOrNull(w.updatedBy),
    live: int(w.live) ?? 0,
  }))
}

/** The Actions column: each action with its templates, in the reader's order; an action's emoji is its first's. */
export function wfActions(wfs: readonly WfTemplate[]): WfAction[] {
  const out: WfAction[] = []
  for (const w of wfs) {
    const at = out.find(a => a.action.toLowerCase() === w.action.toLowerCase())
    if (at) at.templates.push(w)
    else out.push({ action: w.action, emoji: w.emoji, templates: [w] })
  }
  return out
}

/** The stages as a version runs them: locked, every stage is the manager's to assign — no 🔓 hand-offs, no subtasks. */
export function asRun(stages: readonly WfStage[], locked: boolean): WfStage[] {
  return locked ? stages.map(s => ({ ...s, who: { mode: 'assign', cands: [] }, split: false })) : [...stages]
}

export const totalDays = (stages: readonly WfStage[]) => stages.reduce((n, s) => n + s.sla, 0)
export const picTimes = (stages: readonly WfStage[]) => stages.reduce((n, s) => n + s.appr.filter(a => a.kind === 'pic').length, 0)

/** The foot's warnings (the handoff's): worth a look, never a stop. */
export function wfWarnings(stages: readonly WfStage[], locked: boolean, promise: number | null): string[] {
  const run = asRun(stages, locked)
  const out: string[] = []
  if (picTimes(run) >= 3) out.push('PIC approves 3+ times')
  if (!run.some(s => s.appr.length)) out.push('No approval in this workflow')
  const total = totalDays(run)
  if (promise != null && total > promise) out.push(`Longer than product promise (${total} > ${promise} days)`)
  return out
}

/** What publishing refuses, as the database does (`team`: Marketing's roster now). Empty = it may be published. */
export function wfProblems(stages: readonly WfStage[], locked: boolean, team: ReadonlySet<string>): string[] {
  const run = asRun(stages, locked)
  const out: string[] = []
  if (run.length === 0) out.push('Add a stage')
  if (run.some(s => !s.name.trim())) out.push('A stage has no name')
  if (run[0]?.who.mode === 'prev') out.push('Stage 1 has no stage before it to pick')
  if (run.some((s, i) => i > 0 && s.who.mode === 'prev' && s.who.cands.length === 0)) out.push('A 🔓 stage has no candidates')
  const gone = run.some(s => (s.who.mode === 'prev' ? s.who.cands : []).some(c => !team.has(c)) || s.appr.some(a => a.kind === 'person' && !team.has(a.staff)))
  if (gone) out.push('Somebody named has left the team')
  const fieldsOk = run.every(s => {
    const named = s.form.filter(f => f.type !== 'Note').map(f => f.label.trim())
    return s.form.every(f => f.label.trim()) && new Set(named).size === named.length
  })
  if (!fieldsOk) out.push('Each field needs its own name')
  if (run.some(s => s.form.some(f => f.type === 'Table' && (f.cols ?? []).some(c => !c.name.trim())))) out.push('A table column has no name')
  return out
}

/** "Pick at assignment" · "🔓 Previous stage picks from Siti / Aina" — who does a stage, on its card. */
export function wfWhoText(stage: WfStage, nameOf: (staff: string) => string): string {
  if (stage.who.mode !== 'prev') return 'Pick at assignment'
  return `🔓 Previous stage picks from ${stage.who.cands.map(nameOf).join(' / ') || '…'}`
}

/** "👤 Rachel → 🔗 PIC" · "— No approval". */
export function wfApprText(appr: readonly WfAppr[], nameOf: (staff: string) => string): string {
  if (!appr.length) return '— No approval'
  return appr.map(a => (a.kind === 'pic' ? '🔗 PIC' : a.kind === 'assign' ? '👤 Pick at assignment' : `👤 ${nameOf(a.staff)}`)).join(' → ')
}

/** A stage added at the end: the last one's group, picked at assignment, a day. */
export function newWfStage(after: WfStage | undefined): WfStage {
  return { key: stageKey(), name: 'New stage', dept: after?.dept ?? '', who: { mode: 'assign', cands: [] }, sla: 1, appr: [], split: false, back: null, picText: '', form: [], sec: { ...DEFAULT_STAGE_SEC } }
}

/** A new template's one stage (the handoff's): named for its action, picked at assignment, two days, the PIC approves —
 * its group picked in the builder (the handoff's Design is no group of People's). */
export function firstWfStage(action: string): WfStage {
  return { ...newWfStage(undefined), name: action.trim().slice(0, 80), dept: '', sla: 2, appr: [{ kind: 'pic' }] }
}

/** "Template 3" — a new template's name under an action, one not taken. */
export function nextTemplateName(taken: readonly string[]): string {
  const lower = new Set(taken.map(t => t.trim().toLowerCase()))
  let n = taken.length + 1
  while (lower.has(`template ${n}`)) n++
  return `Template ${n}`
}

/** The stages as mkt_workflow_save takes them. */
export function wfStagesPayload(stages: readonly WfStage[]): Record<string, unknown>[] {
  return stages.map(s => ({
    name: s.name,
    dept: s.dept,
    who: { mode: s.who.mode, cands: s.who.cands },
    sla: Math.min(WF_MAX_SLA, Math.max(1, Math.trunc(s.sla))),
    appr: s.appr.slice(0, WF_MAX_APPROVALS),
    split: s.split,
    back: s.back,
    picText: s.picText,
    form: s.form.map(f => ({ label: f.label, type: f.type, ...(f.type === 'Table' ? { cols: f.cols ?? [], rows: f.rows ?? [] } : {}), ...fieldExtras(f) })),
    sec: { emoji: s.sec.emoji, locked: s.sec.locked, req: s.sec.req, pic: s.sec.pic },
  }))
}

/** What a template's editable parts are now — compared with what was last saved, to send only what changed. */
export interface WfEdit {
  tname: string
  locked: boolean
  promise: number | null
  stages: WfStage[]
  canvas: WfCanvas
}

/** The parts of `now` not as `saved` had them, as mkt_workflow_save takes them; null when nothing changed. */
export function wfPatch(saved: WfEdit, now: WfEdit): Record<string, unknown> | null {
  const patch: Record<string, unknown> = {}
  if (now.tname !== saved.tname) patch.tname = now.tname
  if (now.locked !== saved.locked) patch.locked = now.locked
  if (now.promise !== saved.promise) patch.promise = now.promise
  const a = JSON.stringify(wfStagesPayload(saved.stages))
  const b = JSON.stringify(wfStagesPayload(now.stages))
  if (a !== b) patch.stages = wfStagesPayload(now.stages)
  const ca = JSON.stringify(canvasPayload(saved.canvas))
  const cb = JSON.stringify(canvasPayload(now.canvas))
  if (ca !== cb) patch.canvas = canvasPayload(now.canvas)
  return Object.keys(patch).length ? patch : null
}

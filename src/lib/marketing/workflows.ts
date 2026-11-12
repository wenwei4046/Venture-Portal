// Marketing's Workflow Builder 2a (2026-11-13 — `docs/design_handoff_workflow_builder/`, mig 20261113200000): the
// templates under their categories, and a template's stages as the builder edits them — each stage a stable key
// (`sid`), its group (one of Marketing's — mkt_groups), who does it (MM assigns, or 🔓 a handoff from the stage
// before to one of a shortlist), its working days, up to three approval levels of one or more people (any one of them,
// or everyone — flow.ts's ApprLevel), subtasks, where changes go back to, what the PIC reads. The fields live on the
// canvas (canvas.ts). The template-wide overdue rule and finish are flow.ts's. Then what the builder draws from them:
// the warnings (each with what its Fix opens), what publishing refuses (as mkt_workflow_check does), the publish
// review's diff against the version running now, the time bar, the end's "Done when", the lock's effects. Pure.

import { canvasFromRow, canvasPayload, canvasProblems, type WfCanvas } from './canvas'
import {
  ASSIGN_ID, finishFromRow, levelsFromRow, levelText, MAX_LEVELS, overdueFromRow, PIC_ID,
  type ApprLevel, type FinishCfg, type OverdueCfg,
} from './flow'
import { groupTone, isManagerTitle } from './groups'
import type { PickPerson } from './tasks'

export interface WfStage {
  /** The stage's key — kept for good, the canvas's fields name it. */
  sid: string
  name: string
  /** Its group's key ('' = none). */
  dept: string
  /** assign: MM picks when planning each project; prev: 🔓 the stage before hands it to one of `cands`. */
  who: { mode: 'assign' | 'prev'; cands: string[] }
  sla: number
  appr: ApprLevel[]
  split: boolean
  /** The earlier stage changes go back to; null = stay on this stage. */
  back: number | null
  picText: string
}

export interface WfGroup {
  key: string
  name: string
  /** oklch hue, 0–359. */
  hue: number
}

export interface WfCategory {
  id: string
  name: string
  emoji: string
  sort: number
}

export interface WfTemplate {
  id: string
  categoryId: string
  /** Its category's name (mkt_workflows.action). */
  category: string
  tname: string
  emoji: string
  note: string
  /** The product's promise, in working days. */
  promise: number | null
  locked: boolean
  draft: WfStage[]
  canvas: WfCanvas
  overdue: OverdueCfg
  finish: FinishCfg
  rev: number
  /** The last version published; 0 = never. */
  version: number
  changed: boolean
  /** The version running now — what the publish review compares with; null = never published. */
  published: { stages: WfStage[]; promise: number | null } | null
  publishedAt: string | null
  publishedBy: string | null
  updatedAt: string | null
  updatedBy: string | null
  /** Projects running on it now, whatever their version. */
  live: number
}

export interface WfBook {
  categories: WfCategory[]
  groups: WfGroup[]
  templates: WfTemplate[]
}

/** Somebody the builder offers (a shortlist chip, an approver): who, their People title, what is on their plate. */
export interface WfPerson {
  id: string
  first: string
  /** Their People title. */
  title: string
  /** Tasks they have open now. */
  load: number
}

export const WF_MAX_STAGES = 20
export const WF_MAX_SLA = 30
export const WF_MAX_APPROVALS = MAX_LEVELS
/** The promise stepper's range (the column allows up to 365). */
export const WF_PROMISE_MAX = 60
export const GROUP_HUES = [60, 150, 20, 110, 320, 250] as const
export const CATEGORY_ICONS = ['🖼️', '🎞️', '📣', '📈', '📘', '📦', '🎨', '📸', '🎤', '🗂️', '✨', '🧾', '📰'] as const
/** Marketing's own groups, as seeded (decision 4). */
export const DEFAULT_GROUPS: readonly WfGroup[] = [
  { key: 'content', name: 'Content', hue: 295 }, { key: 'social', name: 'Social Media', hue: 235 }, { key: 'design', name: 'Design', hue: 350 },
  { key: 'ads', name: 'Ads', hue: 270 }, { key: 'brand', name: 'Brand', hue: 195 },
]

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const str = (v: unknown) => (typeof v === 'string' ? v : '')
const strOrNull = (v: unknown) => (typeof v === 'string' && v ? v : null)
const int = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.trunc(v) : null)
let seq = 0
/** A new stage key: short letters and digits, as the database keeps them. */
export const newSid = () => `s${Date.now().toString(36)}${(seq++).toString(36)}${Math.random().toString(36).slice(2, 6)}`

/** A template's stage as the database keeps it. */
export function wfStageFromRow(v: unknown): WfStage {
  const s = isObj(v) ? v : {}
  const who = isObj(s.who) ? s.who : {}
  return {
    sid: str(s.sid) || newSid(),
    name: str(s.name),
    dept: str(s.dept),
    who: { mode: who.mode === 'prev' ? 'prev' : 'assign', cands: Array.isArray(who.cands) ? who.cands.filter((c): c is string => typeof c === 'string') : [] },
    sla: Math.min(WF_MAX_SLA, Math.max(1, int(s.sla) ?? 1)),
    appr: levelsFromRow(s.appr).slice(0, MAX_LEVELS),
    split: s.split === true,
    back: int(s.back),
    picText: str(s.picText),
  }
}

/** mkt_workflows(): the categories, the groups and the templates. */
export function workflowBookFromRow(v: unknown): WfBook {
  const o = isObj(v) ? v : {}
  const categories = (Array.isArray(o.categories) ? o.categories : []).filter(isObj).map((c, i) => ({
    id: str(c.id), name: str(c.name), emoji: str(c.emoji) || '✨', sort: int(c.sort) ?? i,
  }))
  const groups = (Array.isArray(o.groups) ? o.groups : []).filter(isObj).map(g => ({ key: str(g.key), name: str(g.name), hue: int(g.hue) ?? 60 }))
  const templates = (Array.isArray(o.workflows) ? o.workflows : []).filter(isObj).map((w): WfTemplate => {
    const category = str(w.action)
    const pub = Array.isArray(w.pubStages) ? { stages: w.pubStages.map(wfStageFromRow), promise: int(w.pubPromise) } : null
    return {
      id: str(w.id),
      categoryId: str(w.categoryId),
      category,
      tname: str(w.tname),
      emoji: str(w.emoji) || '✨',
      note: str(w.note),
      promise: int(w.promise),
      locked: w.locked === true,
      draft: Array.isArray(w.draft) ? w.draft.map(wfStageFromRow) : [],
      canvas: canvasFromRow(w.canvas),
      overdue: overdueFromRow(w.overdue),
      finish: finishFromRow(w.finish, category),
      rev: int(w.rev) ?? 1,
      version: int(w.version) ?? 0,
      changed: w.changed !== false,
      published: pub,
      publishedAt: strOrNull(w.publishedAt),
      publishedBy: strOrNull(w.publishedBy),
      updatedAt: strOrNull(w.updatedAt),
      updatedBy: strOrNull(w.updatedBy),
      live: int(w.live) ?? 0,
    }
  })
  return { categories, groups: groups.length ? groups : [...DEFAULT_GROUPS], templates }
}

/** The picker's list: each category with its templates, in the reader's order. */
export function wfCategories(book: Pick<WfBook, 'categories' | 'templates'>): (WfCategory & { templates: WfTemplate[] })[] {
  return book.categories.map(c => ({ ...c, templates: book.templates.filter(t => t.categoryId === c.id) }))
}

/** The stages as a version runs them: locked, every stage is MM's to assign — no 🔓 handoffs, no subtasks. */
export function asRun(stages: readonly WfStage[], locked: boolean): WfStage[] {
  return locked ? stages.map(s => ({ ...s, who: { mode: 'assign', cands: s.who.cands }, split: false })) : [...stages]
}

export const totalDays = (stages: readonly WfStage[]) => stages.reduce((n, s) => n + s.sla, 0)
export const picTimes = (stages: readonly WfStage[]) => stages.reduce((n, s) => n + s.appr.filter(l => l.ids.includes(PIC_ID)).length, 0)

// ── Names ────────────────────────────────────────────────────────────────────────

/** "MM" · "AMM" · "Director" · the title — how an approver's role reads beside their name. */
export function roleOf(title: string): string {
  const t = title.toUpperCase()
  if (t.includes('ASSISTANT MARKETING MANAGER')) return 'AMM'
  if (t.includes('MARKETING MANAGER')) return 'MM'
  if (t.includes('DIRECTOR')) return 'Director'
  return title
}

/** Who may approve a stage (decision 7): Marketing's managers (MM / AMM) and a Director, on the roster. */
export const mayApprove = (title: string) => isManagerTitle(title) || /DIRECTOR/i.test(title)

/** The builder's people from New Project's picker list (lib/marketing/tasks.ts › builderPeople): their load is the
 * number its hint ends with ("… · 2 active"). */
export function wfPeople(people: readonly PickPerson[]): WfPerson[] {
  return people.map(p => ({ id: p.id, first: p.first, title: p.group, load: Number(/(\d+) active$/.exec(p.hint)?.[1] ?? 0) }))
}

/** A level's person as a card or the diff names them: 'pic' → PIC, 'assign' → Assigned (the prototype's). */
export const idLabel = (id: string, nameOf: (id: string) => string) => (id === PIC_ID ? 'PIC' : id === ASSIGN_ID ? 'Assigned' : nameOf(id))
/** …as the Approval dropdown and its chips name them. */
export const idLong = (id: string, nameOf: (id: string) => string) => (id === PIC_ID ? 'PIC via link' : id === ASSIGN_ID ? 'Picked at assignment' : nameOf(id))
/** …as the Approval section's one-line summary names them. */
export const idShort = (id: string, nameOf: (id: string) => string) => (id === PIC_ID ? '🔗 PIC' : id === ASSIGN_ID ? '👤 Picked at assignment' : nameOf(id))

/** "Rachel & Daniel → PIC" — a stage's approval as its card says it; "—" without one. */
export const apprText = (appr: readonly ApprLevel[], nameOf: (id: string) => string) =>
  appr.length ? appr.map(l => levelText(l, id => idLabel(id, nameOf))).join(' → ') : '—'

/** The Approval section's summary: "Rachel & Daniel → 🔗 PIC" (any one: " / "); "No approval". */
export const apprSummary = (appr: readonly ApprLevel[], nameOf: (id: string) => string) =>
  appr.length ? appr.map(l => l.ids.map(id => idShort(id, nameOf)).join(l.rule === 'all' ? ' & ' : ' / ') || '—').join(' → ') : 'No approval'

/** The Who section's summary. */
export function whoSummary(stage: WfStage, at: number, locked: boolean, nameOf: (id: string) => string): string {
  if (locked || stage.who.mode !== 'prev') return '👤 MM assigns when planning'
  return stage.who.cands.length ? `🔓 Stage ${at}'s person picks · ${stage.who.cands.map(nameOf).join(' / ')}` : '🔓 Handoff · shortlist empty'
}

// ── Warnings, problems ───────────────────────────────────────────────────────────

/** Where a warning's Fix goes: a stage's Who or Approval section; none for the promise (its stepper is beside it). */
export type WfFix = { section: 'who' | 'appr'; at: number } | null
export interface WfWarning {
  key: string
  text: string
  fix: WfFix
}

/** The handoff's four warnings — worth a look, never a stop — on the stages as they run. */
export function wfWarnings(stages: readonly WfStage[], locked: boolean, promise: number | null): WfWarning[] {
  const run = asRun(stages, locked)
  const out: WfWarning[] = []
  run.forEach((s, i) => {
    if (s.who.mode === 'prev' && !s.who.cands.length) out.push({ key: `short-${s.sid}`, text: `Stage ${i + 1} · 🔓 handoff has no shortlist`, fix: { section: 'who', at: i } })
  })
  const total = totalDays(run)
  if (promise != null && total > promise) out.push({ key: 'promise', text: `Longer than product promise (${total} > ${promise} days)`, fix: null })
  if (picTimes(run) >= 3) {
    const last = run.map((s, i) => (s.appr.some(l => l.ids.includes(PIC_ID)) ? i : -1)).filter(i => i >= 0).pop() ?? 0
    out.push({ key: 'pic3', text: 'PIC approves 3+ times', fix: { section: 'appr', at: last } })
  }
  if (run.length && !run.some(s => s.appr.length)) out.push({ key: 'noappr', text: 'No approval in this workflow', fix: { section: 'appr', at: run.length - 1 } })
  return out
}

/** What publishing refuses, as the database does (`team`: Marketing's roster now; `approvers`: who of it may
 * approve). Empty = it may be published. */
export function wfProblems(stages: readonly WfStage[], locked: boolean, team: ReadonlySet<string>, approvers: ReadonlySet<string>, canvas: WfCanvas): string[] {
  const run = asRun(stages, locked)
  const out: string[] = []
  if (run.length === 0) out.push('Add a stage')
  if (run.some(s => !s.name.trim())) out.push('A stage has no name')
  if (run[0]?.who.mode === 'prev') out.push('Stage 1 has no stage before it to hand it over')
  if (run.some((s, i) => i > 0 && s.who.mode === 'prev' && s.who.cands.length === 0)) out.push('A 🔓 handoff has nobody on its shortlist')
  if (run.some(s => s.who.mode === 'prev' && s.who.cands.some(c => !team.has(c)))) out.push('Somebody on a shortlist has left the team')
  if (run.some(s => s.appr.some(l => !l.ids.length))) out.push('Choose who approves each level')
  const persons = run.flatMap(s => s.appr.flatMap(l => l.ids.filter(id => id !== PIC_ID && id !== ASSIGN_ID)))
  if (persons.some(id => !approvers.has(id))) out.push('An approver is not a Marketing manager or a Director on the team')
  out.push(...canvasProblems(stages, canvas))
  return out
}

/** The lock's grey note: what MM assigning every stage turns off (their settings come back when unlocked). */
export function lockNote(stages: readonly WfStage[]): string {
  const n = stages.filter(s => s.who.mode === 'prev' || s.split).length
  return `MM assigns every stage when planning.${n ? ` Handoffs and subtasks are off on ${n} stage${n === 1 ? '' : 's'} — their settings come back if you switch to “Handoffs allowed”.` : ''}`
}

// ── The time bar, the end ────────────────────────────────────────────────────────

export interface TimeBar {
  /** Each stage's share of the bar, in %. */
  segments: { sid: string; w: number; title: string }[]
  /** Where the dashed promise line stands, in %; null without a promise. */
  promiseLeft: number | null
  over: boolean
  /** Each stage's first working day (0-based), for "day a–b". */
  starts: number[]
}

/** The 10px bar: width = sla ÷ (max(total, promise) + 1), as the prototype's. */
export function timeBar(stages: readonly WfStage[], promise: number | null): TimeBar {
  const total = totalDays(stages)
  const maxD = Math.max(total, promise ?? 0) + 1
  const pct = (d: number) => (d / maxD) * 100
  const starts: number[] = []
  let acc = 0
  for (const s of stages) {
    starts.push(acc)
    acc += s.sla
  }
  return {
    segments: stages.map((s, i) => ({ sid: s.sid, w: pct(s.sla), title: `${i + 1}. ${s.name || 'Untitled stage'} · ${s.sla}d` })),
    promiseLeft: promise == null ? null : pct(promise),
    over: promise != null && total > promise,
    starts,
  }
}

/** "Stage 6 · Final is approved by Rachel → PIC" — when the task is done, read off the last stage. */
export function endWhen(stages: readonly WfStage[], nameOf: (id: string) => string): string {
  const last = stages[stages.length - 1]
  if (!last) return 'Add a stage first'
  const n = stages.length
  return last.appr.length ? `Stage ${n} · ${last.name || 'Untitled stage'} is approved by ${apprText(last.appr, nameOf)}` : `Stage ${n} · ${last.name || 'Untitled stage'} is submitted (no approval)`
}

/** "✓ Approved → Stage 3 · Edit" / "→ task done". */
export function onApprove(stages: readonly WfStage[], at: number): string {
  const verb = stages[at]?.appr.length ? 'Approved' : 'Submitted'
  const next = stages[at + 1]
  return next ? `${verb} → Stage ${at + 2} · ${next.name || 'Untitled stage'}` : `${verb} → task done`
}

// ── The publish review ───────────────────────────────────────────────────────────

export interface WfChange {
  icon: string
  text: string
  tone: 'add' | 'remove' | 'ink'
}

/** What changed since the version running now (the prototype's `pubVals`): stages added, removed, renamed; their
 * days, who, approval, group and PIC text; the order; the promise. Compared by stage key, as the version will run. */
export function publishDiff(
  base: { stages: readonly WfStage[]; promise: number | null } | null,
  now: { stages: readonly WfStage[]; promise: number | null },
  nameOf: (id: string) => string,
  groupName: (key: string) => string,
): WfChange[] {
  const before = base?.stages ?? []
  const bMap = new Map(before.map(s => [s.sid, s]))
  const cMap = new Map(now.stages.map(s => [s.sid, s]))
  const whoT = (x: WfStage) => (x.who.mode === 'prev' ? `handoff (${x.who.cands.map(nameOf).join(' / ') || 'no shortlist'})` : 'MM assigns')
  const apprT = (x: WfStage) => (x.appr.length ? apprText(x.appr, nameOf) : 'no approval')
  const out: WfChange[] = []
  const add = (icon: string, text: string, tone: WfChange['tone'] = 'ink') => out.push({ icon, text, tone })
  now.stages.forEach((x, i) => {
    const b = bMap.get(x.sid)
    const name = x.name || 'Untitled stage'
    if (!b) return add('+', `Added stage ${i + 1} · ${name}`, 'add')
    if (b.name !== x.name) add('✎', `Renamed “${b.name}” → “${x.name}”`)
    if (b.sla !== x.sla) add('⏱', `${name}: ${b.sla} → ${x.sla} working days`)
    if (whoT(b) !== whoT(x)) add('👤', `${name}: ${whoT(b)} → ${whoT(x)}`)
    if (apprT(b) !== apprT(x)) add('✓', `${name} approval: ${apprT(b)} → ${apprT(x)}`)
    if (b.dept !== x.dept) add('●', `${name}: group ${groupName(b.dept)} → ${groupName(x.dept)}`)
    if (b.picText !== x.picText) add('🔗', `${name}: PIC now sees “${x.picText || '—'}”`)
  })
  before.forEach(b => { if (!cMap.has(b.sid)) add('−', `Removed ${b.name || 'Untitled stage'}`, 'remove') })
  const kept = before.filter(b => cMap.has(b.sid)).map(b => b.sid).join()
  const order = now.stages.filter(x => bMap.has(x.sid)).map(x => x.sid).join()
  if (kept !== order) add('⇅', 'Stage order changed')
  if (base && base.promise !== now.promise) add('📅', `Promise ${base.promise ?? '—'} → ${now.promise ?? '—'} working days`)
  return out
}

/** "12 active tasks stay on v2 and finish as they are. Every task started after you publish uses v3." */
export function publishImpact(version: number, live: number): string {
  const next = version + 1
  if (!version) return `No tasks use this template yet. New tasks will use v${next}.`
  return `${live} active task${live === 1 ? '' : 's'} stay on v${version} and finish as they are. Every task started after you publish uses v${next}.`
}

/** "12 active tasks stay on v2" · "Never published". */
export const activeNote = (version: number, live: number) => (version ? `${live} active task${live === 1 ? '' : 's'} stay on v${version}` : 'Never published')

// ── New stages and templates ─────────────────────────────────────────────────────

/** A stage added beside another (the prototype's): "New stage", that stage's group, MM assigns, a day, no approval. */
export function newWfStage(beside?: Pick<WfStage, 'dept'>): WfStage {
  return { sid: newSid(), name: 'New stage', dept: beside?.dept ?? 'design', who: { mode: 'assign', cands: [] }, sla: 1, appr: [], split: false, back: null, picText: '' }
}

/** The stages after one was added, moved, copied or taken out: where changes go back to follows the stage it named (by
 * key), and forgets one gone or no longer before it. */
export function remapBack(prev: readonly WfStage[], next: readonly WfStage[]): WfStage[] {
  return next.map((s, i) => {
    if (s.back == null) return s
    // `back` counts in the old order (a copy carries its original's).
    const sid = prev[s.back]?.sid
    const at = sid ? next.findIndex(x => x.sid === sid) : -1
    const back = at >= 0 && at < i ? at : null
    return back === s.back ? s : { ...s, back }
  })
}

/** A stage moved from one place to another. */
export function moveWfStage(stages: readonly WfStage[], from: number, to: number): WfStage[] {
  if (from === to || from < 0 || from >= stages.length) return [...stages]
  const arr = [...stages]
  const [x] = arr.splice(from, 1)
  arr.splice(Math.max(0, Math.min(to, arr.length)), 0, x)
  return remapBack(stages, arr)
}

/** A stage put in at a place. */
export function insertWfStage(stages: readonly WfStage[], at: number, s: WfStage): WfStage[] {
  const arr = [...stages]
  arr.splice(Math.max(0, Math.min(at, arr.length)), 0, s)
  return remapBack(stages, arr)
}

/** A stage taken out. */
export const removeWfStage = (stages: readonly WfStage[], at: number): WfStage[] => remapBack(stages, stages.filter((_, i) => i !== at))

/** A celebration GIF's place in the bucket `marketing`: workflow/<uuid>/<the name, tidied>. */
export const gifPath = (fileName: string, uuid: string) => {
  const m = /^(.*?)(\.[a-z0-9]{1,6})?$/i.exec(fileName.trim())
  const stem = (m?.[1] ?? '').normalize('NFKD').replace(/[^\w.-]+/g, '-').replace(/-{2,}/g, '-').replace(/^[-.]+|[-.]+$/g, '').slice(0, 100)
  return `workflow/${uuid}/${stem || 'file'}${(m?.[2] ?? '').toLowerCase()}`
}

/** A copy of a stage: a key of its own, "… copy". */
export const duplicateStage = (s: WfStage): WfStage => ({ ...s, sid: newSid(), name: `${s.name} copy`.slice(0, 80), who: { ...s.who, cands: [...s.who.cands] }, appr: s.appr.map(l => ({ ...l, ids: [...l.ids] })) })

/** A new template's one stage (the prototype's + Template): named for its category, Design, MM assigns, two days, the
 * PIC approves. */
export function firstWfStage(category: string): WfStage {
  return { ...newWfStage(undefined), name: category.trim().slice(0, 80) || 'Stage 1', sla: 2, appr: [{ ids: [PIC_ID], rule: 'any' }] }
}

/** "Template 3" — a new template's name in a category, one not taken. */
export function nextTemplateName(taken: readonly string[]): string {
  const lower = new Set(taken.map(t => t.trim().toLowerCase()))
  let n = taken.length + 1
  while (lower.has(`template ${n}`)) n++
  return `Template ${n}`
}

/** The next icon in the Change icon cycle. */
export const nextIcon = (cur: string) => CATEGORY_ICONS[(CATEGORY_ICONS.indexOf(cur as (typeof CATEGORY_ICONS)[number]) + 1) % CATEGORY_ICONS.length]

/** The hue a new group gets: the next of [60, 150, 20, 110, 320, 250] (as mkt_group_add). */
export const nextHue = (groups: readonly WfGroup[]) => GROUP_HUES[Math.max(0, groups.length - 5) % GROUP_HUES.length]

/** A group's name; "—" for none. */
export const groupNameOf = (groups: readonly WfGroup[], key: string) => groups.find(g => g.key === key)?.name ?? (key ? key : '—')

// ── Saving ───────────────────────────────────────────────────────────────────────

/** The stages as mkt_workflow_save takes them. */
export function wfStagesPayload(stages: readonly WfStage[]): Record<string, unknown>[] {
  return stages.map(s => ({
    sid: s.sid,
    name: s.name,
    dept: s.dept,
    who: { mode: s.who.mode, cands: s.who.cands },
    sla: Math.min(WF_MAX_SLA, Math.max(1, Math.trunc(s.sla))),
    appr: s.appr.slice(0, WF_MAX_APPROVALS).map(l => ({ ids: l.ids, rule: l.rule })),
    split: s.split,
    back: s.back,
    picText: s.picText,
  }))
}

/** What a template's editable parts are now — compared with what was last saved, to send only what changed. */
export interface WfEdit {
  tname: string
  locked: boolean
  promise: number | null
  stages: WfStage[]
  canvas: WfCanvas
  overdue: OverdueCfg
  finish: FinishCfg
}

export const editOf = (t: WfTemplate): WfEdit => ({ tname: t.tname, locked: t.locked, promise: t.promise, stages: t.draft, canvas: t.canvas, overdue: t.overdue, finish: t.finish })

/** The parts of `now` not as `saved` had them, as mkt_workflow_save takes them; null when nothing changed. */
export function wfPatch(saved: WfEdit, now: WfEdit): Record<string, unknown> | null {
  const patch: Record<string, unknown> = {}
  if (now.tname !== saved.tname) patch.tname = now.tname
  if (now.locked !== saved.locked) patch.locked = now.locked
  if (now.promise !== saved.promise) patch.promise = now.promise
  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
  if (!same(wfStagesPayload(saved.stages), wfStagesPayload(now.stages))) patch.stages = wfStagesPayload(now.stages)
  if (!same(canvasPayload(saved.canvas), canvasPayload(now.canvas))) patch.canvas = canvasPayload(now.canvas)
  if (!same(saved.overdue, now.overdue)) patch.overdue = now.overdue
  if (!same(saved.finish, now.finish)) patch.finish = now.finish
  return Object.keys(patch).length ? patch : null
}

/** Whom the canvas's staff view is drawn for at a stage: the first of the roster whose title reads as its group. */
export const personForGroup = (people: readonly WfPerson[], dept: string) => people.find(p => groupTone(p.title) === dept)?.first ?? null

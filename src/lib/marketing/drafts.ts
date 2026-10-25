import { trailTime } from './task'
import { ruleFromRow, type RecurRule } from './recur'
import { formFromRow, stageKey, stagesPayload, TASK_TYPES, type DraftStage, type TaskType } from './tasks'

// New Project kept as a draft while it is typed (mig 20261025211000 — 2026-10-25, the user: "New Project 一有输入就会自动进
// draft（草稿）那边，这样的话内容就不会丢了"): the form as a login typed it, one draft for each form it started (a login
// shared on two PCs keeps each its own), listed on New Project to go on with or to discard, dropped once the project is
// made from it. A draft is the form, not a project: no Track ID, on nobody's board, never checked until Create.

export type NewMode = 'product' | 'task' | 'recurring'
export const NEW_MODES: readonly NewMode[] = ['product', 'task', 'recurring']

/** New Project's form — what a draft keeps and puts back. */
export interface NewForm {
  sub: string
  mode: NewMode
  product: string
  /** Each product's amount as typed (②b-2b — a quote); a product not here offers its list price. */
  amounts: Record<string, number | null>
  title: string
  type: TaskType
  brief: string
  rule: RecurRule
  stages: DraftStage[]
  /** The project it is opened from (④-4c), none for none. */
  source: { id: string; trackId: string; title: string } | null
}

/** A draft on the list — what it is, for whom, when it was last kept; never its form. */
export interface DraftRow {
  id: string
  rev: number
  mode: NewMode | null
  title: string
  sub: string | null
  product: string | null
  updatedAt: string
}

/** One draft opened (?draft=), with its form as kept. */
export interface OpenDraft {
  id: string
  rev: number
  data: unknown
  /** When it was last kept. */
  at: string
}

/** The most a login keeps (the database refuses a thirty-first). */
export const MAX_DRAFTS = 30

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const str = (v: unknown) => (typeof v === 'string' ? v : '')

/** mkt_new_drafts(): the caller's drafts, newest first — anything else left out. */
export function draftsFromRow(v: unknown): DraftRow[] {
  if (!Array.isArray(v)) return []
  return v.filter(isObj).flatMap(r => {
    const id = str(r.id)
    if (!id) return []
    return [{
      id,
      rev: Number.isInteger(r.rev) ? (r.rev as number) : 1,
      mode: NEW_MODES.find(m => m === r.mode) ?? null,
      title: str(r.title).trim(),
      sub: str(r.sub) || null,
      product: str(r.product) || null,
      updatedAt: str(r.updatedAt),
    }]
  })
}

/** mkt_new_draft(id): one draft with its form — null when it is not the caller's, or not there. */
export function openDraftFromRow(v: unknown): OpenDraft | null {
  if (!isObj(v) || !str(v.id)) return null
  return { id: str(v.id), rev: Number.isInteger(v.rev) ? (v.rev as number) : 1, data: v.data, at: str(v.updatedAt) }
}

/** The form as a draft keeps it. */
export function draftOf(form: NewForm): Record<string, unknown> {
  return { v: 1, ...form }
}

/** A draft's stages put back — a stage needs its name and its days; a field not one it can hold is left out. */
function stagesOf(v: unknown): DraftStage[] | null {
  if (!Array.isArray(v)) return null
  const out = v.filter(isObj).map((s): DraftStage => ({
    key: stageKey(),
    name: str(s.name).slice(0, 80),
    dept: str(s.dept).slice(0, 80),
    who: str(s.who) || null,
    sla: Math.min(30, Math.max(1, Math.trunc(Number(s.sla)) || 1)),
    appr: Array.isArray(s.appr) ? s.appr.filter((x): x is string => typeof x === 'string').slice(0, 3) : [],
    form: formFromRow(s.form),
    back: Number.isInteger(s.back) && (s.back as number) >= 0 ? (s.back as number) : null,
  }))
  // Where changes go back to is always an earlier stage.
  return out.map((s, i) => (s.back != null && s.back >= i ? { ...s, back: null } : s))
}

/** A draft's form put back over the blank one — whatever it does not hold, or holds in a shape it cannot take, stays
 * as the blank form has it. */
export function formFromDraft(data: unknown, blank: NewForm): NewForm {
  if (!isObj(data)) return blank
  const amounts: Record<string, number | null> = {}
  if (isObj(data.amounts)) for (const [k, x] of Object.entries(data.amounts)) {
    if (x === null || (typeof x === 'number' && Number.isFinite(x) && x > 0)) amounts[k] = x
  }
  const src = isObj(data.source) && str(data.source.id) && str(data.source.trackId)
    ? { id: str(data.source.id), trackId: str(data.source.trackId), title: str(data.source.title) }
    : data.source === null ? null : blank.source
  return {
    sub: str(data.sub) || blank.sub,
    mode: NEW_MODES.find(m => m === data.mode) ?? blank.mode,
    product: str(data.product) || blank.product,
    amounts,
    title: str(data.title).slice(0, 140),
    type: TASK_TYPES.find(t => t.key === data.type)?.key ?? blank.type,
    brief: str(data.brief).slice(0, 4000),
    rule: ruleFromRow(data.rule) ?? blank.rule,
    stages: stagesOf(data.stages) ?? blank.stages,
    source: src,
  }
}

/** Whether there is anything typed to keep — a title, what needs to be done, the stages or the repeat changed, an amount
 * typed. Picking a subsidiary or what is being started is no draft of its own; once one is kept, every change is. */
export function worthKeeping(form: NewForm, blank: NewForm): boolean {
  if (form.title.trim() || form.brief.trim()) return true
  if (Object.keys(form.amounts).length > 0) return true
  if (form.mode === 'recurring' && JSON.stringify(form.rule) !== JSON.stringify(blank.rule)) return true
  return JSON.stringify(stagesPayload(form.stages)) !== JSON.stringify(stagesPayload(blank.stages))
}

const MODE_ICON: Record<NewMode, string> = { product: '📦', task: '⚡', recurring: '🔁' }
const MODE_WORDS: Record<NewMode, string> = { product: 'Product project', task: 'Quick task', recurring: 'Recurring task' }

/** A draft's line on the list: its kind's icon, its name — its title, else its product's, else the kind's — and for whom,
 * when it was last kept. */
export function draftLine(d: DraftRow, subs: readonly { id: string; name: string }[], products: readonly { id: string; name: string }[] | null): { icon: string; name: string; meta: string } {
  const product = d.mode === 'product' && d.product ? products?.find(p => p.id === d.product)?.name ?? '' : ''
  const name = d.title || product || (d.mode ? `Untitled ${MODE_WORDS[d.mode].toLowerCase()}` : 'Untitled')
  const sub = d.sub ? subs.find(s => s.id === d.sub)?.name ?? '' : ''
  return { icon: d.mode ? MODE_ICON[d.mode] : '📝', name, meta: [sub, d.updatedAt ? `saved ${trailTime(d.updatedAt)}` : ''].filter(Boolean).join(' · ') }
}

/** A draft as the list shows it once it is no longer the one open — made from the form as it stands. */
export function rowOf(id: string, rev: number, form: NewForm, at: string): DraftRow {
  return { id, rev, mode: form.mode, title: form.title.trim().slice(0, 140), sub: form.sub || null, product: form.product || null, updatedAt: at }
}

/** The address of New Project with the draft open — the rest of its query kept, so the page is the same page. */
export function draftHref(search: string, id: string | null): string {
  const q = new URLSearchParams(search)
  if (id) q.set('draft', id)
  else q.delete('draft')
  const s = q.toString()
  return `/marketing/new${s ? `?${s}` : ''}`
}

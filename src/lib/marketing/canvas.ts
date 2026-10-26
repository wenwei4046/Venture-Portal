// A workflow template's canvas (mig 20261024001000, the handoff's `Canvas Template Editor.dc.html`): how the task page of
// a project started from it is laid out — 📋 Requirements first (from the intake minutes, read-only), then a section per
// stage holding the fields that stage fills in, then the manager's own sections, then the Free space. Each section is
// 🔒 locked (colleagues can't delete it) or not, ⭐ required before its stage submits or not, 👁 shown to the PIC or not;
// each field is required or not, shown to the PIC or not, a date 📅 on the calendar (which kind of date — a Post day, a
// Shoot day … since 2026-10-24 — and whether the PIC's calendar shows it), a choice with its options. A stage's own fields are named and typed on the stage
// (the Workflow stages tab); the canvas sets how they behave. The manager's own fields each say which stage fills them
// in. Kept with the template's draft and published with its versions, as mkt_canvas_check does. Pure.

import { calKind, calOf, type CalKind, type FieldCal, type FieldType, type FormField } from './tasks'

/** A stage's section on the canvas — its title is the stage's name. */
export interface StageSec {
  emoji: string
  locked: boolean
  req: boolean
  pic: boolean
}
export const DEFAULT_STAGE_SEC: StageSec = { emoji: '🎯', locked: false, req: true, pic: true }

/** The kinds of answer a field of the manager's own sections takes (the handoff's seven). */
export const CANVAS_TYPES = ['Text', 'Select', 'Multi-select', 'Date', 'Person', 'File', 'Checkbox'] as const
export type CanvasType = (typeof CANVAS_TYPES)[number]

export interface CanvasField extends FormField {
  /** The field's key on the page (not kept). */
  key: string
  type: CanvasType
  /** The stage that fills it in (its index); null until picked. */
  stage: number | null
}

/** One of the manager's own sections, after the stages'. */
export interface CanvasSection {
  key: string
  emoji: string
  title: string
  /** The stage it belongs to; null = any. */
  stage: number | null
  locked: boolean
  req: boolean
  pic: boolean
  fields: CanvasField[]
}

export interface WfCanvas {
  /** 📋 Requirements: always first, locked, read-only — only whether the PIC sees it is set. */
  req: { pic: boolean }
  sections: CanvasSection[]
}

export const EMPTY_CANVAS: WfCanvas = { req: { pic: true }, sections: [] }
export const CANVAS_MAX_SECTIONS = 12
export const CANVAS_MAX_FIELDS = 20
export const MAX_OPTIONS = 30

/** The icons a section may take (the handoff's). */
export const SECTION_ICONS = ['🎬', '🎞️', '📸', '🗂️', '🎯', '🧡', '🚚', '🎁', '⭐', '📍', '🛋️', '✨'] as const

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const int = (v: unknown) => (typeof v === 'number' && Number.isInteger(v) ? v : null)
let seq = 0
const key = () => `c${Date.now().toString(36)}${(seq++).toString(36)}`

/** Is a field required before its stage submits (a note never is)? Is it shown to the PIC? */
export const fieldReq = (f: Pick<FormField, 'type' | 'req'>) => f.type !== 'Note' && f.req !== false
export const fieldPic = (f: Pick<FormField, 'pic'>) => f.pic !== false
export const isChoice = (t: FieldType) => t === 'Select' || t === 'Multi-select'

/** A stage's section as the database keeps it. */
export function stageSecFromRow(v: unknown): StageSec {
  if (!isObj(v)) return { ...DEFAULT_STAGE_SEC }
  return {
    emoji: typeof v.emoji === 'string' && v.emoji ? v.emoji : DEFAULT_STAGE_SEC.emoji,
    locked: v.locked === true,
    req: v.req !== false,
    pic: v.pic !== false,
  }
}

/** A field's calendar mark as the database keeps it: a kind it knows (2026-10-24 — the user's answer 16), else none. */
export const calFromRow = (v: unknown): FieldCal | null => calOf(v)

function canvasFieldFromRow(v: unknown): CanvasField | null {
  if (!isObj(v)) return null
  const type = CANVAS_TYPES.find(t => t === v.type)
  if (!type) return null
  return {
    key: key(),
    label: typeof v.label === 'string' ? v.label : '',
    type,
    stage: int(v.stage),
    req: v.req === true,
    pic: v.pic === true,
    ...(type === 'Date' && isObj(v.cal) ? { cal: calFromRow(v.cal) } : {}),
    ...(isChoice(type) ? { opts: Array.isArray(v.opts) ? v.opts.filter((o): o is string => typeof o === 'string') : [] } : {}),
    ...(isChoice(type) && typeof v.list === 'string' && v.list ? { list: v.list } : {}),
  }
}

/** The canvas as the database keeps it (mkt_workflows().canvas). */
export function canvasFromRow(v: unknown): WfCanvas {
  const c = isObj(v) ? v : {}
  const req = isObj(c.req) ? c.req : {}
  const sections = Array.isArray(c.sections) ? c.sections.filter(isObj) : []
  return {
    req: { pic: req.pic !== false },
    sections: sections.map(s => ({
      key: key(),
      emoji: typeof s.emoji === 'string' && s.emoji ? s.emoji : '📝',
      title: typeof s.title === 'string' ? s.title : '',
      stage: int(s.stage),
      locked: s.locked === true,
      req: s.req === true,
      pic: s.pic === true,
      fields: (Array.isArray(s.fields) ? s.fields : []).map(canvasFieldFromRow).filter((f): f is CanvasField => !!f),
    })),
  }
}

/** A field's settings as the database takes them — explicit, as mkt_workflow_check / mkt_canvas_check answer them. */
export function fieldExtras(f: FormField): Record<string, unknown> {
  return {
    req: fieldReq(f),
    pic: fieldPic(f),
    ...(f.type === 'Date' && f.cal ? { cal: { kind: f.cal.kind, pic: f.cal.pic } } : {}),
    ...(isChoice(f.type) ? { opts: f.opts ?? [] } : {}),
    // A shared list by its name (③d-2); none sent — its own options.
    ...(isChoice(f.type) && f.list ? { list: f.list } : {}),
  }
}

/** The canvas as mkt_workflow_save takes it. */
export function canvasPayload(c: WfCanvas): Record<string, unknown> {
  return {
    req: { pic: c.req.pic },
    sections: c.sections.map(s => ({
      emoji: s.emoji,
      title: s.title,
      stage: s.stage,
      locked: s.locked,
      req: s.req,
      pic: s.pic,
      fields: s.fields.map(f => ({ label: f.label, type: f.type, stage: f.stage, ...fieldExtras(f) })),
    })),
  }
}

/**
 * Where each stage went when the stages changed (moved, one taken out), by their keys: the old index → the new one,
 * or null when that stage is gone.
 */
export function stageMap(before: readonly { key: string }[], after: readonly { key: string }[]): (old: number | null) => number | null {
  return old => {
    if (old == null || !before[old]) return null
    const at = after.findIndex(s => s.key === before[old].key)
    return at >= 0 ? at : null
  }
}

/** The canvas with its stages followed (a section or a field of a stage taken out belongs to none until picked again). */
export function canvasRemap(c: WfCanvas, map: (old: number | null) => number | null): WfCanvas {
  return {
    ...c,
    sections: c.sections.map(s => ({ ...s, stage: map(s.stage), fields: s.fields.map(f => ({ ...f, stage: map(f.stage) })) })),
  }
}

/** A section added by the manager (the handoff's): *New section*, 📝, a Notes field filled in at the last stage. */
export function newCanvasSection(stages: number): CanvasSection {
  return { key: key(), emoji: '📝', title: 'New section', stage: null, locked: false, req: false, pic: false, fields: [newCanvasField(stages > 0 ? stages - 1 : null, 'Notes')] }
}

/** A field added to one of the manager's sections: Text, filled in at the section's stage (or the last). */
export function newCanvasField(stage: number | null, label = 'New field'): CanvasField {
  return { key: key(), label, type: 'Text', stage, req: false, pic: false }
}

/** A field with a new kind of answer: options for a choice, a calendar mark only on a date. */
export function withType<T extends FormField>(f: T, type: FieldType): T {
  const next: T = { ...f, type }
  if (!isChoice(type)) {
    delete next.opts
    delete next.list
  } else if (!next.opts) next.opts = []
  if (type !== 'Date') delete next.cal
  if (type === 'Note') next.req = false
  return next
}

/** "⭐ 👁 📅" — a field's marks on the canvas (👁 or 🔒 for the PIC, unless the canvas has no PIC). */
export function fieldFlags(f: FormField, showPic = true): string {
  return [fieldReq(f) && '⭐', showPic && (fieldPic(f) ? '👁' : '🔒'), f.type === 'Date' && f.cal && '📅'].filter(Boolean).join(' ')
}

/** A stage's field and the stage it belongs to, or one of the manager's — every field the canvas holds, in order. */
interface Placed {
  field: FormField
  stage: number | null
}
function everyField(stages: readonly { form: FormField[] }[], c: WfCanvas): Placed[] {
  return [
    ...stages.flatMap((s, i) => s.form.map(field => ({ field, stage: i }))),
    ...c.sections.flatMap(s => s.fields.map(field => ({ field, stage: field.stage }))),
  ]
}

/** What publishing refuses of the canvas, as mkt_canvas_check / mkt_workflow_check do. Empty = it may be published. */
export function canvasProblems(stages: readonly { form: FormField[] }[], c: WfCanvas): string[] {
  const out: string[] = []
  if (c.sections.some(s => !s.title.trim())) out.push('A section has no name')
  const named = c.sections.every(s => {
    const labels = s.fields.map(f => f.label.trim())
    return labels.every(Boolean) && new Set(labels).size === labels.length
  })
  if (!named) out.push('Each field in a section needs its own name')
  if (c.sections.some(s => s.fields.some(f => f.stage == null || f.stage >= stages.length))) out.push('A field has no stage to fill it in')
  const fields = everyField(stages, c).map(p => p.field)
  // A choice naming a shared list (③d-2) has the list's options.
  if (fields.some(f => isChoice(f.type) && !f.list && !(f.opts ?? []).some(o => o.trim()))) out.push('A choice has no options')
  const twice = fields.some(f => {
    const o = (f.opts ?? []).map(x => x.trim().toLowerCase()).filter(Boolean)
    return new Set(o).size !== o.length
  })
  if (twice) out.push('An option is there twice')
  return out
}

// ── The preview ──────────────────────────────────────────────────────────────────

export interface PreviewSection {
  key: string
  emoji: string
  title: string
  badges: string[]
  /** A table's columns (one chip each), or none. */
  cols: string[] | null
  /** The fields shown (by name). */
  fields: string[]
  /** It belongs to the stage being looked at (or is read by all). */
  mine: boolean
}

type StageLike = { name: string; form: FormField[]; sec?: StageSec }

const secBadges = (locked: boolean, req: boolean, stageName: string | null, pic: boolean, showPic: boolean) =>
  [locked && '🔒', req && '⭐', stageName && `🎯 ${stageName}`, showPic && pic && '👁'].filter((b): b is string => !!b)

/** The task page as one of the staff sees it at a stage: every section, the ones not theirs to fill in faded. */
export function staffView(stages: readonly StageLike[], c: WfCanvas, at: number, showPic = true): PreviewSection[] {
  const tableCols = (form: FormField[]) => {
    const t = form.find(f => f.type === 'Table')
    return t ? (t.cols ?? []).map(x => x.name) : null
  }
  return [
    { key: 'req', emoji: '📋', title: 'Requirements', badges: secBadges(true, false, null, c.req.pic, showPic), cols: null, fields: [], mine: true },
    ...stages.map((s, i) => {
      const sec = s.sec ?? DEFAULT_STAGE_SEC
      return { key: `s${i}`, emoji: sec.emoji, title: s.name || `Stage ${i + 1}`, badges: secBadges(sec.locked, sec.req, s.name || `Stage ${i + 1}`, sec.pic, showPic),
        cols: tableCols(s.form), fields: s.form.map(f => f.label), mine: i === at }
    }),
    ...c.sections.map(s => ({
      key: s.key, emoji: s.emoji, title: s.title || 'New section',
      badges: secBadges(s.locked, s.req, s.stage != null ? stages[s.stage]?.name ?? null : null, s.pic, showPic),
      cols: null, fields: s.fields.map(f => f.label), mine: s.fields.some(f => f.stage === at),
    })),
  ]
}

export interface PicPreview {
  sections: { key: string; title: string; cols: string[] | null; fields: string[] }[]
  calendar: { label: string; kind: CalKind; from: string }[]
  /** "Hidden: Internal notes, 2 internal fields." — what the link leaves out. */
  hidden: string
}

/** The task page as the PIC sees it on the link: only the 👁 sections and fields, and the dates on their calendar. */
export function picView(stages: readonly StageLike[], c: WfCanvas): PicPreview {
  const sections: PicPreview['sections'] = []
  const hiddenSecs: string[] = []
  let hiddenFields = 0
  const take = (k: string, title: string, pic: boolean, form: FormField[]) => {
    if (!pic) {
      hiddenSecs.push(title)
      return
    }
    const shown = form.filter(fieldPic)
    hiddenFields += form.length - shown.length
    const table = shown.find(f => f.type === 'Table')
    sections.push({ key: k, title, cols: table ? (table.cols ?? []).map(x => x.name) : null, fields: shown.filter(f => f.type !== 'Table').map(f => f.label) })
  }
  if (c.req.pic) sections.push({ key: 'req', title: 'Requirements', cols: null, fields: [] })
  else hiddenSecs.push('Requirements')
  stages.forEach((s, i) => take(`s${i}`, s.name || `Stage ${i + 1}`, (s.sec ?? DEFAULT_STAGE_SEC).pic, s.form))
  c.sections.forEach(s => take(s.key, s.title || 'New section', s.pic, s.fields))
  const calendar = everyField(stages, c)
    .filter(p => p.field.type === 'Date' && p.field.cal && p.field.cal.pic)
    .map(p => ({ label: calKind(p.field.cal!.kind).label, kind: p.field.cal!.kind, from: p.field.label }))
  const parts = [...hiddenSecs, ...(hiddenFields ? [`${hiddenFields} internal field${hiddenFields === 1 ? '' : 's'}`] : [])]
  return { sections, calendar, hidden: parts.length ? `Hidden: ${parts.join(', ')}.` : '' }
}


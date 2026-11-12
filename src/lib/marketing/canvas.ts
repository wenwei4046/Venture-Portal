// A workflow template's canvas (Workflow Builder 2a — 2026-11-13, `docs/design_handoff_workflow_builder/` › Canvas
// template, mig 20261113200000): the task page of a project started from it, laid out — 📋 Requirements first (from the
// intake minutes, read-only), then its sections, then the Free space. The canvas is now the ONLY place fields are
// defined: every field and every table column names the stage that fills it in by the stage's key (`sid`), so a
// stage renamed or moved keeps its fields; a stage taken out leaves them belonging to none until picked again
// (publishing refuses that — `canvasProblems` = mkt_canvas_check). Each section, field and column is ⭐ required before
// its stage submits or not, 👁 shown to the PIC or not. Pure.

import { calKind, calOf, COL_TYPES, FIELD_TYPES, type CalKind, type ColType, type FieldCal, type FieldType } from './tasks'

export { COL_TYPES, FIELD_TYPES }
export type { ColType, FieldType }

/** A table's column — filled in at its own stage. */
export interface CanvasCol {
  id: string
  name: string
  type: ColType
  stage: string | null
  req: boolean
  pic: boolean
}

export interface CanvasField {
  id: string
  label: string
  type: FieldType
  /** The stage that fills it in (its sid); null until picked. */
  stage: string | null
  req: boolean
  pic: boolean
  cal?: FieldCal | null
  opts?: string[]
  list?: string
  cols?: CanvasCol[]
  rows?: string[][]
}

export interface CanvasSection {
  id: string
  emoji: string
  title: string
  /** The stage it belongs to (a sid); null = any. */
  stage: string | null
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

/** A stage as the canvas needs it: its key and its name. */
export interface StageRef {
  sid: string
  name: string
}

export const EMPTY_CANVAS: WfCanvas = { req: { pic: true }, sections: [] }
export const CANVAS_MAX_SECTIONS = 40
export const CANVAS_MAX_FIELDS = 20
export const TABLE_MAX_COLS = 12
export const MAX_OPTIONS = 30

/** The icons a section may take (the handoff's). */
export const SECTION_ICONS = ['🎬', '🎞️', '📸', '🗂️', '🎯', '🧡', '🚚', '🎁', '⭐', '📍', '🛋️', '✨'] as const

/** Each kind's glyph (the prototype's). */
export const TYPE_GLYPH: Record<FieldType, string> = {
  Text: 'Aa', Number: '#', Select: '◉', 'Multi-select': '☰', Date: '▦', Person: '◎', File: '⎘', Checkbox: '☑', Table: '▤', Note: '✎',
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const str = (v: unknown) => (typeof v === 'string' ? v : '')
let seq = 0
/** A new id: short letters and digits, as the database keeps them. */
export const canvasId = (p: 'c' | 'f' | 'k' | 'x') => `${p}${Date.now().toString(36)}${(seq++).toString(36)}${Math.random().toString(36).slice(2, 6)}`

export const isChoice = (t: FieldType) => t === 'Select' || t === 'Multi-select'
const sidOf = (v: unknown) => (typeof v === 'string' && v ? v : null)

function colFromRow(v: unknown): CanvasCol | null {
  if (!isObj(v)) return null
  const type = COL_TYPES.find(t => t === v.type)
  if (!type) return null
  return { id: str(v.id) || canvasId('k'), name: str(v.name), type, stage: sidOf(v.stage), req: v.req === true, pic: v.pic === true }
}

function fieldFromRow(v: unknown): CanvasField | null {
  if (!isObj(v)) return null
  const type = FIELD_TYPES.find(t => t === v.type)
  if (!type) return null
  const f: CanvasField = { id: str(v.id) || canvasId('f'), label: str(v.label), type, stage: sidOf(v.stage), req: type !== 'Note' && v.req === true, pic: v.pic === true }
  if (type === 'Date' && isObj(v.cal)) f.cal = calOf(v.cal)
  if (isChoice(type)) {
    f.opts = Array.isArray(v.opts) ? v.opts.filter((o): o is string => typeof o === 'string') : []
    if (typeof v.list === 'string' && v.list) f.list = v.list
  }
  if (type === 'Table') {
    f.cols = (Array.isArray(v.cols) ? v.cols : []).map(colFromRow).filter((c): c is CanvasCol => !!c)
    f.rows = Array.isArray(v.rows) ? v.rows.filter(Array.isArray).map(r => (r as unknown[]).map(c => (typeof c === 'string' ? c : ''))) : []
  }
  return f
}

/** The canvas as the database keeps it (mkt_workflows().canvas). */
export function canvasFromRow(v: unknown): WfCanvas {
  const c = isObj(v) ? v : {}
  const req = isObj(c.req) ? c.req : {}
  const sections = Array.isArray(c.sections) ? c.sections.filter(isObj) : []
  return {
    req: { pic: req.pic !== false },
    sections: sections.map(s => ({
      id: str(s.id) || canvasId('c'),
      emoji: str(s.emoji) || '📝',
      title: str(s.title),
      stage: sidOf(s.stage),
      locked: s.locked === true,
      req: s.req === true,
      pic: s.pic === true,
      fields: (Array.isArray(s.fields) ? s.fields : []).map(fieldFromRow).filter((f): f is CanvasField => !!f),
    })),
  }
}

/** A field as mkt_workflow_save takes it. */
function fieldPayload(f: CanvasField): Record<string, unknown> {
  return {
    id: f.id, label: f.label, type: f.type, stage: f.stage, req: f.type !== 'Note' && f.req, pic: f.pic,
    ...(f.type === 'Date' && f.cal ? { cal: { kind: f.cal.kind, pic: f.cal.pic } } : {}),
    ...(isChoice(f.type) ? { opts: f.opts ?? [] } : {}),
    ...(isChoice(f.type) && f.list ? { list: f.list } : {}),
    ...(f.type === 'Table' ? {
      cols: (f.cols ?? []).map(c => ({ id: c.id, name: c.name, type: c.type, stage: c.stage, req: c.req, pic: c.pic })),
      rows: (f.rows ?? []).map(r => (f.cols ?? []).map((_, i) => r[i] ?? '')),
    } : {}),
  }
}

/** The canvas as mkt_workflow_save takes it. */
export function canvasPayload(c: WfCanvas): Record<string, unknown> {
  return {
    req: { pic: c.req.pic },
    sections: c.sections.map(s => ({
      id: s.id, emoji: s.emoji, title: s.title, stage: s.stage, locked: s.locked, req: s.req, pic: s.pic,
      fields: s.fields.map(fieldPayload),
    })),
  }
}

/** A stage's own section, as a new stage gets one (🎯, titled by it, required, shown to the PIC). */
export const stageSection = (st: StageRef): CanvasSection =>
  ({ id: canvasId('x'), emoji: '🎯', title: st.name.slice(0, 60), stage: st.sid, locked: false, req: true, pic: true, fields: [] })

/** Every stage with a section of its own: a stage with none gets one, after the last section of the stage before it. */
export function ensureStageSections(c: WfCanvas, stages: readonly StageRef[]): WfCanvas {
  const missing = stages.filter(st => !c.sections.some(s => s.stage === st.sid))
  if (!missing.length) return c
  const sections = [...c.sections]
  for (const st of missing) {
    const at = stages.findIndex(x => x.sid === st.sid)
    const before = new Set(stages.slice(0, at).map(x => x.sid))
    let pos = 0
    sections.forEach((s, i) => { if (s.stage && before.has(s.stage)) pos = i + 1 })
    sections.splice(pos, 0, stageSection(st))
  }
  return { ...c, sections }
}

/** The canvas once stages went: a section, field or column of a stage no longer there belongs to none. */
export function canvasForStages(c: WfCanvas, stages: readonly StageRef[]): WfCanvas {
  const has = new Set(stages.map(s => s.sid))
  const keep = (sid: string | null) => (sid && has.has(sid) ? sid : null)
  let changed = false
  const sections = c.sections.map(s => {
    const fields = s.fields.map(f => {
      const cols = f.cols?.map(col => (keep(col.stage) === col.stage ? col : { ...col, stage: null }))
      const same = keep(f.stage) === f.stage && (!cols || cols.every((x, i) => x === f.cols![i]))
      if (same) return f
      changed = true
      return { ...f, stage: keep(f.stage), ...(cols ? { cols } : {}) }
    })
    if (keep(s.stage) !== s.stage) changed = true
    return { ...s, stage: keep(s.stage), fields }
  })
  return changed ? { ...c, sections } : c
}

/** A stage renamed: the sections titled by it follow its name. */
export function renameStageSection(c: WfCanvas, sid: string, was: string, now: string): WfCanvas {
  if (!c.sections.some(s => s.stage === sid && s.title === was.slice(0, 60))) return c
  return { ...c, sections: c.sections.map(s => (s.stage === sid && s.title === was.slice(0, 60) ? { ...s, title: now.slice(0, 60) } : s)) }
}

/** A stage duplicated: its own sections copied for the copy, every field and column of the stage moved to it. */
export function duplicateStageSections(c: WfCanvas, from: string, to: string, name: string): WfCanvas {
  const at = c.sections.map((s, i) => (s.stage === from ? i : -1)).filter(i => i >= 0)
  if (!at.length) return c
  const copies = at.map(i => {
    const s = c.sections[i]
    return {
      ...s, id: canvasId('x'), stage: to, title: s.title === c.sections[at[0]].title ? name.slice(0, 60) : s.title,
      fields: s.fields.filter(f => f.stage === from).map(f => ({
        ...f, id: canvasId('f'), stage: to,
        ...(f.cols ? { cols: f.cols.map(col => ({ ...col, id: canvasId('k'), stage: col.stage === from ? to : col.stage })) } : {}),
        ...(f.rows ? { rows: f.rows.map(r => [...r]) } : {}),
      })),
    }
  })
  const sections = [...c.sections]
  sections.splice(at[at.length - 1] + 1, 0, ...copies)
  return { ...c, sections }
}

/** A section added by the manager (the handoff's): *New section*, 📝, a Notes field filled in at the last stage. */
export function newCanvasSection(lastSid: string | null): CanvasSection {
  return { id: canvasId('c'), emoji: '📝', title: 'New section', stage: null, locked: false, req: false, pic: false, fields: [newCanvasField(lastSid, 'Notes')] }
}

/** A field added: Text, filled in at the given stage. */
export function newCanvasField(stage: string | null, label = 'New field'): CanvasField {
  return { id: canvasId('f'), label, type: 'Text', stage, req: false, pic: false }
}

/** A column added: Text, filled in at the given stage. */
export function newCanvasCol(stage: string | null, name = 'New column'): CanvasCol {
  return { id: canvasId('k'), name, type: 'Text', stage, req: false, pic: false }
}

/** A field with a new kind of answer: options for a choice, a calendar mark only on a date, columns only on a table. */
export function withType(f: CanvasField, type: FieldType, stage: string | null = f.stage): CanvasField {
  const next: CanvasField = { ...f, type }
  if (!isChoice(type)) {
    delete next.opts
    delete next.list
  } else if (!next.opts) next.opts = []
  if (type !== 'Date') delete next.cal
  if (type === 'Note') next.req = false
  if (type === 'Table') {
    if (!next.cols?.length) next.cols = [newCanvasCol(stage, 'Column 1')]
    if (!next.rows) next.rows = []
  } else {
    delete next.cols
    delete next.rows
  }
  return next
}

/** "⭐ 👁 📅" — a field's or a column's marks (🔒 when the PIC does not see it). */
export function fieldFlags(f: { req: boolean; pic: boolean; type: string; cal?: FieldCal | null }, showPic = true): string {
  return [f.req && f.type !== 'Note' && '⭐', showPic && (f.pic ? '👁' : '🔒'), f.type === 'Date' && f.cal && '📅'].filter(Boolean).join(' ')
}

/** A stage's name by its key; "—" for none, "Removed stage" for a key the template no longer has. */
export function stageNameOf(stages: readonly StageRef[], sid: string | null): string {
  if (!sid) return '—'
  return stages.find(s => s.sid === sid)?.name || (stages.some(s => s.sid === sid) ? 'Untitled stage' : 'Removed stage')
}

/** What publishing refuses of the canvas, as mkt_canvas_check does. Empty = it may be published. */
export function canvasProblems(stages: readonly StageRef[], c: WfCanvas): string[] {
  const has = new Set(stages.map(s => s.sid))
  const out: string[] = []
  if (c.sections.some(s => !s.title.trim())) out.push('A section has no name')
  const named = c.sections.every(s => {
    const labels = s.fields.filter(f => f.type !== 'Note').map(f => f.label.trim())
    return s.fields.every(f => f.label.trim()) && new Set(labels).size === labels.length
  })
  if (!named) out.push('Each field in a section needs its own name')
  const fields = c.sections.flatMap(s => s.fields)
  if (fields.some(f => !f.stage || !has.has(f.stage))) out.push('A field has no stage to fill it in')
  const cols = fields.flatMap(f => (f.type === 'Table' ? f.cols ?? [] : []))
  if (fields.some(f => f.type === 'Table' && !(f.cols ?? []).length)) out.push('A table has no columns')
  if (cols.some(col => !col.name.trim())) out.push('A table column has no name')
  if (cols.some(col => !col.stage || !has.has(col.stage))) out.push('A table column has no stage to fill it in')
  // A choice naming a shared list (③d-2) has the list's options.
  if (fields.some(f => isChoice(f.type) && !f.list && !(f.opts ?? []).some(o => o.trim()))) out.push('A choice has no options')
  const twice = fields.some(f => {
    const o = (f.opts ?? []).map(x => x.trim().toLowerCase()).filter(Boolean)
    return new Set(o).size !== o.length
  })
  if (twice) out.push('An option is there twice')
  return out
}

/** How many fields and columns a stage fills in. */
export const stageFillCount = (c: WfCanvas, sid: string) =>
  c.sections.reduce((n, s) => n + s.fields.reduce((m, f) => m + (f.stage === sid ? 1 : 0) + (f.cols ?? []).filter(col => col.stage === sid && f.stage !== sid).length, 0), 0)

// ── The preview ──────────────────────────────────────────────────────────────────

export interface PreviewCol {
  name: string
  /** Filled in at the stage being looked at. */
  mine: boolean
}

export interface PreviewSection {
  id: string
  emoji: string
  title: string
  badges: string[]
  /** A table's columns, or none. */
  cols: PreviewCol[] | null
  /** Shown at full strength: the stage being looked at fills something in it (or it is read by all). */
  mine: boolean
  kind: 'req' | 'fields' | 'table'
}

const shortName = (n: string) => n.replace(/ \(.*\)/, '')

/** The task page as one of the staff sees it at a stage: every section, the ones not theirs to fill in faded. */
export function staffView(stages: readonly StageRef[], c: WfCanvas, at: string | null, showPic = true): PreviewSection[] {
  const out: PreviewSection[] = [{ id: 'req', emoji: '📋', title: 'Requirements', badges: ['🔒', ...(showPic && c.req.pic ? ['👁'] : [])], cols: null, mine: true, kind: 'req' }]
  for (const s of c.sections) {
    const table = s.fields.find(f => f.type === 'Table')
    out.push({
      id: s.id, emoji: s.emoji, title: s.title || 'New section',
      badges: [s.locked && '🔒', s.req && '⭐', s.stage && `🎯 ${stageNameOf(stages, s.stage)}`, showPic && s.pic && '👁'].filter((b): b is string => !!b),
      cols: table ? (table.cols ?? []).map(col => ({ name: shortName(col.name), mine: !!at && col.stage === at })) : null,
      mine: !!at && (s.stage === at || s.fields.some(f => f.stage === at || (f.cols ?? []).some(col => col.stage === at))),
      kind: table ? 'table' : 'fields',
    })
  }
  return out
}

export interface PicPreview {
  sections: { id: string; title: string; cols: string[] | null; kind: 'req' | 'fields' | 'table' }[]
  calendar: { label: string; kind: CalKind; from: string }[]
  /** "Hidden: Internal notes, 2 internal columns." — what the link leaves out. */
  hidden: string
}

/** The task page as the PIC sees it on the link: only the 👁 sections, fields and columns, and the dates on their calendar. */
export function picView(c: WfCanvas): PicPreview {
  const sections: PicPreview['sections'] = []
  const hiddenSecs: string[] = []
  let hiddenCols = 0
  if (c.req.pic) sections.push({ id: 'req', title: 'Requirements', cols: null, kind: 'req' })
  else hiddenSecs.push('Requirements')
  for (const s of c.sections) {
    const title = s.title || 'New section'
    if (!s.pic) {
      hiddenSecs.push(title)
      continue
    }
    const table = s.fields.find(f => f.type === 'Table' && f.pic)
    const allCols = s.fields.flatMap(f => (f.type === 'Table' ? f.cols ?? [] : []))
    hiddenCols += allCols.filter(col => !col.pic).length
    sections.push({ id: s.id, title, cols: table ? (table.cols ?? []).filter(col => col.pic).map(col => shortName(col.name)) : null, kind: table ? 'table' : 'fields' })
  }
  const calendar = c.sections.flatMap(s => s.fields)
    .filter(f => f.type === 'Date' && f.cal && f.cal.pic)
    .map(f => ({ label: calKind(f.cal!.kind).label, kind: f.cal!.kind, from: f.label }))
  return { sections, calendar, hidden: `Hidden: ${hiddenSecs.length ? `${hiddenSecs.join(', ')}, ` : ''}${hiddenCols} internal column${hiddenCols === 1 ? '' : 's'}.` }
}

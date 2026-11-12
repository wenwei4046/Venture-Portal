// Marketing's Minutes Builder (mig 20261023235800; v2 mig 20261112180000, `docs/design_handoff_minutes_builder_v2/`): the
// minutes templates — each one's fields (which are required, which the PIC sees on the link, a hint for the staff, a
// table's columns and starting rows, the project and the attendees every minutes keep, locked) and its completion rules —
// what the foot sums up and warns of, what publishing refuses (as mkt_minutes_check does), what changed since the version
// published, and only what changed, for the save; the templates' folders. Pure.

export const MINUTES_TYPES = ['Short text', 'Long text', 'Date', 'Number', 'People', 'Project link', 'Free space', 'Table', 'Signature', 'Campaign period', 'Title'] as const
export type MinutesType = (typeof MINUTES_TYPES)[number]
/** The kinds as the builder offers them (the handoff's TYPES): its glyph and what it is for. Title (2026-11-12, the user:
 * "在 field 加一个 Title, 放到这个位置") heads the minutes — in the preview where the project's placeholder title stood. */
export const TYPE_CARDS: readonly { type: MinutesType; glyph: string; desc: string }[] = [
  { type: 'Title', glyph: 'T', desc: 'Heads the minutes · once per template' },
  { type: 'Short text', glyph: 'Aa', desc: 'One-line answer' },
  { type: 'Long text', glyph: '¶', desc: 'Notes, objectives, decisions' },
  { type: 'Date', glyph: '▦', desc: 'A single day' },
  { type: 'Campaign period', glyph: '↔', desc: 'From and to dates · once per template' },
  { type: 'Number', glyph: '#', desc: 'Budget, targets, counts' },
  { type: 'People', glyph: '◎', desc: 'Pick from the attendees' },
  { type: 'Project link', glyph: '↗', desc: 'Pulls in the project · once per template' },
  { type: 'Free space', glyph: '⊞', desc: 'Open grid shaped in the meeting' },
  { type: 'Table', glyph: '▤', desc: 'Fixed, typed columns' },
  { type: 'Signature', glyph: '✍', desc: 'Each attendee signs · once per template' },
]
export const TYPE_GLYPH = Object.fromEntries(TYPE_CARDS.map(c => [c.type, c.glyph])) as Record<MinutesType, string>
/** The kinds a template keeps once: the project it is for, a campaign's run period (answer 13), the signatures, its title. */
export const ONCE_TYPES: readonly MinutesType[] = ['Project link', 'Campaign period', 'Signature', 'Title']
export const MINUTES_COL_TYPES = ['Text', 'Number', 'Date', 'Person'] as const
export type MinutesColType = (typeof MINUTES_COL_TYPES)[number]
export const COL_GLYPH: Record<MinutesColType, string> = { Text: 'Aa', Number: '#', Date: '▦', Person: '◎' }
export const MAX_COLS = 8
export const MAX_ROWS = 50
export const MAX_HELP = 120

export interface MinutesCol { name: string; type: MinutesColType }

export interface MinutesField {
  /** The field's id — kept with the template (v2), so a field is the same field in the draft and every version. */
  key: string
  name: string
  type: MinutesType
  /** Blocks Complete while empty. */
  req: boolean
  /** The PIC sees it on the link. */
  pic: boolean
  /** The project and the attendees: never removed, renamed or retyped, always required. */
  lock: boolean
  /** A hint for the staff, shown under its label in the minutes (≤ 120). */
  help?: string
  /** A table's columns. */
  cols?: MinutesCol[]
  /** A table's starting rows, a cell per column. */
  rows?: string[][]
  /** A table: the staff may add rows (default yes) / columns (default no). */
  staffRows?: boolean
  staffCols?: boolean
}

export type RuleKey = 'sign' | 'pic' | 'picAll' | 'project' | 'file' | 'lock'
export type MinutesRules = Record<RuleKey, boolean>
/** `under`: shown beneath that rule, only while it is on (2026-10-24 — both PICs sign off, the user's answer 29). `group`:
 * the Completion rules tab's card (v2): Before Complete · Linking · After Complete. */
export const RULES: readonly { key: RuleKey; name: string; hint: string; group: 0 | 1 | 2; under?: RuleKey }[] = [
  { key: 'sign', group: 0, name: 'Every attendee signs', hint: 'Complete stays locked until all attendees sign' },
  { key: 'pic', group: 0, name: 'PIC signs off on the link', hint: 'The PIC approves the minutes before the tracking link is created' },
  { key: 'picAll', group: 0, name: 'Both PICs sign off', hint: 'With two PICs on a project, the minutes wait for both', under: 'pic' },
  { key: 'project', group: 1, name: 'Must link a project', hint: 'Pulls the subsidiary, product and dates from the project' },
  { key: 'file', group: 2, name: 'File to Library on complete', hint: 'Saved in the subsidiary’s Library → Minutes folder' },
  { key: 'lock', group: 2, name: 'Lock after complete', hint: 'No edits once signed off · changes need a new version' },
]
export const RULE_GROUPS = ['Before Complete', 'Linking', 'After Complete'] as const

export interface MinutesEdit {
  name: string
  fields: MinutesField[]
  rules: MinutesRules
}

export interface MinutesTemplate {
  id: string
  name: string
  fields: MinutesField[]
  rules: MinutesRules
  rev: number
  version: number
  changed: boolean
  /** Its folder in the rail, or none. */
  folder: string | null
  sort: number
  /** The version last published, as it was — null when never published. */
  published: MinutesEdit | null
  /** The products that take it as their intake (never a retired one). */
  usedBy: string[]
  /** Minutes not completed yet — all versions / the version published now. */
  open: number
  openOnLive: number
  publishedAt: string | null
  publishedBy: string | null
  updatedAt: string | null
  updatedBy: string | null
}

export interface MinutesFolder { id: string; name: string; parent: string | null; sort: number }

export const MAX_MINUTES_FIELDS = 40

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const str = (v: unknown) => (typeof v === 'string' ? v : '')
const strOrNull = (v: unknown) => (typeof v === 'string' && v ? v : null)
const int = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.trunc(v) : null)
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x)) as T

let seq = 0
/** A new field's id: letters and digits, as mkt_minutes_check takes them (≤ 24). */
export const fieldKey = () => `f${Date.now().toString(36)}${(seq++).toString(36)}`.slice(0, 24)
const KEY_RE = /^[A-Za-z0-9_-]{1,24}$/

/** A column's kind: as set, else Date for a name that says so ("Due date", "Deadline", "Day"), else Text. */
export const colTypeOf = (type: string | undefined, name: string): MinutesColType =>
  MINUTES_COL_TYPES.find(t => t === type) ?? (/date|due|deadline|day/i.test(name) ? 'Date' : 'Text')

/** A table's starting rows, each a cell per column — two blank rows when it has none saved (the handoff's `rowsOf`). */
export function startRows(f: Pick<MinutesField, 'cols' | 'rows'>): string[][] {
  const cols = f.cols ?? []
  return (f.rows ?? [[], []]).map(r => cols.map((_, k) => r[k] ?? ''))
}

export function minutesFieldFromRow(v: unknown): MinutesField | null {
  if (!isObj(v)) return null
  const type = MINUTES_TYPES.find(t => t === v.type)
  if (!type) return null
  const key = typeof v.id === 'string' && KEY_RE.test(v.id) ? v.id : fieldKey()
  const help = str(v.help).trim()
  const f: MinutesField = { key, name: str(v.name), type, req: v.req === true, pic: v.pic === true, lock: v.lock === true, ...(help ? { help } : {}) }
  if (type === 'Table') {
    f.cols = Array.isArray(v.cols) ? v.cols.filter(isObj).map(c => ({ name: str(c.name), type: colTypeOf(str(c.type), str(c.name)) })) : []
    if (Array.isArray(v.rows)) f.rows = startRows({ cols: f.cols, rows: v.rows.filter(Array.isArray).map(r => r.map(str)) })
    f.staffRows = v.staffRows !== false
    f.staffCols = v.staffCols === true
  }
  return f
}

export function rulesFromRow(v: unknown): MinutesRules {
  const r = isObj(v) ? v : {}
  return { sign: r.sign === true, pic: r.pic === true, picAll: r.pic === true && r.picAll === true, project: r.project === true, file: r.file === true, lock: r.lock === true }
}

const fieldsFromRow = (v: unknown) => (Array.isArray(v) ? v.map(minutesFieldFromRow).filter((f): f is MinutesField => !!f) : [])

/** mkt_minutes_templates(): the templates as they were made. */
export function minutesTemplatesFromRow(v: unknown): MinutesTemplate[] {
  const list = isObj(v) && Array.isArray(v.templates) ? v.templates : []
  return list.filter(isObj).map(t => {
    const p = isObj(t.published) ? t.published : null
    return {
      id: str(t.id),
      name: str(t.name),
      fields: fieldsFromRow(t.fields),
      rules: rulesFromRow(t.rules),
      rev: int(t.rev) ?? 1,
      version: int(t.version) ?? 0,
      changed: t.changed !== false,
      folder: strOrNull(t.folder),
      sort: int(t.sort) ?? 0,
      published: p ? { name: str(p.name), fields: fieldsFromRow(p.fields), rules: rulesFromRow(p.rules) } : null,
      usedBy: Array.isArray(t.usedBy) ? t.usedBy.filter((x): x is string => typeof x === 'string') : [],
      open: int(t.open) ?? 0,
      openOnLive: int(t.openOnLive) ?? 0,
      publishedAt: strOrNull(t.publishedAt),
      publishedBy: strOrNull(t.publishedBy),
      updatedAt: strOrNull(t.updatedAt),
      updatedBy: strOrNull(t.updatedBy),
    }
  })
}

/** mkt_minutes_templates()'s folders. */
export function minutesFoldersFromRow(v: unknown): MinutesFolder[] {
  const list = isObj(v) && Array.isArray(v.folders) ? v.folders : []
  return list.filter(isObj).map(f => ({ id: str(f.id), name: str(f.name), parent: strOrNull(f.parent), sort: int(f.sort) ?? 0 })).filter(f => f.id)
}

/** A new template (the handoff's): the project it is for, the meeting's date, the attendees, the signatures. */
export function newMinutesFields(): MinutesField[] {
  return [
    { key: fieldKey(), name: 'Project (from Projects)', type: 'Project link', req: true, pic: true, lock: true },
    { key: fieldKey(), name: 'Meeting date', type: 'Date', req: true, pic: true, lock: false },
    { key: fieldKey(), name: 'Attendees', type: 'People', req: true, pic: true, lock: true },
    { key: fieldKey(), name: 'Signatures', type: 'Signature', req: true, pic: true, lock: false },
  ]
}
export const NEW_RULES: MinutesRules = { sign: false, pic: false, picAll: false, project: true, file: true, lock: true }

/** "New minutes", "New minutes 2" … — a name not taken. */
export function newMinutesName(taken: readonly string[]): string {
  const lower = new Set(taken.map(t => t.trim().toLowerCase()))
  if (!lower.has('new minutes')) return 'New minutes'
  let n = 2
  while (lower.has(`new minutes ${n}`)) n++
  return `New minutes ${n}`
}

// ── Fields ─────────────────────────────────────────────────────────────────────────

const NEW_TABLE = (): Pick<MinutesField, 'cols' | 'rows' | 'staffRows' | 'staffCols'> => ({
  cols: [{ name: 'Item', type: 'Text' }, { name: 'Details', type: 'Text' }, { name: 'Owner', type: 'Person' }],
  rows: [['', '', ''], ['', '', '']], staffRows: true, staffCols: false,
})

/** A kind a field may not take: another field holds it already and it is kept once — or the field is locked. */
export function typeBlocked(fields: readonly MinutesField[], i: number, type: MinutesType): boolean {
  const f = fields[i]
  if (!f || f.type === type) return false
  return f.lock || (ONCE_TYPES.includes(type) && fields.some((x, k) => k !== i && x.type === type))
}

/** Where a field added goes: after the field picked (not the signatures), else before the signatures, else last. */
export function insertAt(fields: readonly MinutesField[], selKey: string | null): number {
  const sel = fields.findIndex(f => f.key === selKey)
  if (sel >= 0 && fields[sel].type !== 'Signature') return sel + 1
  const si = fields.findIndex(f => f.type === 'Signature')
  return si < 0 ? fields.length : si
}

/** A field added from the type cards: no name yet, the PIC sees it; a Signature always last. */
export function addField(fields: readonly MinutesField[], type: MinutesType, selKey: string | null): { fields: MinutesField[]; key: string } {
  const f: MinutesField = { key: fieldKey(), name: '', type, req: false, pic: true, lock: false, ...(type === 'Table' ? NEW_TABLE() : {}) }
  const at = type === 'Signature' ? fields.length : insertAt(fields, selKey)
  const out = [...fields]
  out.splice(at, 0, f)
  return { fields: out, key: f.key }
}

/** A field's kind changed (v2): a table gets its columns and starting rows the first time; its own kept otherwise. */
export function retype(f: MinutesField, type: MinutesType): MinutesField {
  if (f.lock || f.type === type) return f
  const next: MinutesField = { ...f, type }
  if (type === 'Table') Object.assign(next, f.cols ? { cols: f.cols, rows: f.rows ?? startRows(f), staffRows: f.staffRows ?? true, staffCols: f.staffCols ?? false } : NEW_TABLE())
  return next
}

/** A field copied after itself — "<name> (copy)" with an id of its own (never a locked or once-only one). */
export function duplicateField(fields: readonly MinutesField[], i: number): { fields: MinutesField[]; key: string } | null {
  const f = fields[i]
  if (!f || f.lock || ONCE_TYPES.includes(f.type)) return null
  const c = { ...clone(f), key: fieldKey(), name: `${f.name} (copy)` }
  const out = [...fields]
  out.splice(i + 1, 0, c)
  return { fields: out, key: c.key }
}

/** A field moved one up or down (a locked one stays). */
export function moveField(fields: readonly MinutesField[], i: number, to: number): MinutesField[] {
  if (to < 0 || to >= fields.length || i === to || fields[i]?.lock) return [...fields]
  const out = [...fields]
  const [x] = out.splice(i, 1)
  out.splice(to, 0, x)
  return out
}

// ── A table's columns and its starting rows, kept aligned ──────────────────────────

export function addCol(f: MinutesField): MinutesField {
  const cols = f.cols ?? []
  if (cols.length >= MAX_COLS) return f
  const rows = startRows(f)
  return { ...f, cols: [...cols, { name: `Column ${cols.length + 1}`, type: 'Text' }], rows: rows.map(r => [...r, '']) }
}
export function removeCol(f: MinutesField, ci: number): MinutesField {
  const cols = f.cols ?? []
  if (cols.length < 2 || !cols[ci]) return f
  return { ...f, cols: cols.filter((_, k) => k !== ci), rows: startRows(f).map(r => r.filter((_, k) => k !== ci)) }
}
export function moveCol(f: MinutesField, ci: number, d: -1 | 1): MinutesField {
  const cols = [...(f.cols ?? [])]
  const j = ci + d
  if (!cols[ci] || j < 0 || j >= cols.length) return f
  const rows = startRows(f).map(r => {
    const x = [...r]
    const [c] = x.splice(ci, 1)
    x.splice(j, 0, c)
    return x
  })
  const [c] = cols.splice(ci, 1)
  cols.splice(j, 0, c)
  return { ...f, cols, rows }
}
/** A column renamed: a Text column whose name says a day becomes a Date. */
export function nameCol(f: MinutesField, ci: number, name: string): MinutesField {
  return { ...f, cols: (f.cols ?? []).map((c, k) => (k === ci ? { name, type: c.type === 'Text' && /date|due|deadline|day/i.test(name) ? 'Date' : c.type } : c)) }
}
export function typeCol(f: MinutesField, ci: number, type: MinutesColType): MinutesField {
  return { ...f, cols: (f.cols ?? []).map((c, k) => (k === ci ? { ...c, type } : c)) }
}
export function addStartRow(f: MinutesField): MinutesField {
  const rows = startRows(f)
  return rows.length >= MAX_ROWS ? f : { ...f, rows: [...rows, (f.cols ?? []).map(() => '')] }
}
export function removeStartRow(f: MinutesField, ri: number): MinutesField {
  const rows = startRows(f)
  return rows.length < 2 ? f : { ...f, rows: rows.filter((_, k) => k !== ri) }
}
export function setStartCell(f: MinutesField, ri: number, ci: number, v: string): MinutesField {
  return { ...f, rows: startRows(f).map((r, k) => (k === ri ? r.map((x, j) => (j === ci ? v : x)) : r)) }
}

/** A table's answer in the minutes: the template's columns and the staff's own, its rows — the starting rows while
 * nobody has written in it (mkt_minutes_missing reads it the same way). */
export function tableAnswer(f: MinutesField, v: unknown): { cols: string[]; types: MinutesColType[]; xcols: string[]; rows: string[][] } {
  const own = f.cols ?? []
  const val = isObj(v) ? v : null
  const xcols = val && Array.isArray(val.xcols) ? val.xcols.map(str) : []
  const cols = [...own.map(c => c.name), ...xcols]
  const types = [...own.map(c => c.type), ...xcols.map(() => 'Text' as const)]
  const saved = val && Array.isArray(val.rows) ? val.rows.filter(Array.isArray).map(r => cols.map((_, k) => str(r[k]))) : null
  return { cols, types, xcols, rows: saved ?? startRows(f).map(r => cols.map((_, k) => r[k] ?? '')) }
}

// ── What the foot says ─────────────────────────────────────────────────────────────

/** "9 fields · 6 required · 7 visible to PIC". */
export function minutesSummary(fields: readonly MinutesField[]): string {
  const req = fields.filter(f => f.req || f.lock).length
  const pic = fields.filter(f => f.pic).length
  return `${fields.length} field${fields.length === 1 ? '' : 's'} · ${req} required · ${pic} visible to PIC`
}

export interface MinutesWarning { text: string; tab: 'fields' | 'rules' }
/** The foot's ⚠️ — a warning, never a refusal; a click opens the tab it is about. */
export function minutesWarnings(fields: readonly MinutesField[], rules: MinutesRules): MinutesWarning[] {
  const out: MinutesWarning[] = []
  if (rules.sign && !fields.some(f => f.type === 'Signature')) out.push({ text: '“Every attendee signs” is on, but there is no Signatures field', tab: 'rules' })
  if (rules.pic && !fields.some(f => f.pic && !['People', 'Project link', 'Date', 'Campaign period', 'Signature', 'Title'].includes(f.type))) {
    out.push({ text: 'PIC signs off but can’t see any content field', tab: 'fields' })
  }
  return out
}

export interface MinutesProblem { text: string; key: string | null }
/** What publishing refuses, as the database does — each with the field it is about (the foot's red Fix). */
export function minutesProblems(fields: readonly MinutesField[]): MinutesProblem[] {
  const out: MinutesProblem[] = []
  const names = fields.map(f => f.name.trim().toLowerCase())
  const blank = fields.find(f => !f.name.trim())
  if (blank) out.push({ text: 'A field has no name', key: blank.key })
  const dup = fields.find((f, i) => f.name.trim() && names.indexOf(f.name.trim().toLowerCase()) !== i)
  if (dup) out.push({ text: `Two fields are called “${dup.name.trim()}”`, key: dup.key })
  const tc = fields.find(f => f.type === 'Table' && (f.cols ?? []).some(c => !c.name.trim()))
  if (tc) out.push({ text: 'A table column has no name', key: tc.key })
  for (const ty of ONCE_TYPES) {
    const m = fields.filter(f => f.type === ty)
    if (m.length > 1) out.push({ text: `Only one ${ty} field allowed`, key: m[1].key })
  }
  if (!fields.some(f => f.type === 'Project link') || !fields.some(f => f.type === 'People' && f.lock)) {
    out.push({ text: 'Minutes keep their project and attendees', key: null })
  }
  return out
}

/** The fields as mkt_minutes_save takes them. */
export function minutesFieldsPayload(fields: readonly MinutesField[]): Record<string, unknown>[] {
  return fields.map(f => {
    const help = (f.help ?? '').replace(/\s+/g, ' ').trim()
    return {
      id: f.key,
      name: f.name,
      type: f.type,
      req: f.req || f.lock,
      pic: f.pic,
      lock: f.lock,
      ...(help ? { help } : {}),
      ...(f.type === 'Table' ? {
        cols: (f.cols ?? []).map(c => ({ name: c.name, type: c.type })),
        rows: startRows(f),
        staffRows: f.staffRows !== false,
        staffCols: f.staffCols === true,
      } : {}),
    }
  })
}

/** The parts of `now` not as `saved` had them; null when nothing changed. */
export function minutesPatch(saved: MinutesEdit, now: MinutesEdit): Record<string, unknown> | null {
  const patch: Record<string, unknown> = {}
  if (now.name !== saved.name) patch.name = now.name
  if (JSON.stringify(minutesFieldsPayload(now.fields)) !== JSON.stringify(minutesFieldsPayload(saved.fields))) patch.fields = minutesFieldsPayload(now.fields)
  if (JSON.stringify(now.rules) !== JSON.stringify(saved.rules)) patch.rules = now.rules
  return Object.keys(patch).length ? patch : null
}

/** How many changes since the version published (the handoff's countChanges): the name, each field added, removed or
 * changed, the order of the fields both keep, each rule. null when never published. */
export function countChanges(now: MinutesEdit, published: MinutesEdit | null): number | null {
  if (!published) return null
  let n = now.name.trim() !== published.name.trim() ? 1 : 0
  const pay = (fs: readonly MinutesField[]) => new Map(minutesFieldsPayload(fs).map(p => [String(p.id), JSON.stringify(p)]))
  const a = pay(now.fields)
  const b = pay(published.fields)
  for (const [k, v] of a) if (b.get(k) !== v) n++
  for (const k of b.keys()) if (!a.has(k)) n++
  const kept = (fs: readonly MinutesField[], other: Map<string, string>) => fs.map(f => f.key).filter(k => other.has(k)).join()
  if (kept(now.fields, b) !== kept(published.fields, a)) n++
  for (const r of RULES) if (now.rules[r.key] !== published.rules[r.key]) n++
  return n
}

// ── The rail: folders and templates ────────────────────────────────────────────────

export type RailItem =
  | { kind: 'folder'; folder: MinutesFolder; depth: number; count: number; collapsed: boolean }
  | { kind: 'tpl'; tpl: MinutesTemplate; depth: number }

/** Every template in a folder and those below it. */
export function folderCount(id: string, folders: readonly MinutesFolder[], tpls: readonly MinutesTemplate[]): number {
  return tpls.filter(t => t.folder === id).length + folders.filter(f => f.parent === id).reduce((n, f) => n + folderCount(f.id, folders, tpls), 0)
}

/** The rail as drawn: folders first, then templates, at each level, 16px a level; a search lists matches flat. */
export function railItems(folders: readonly MinutesFolder[], tpls: readonly MinutesTemplate[], collapsed: Record<string, boolean>, q: string): RailItem[] {
  const query = q.trim().toLowerCase()
  if (query) return tpls.filter(t => t.name.toLowerCase().includes(query)).map(tpl => ({ kind: 'tpl', tpl, depth: 0 }))
  const known = new Set(folders.map(f => f.id))
  const out: RailItem[] = []
  const walk = (parent: string | null, depth: number) => {
    for (const folder of folders.filter(f => (f.parent && known.has(f.parent) ? f.parent : null) === parent)) {
      const col = !!collapsed[folder.id]
      out.push({ kind: 'folder', folder, depth, count: folderCount(folder.id, folders, tpls), collapsed: col })
      if (!col) walk(folder.id, depth + 1)
    }
    for (const tpl of tpls.filter(t => (t.folder && known.has(t.folder) ? t.folder : null) === parent)) out.push({ kind: 'tpl', tpl, depth })
  }
  walk(null, 0)
  return out
}

/** Every folder in tree order with its depth (the menu's Move to folder). */
export function folderTree(folders: readonly MinutesFolder[]): { folder: MinutesFolder; depth: number }[] {
  const out: { folder: MinutesFolder; depth: number }[] = []
  const walk = (parent: string | null, depth: number) => {
    for (const folder of folders.filter(f => f.parent === parent)) {
      out.push({ folder, depth })
      walk(folder.id, depth + 1)
    }
  }
  walk(null, 0)
  return out
}

/** A folder deleted, as the database does it: its folders and templates move up a level. */
export function dropFolder(id: string, folders: readonly MinutesFolder[], tpls: readonly MinutesTemplate[]): { folders: MinutesFolder[]; tpls: MinutesTemplate[] } {
  const fo = folders.find(f => f.id === id)
  if (!fo) return { folders: [...folders], tpls: [...tpls] }
  return {
    folders: folders.filter(f => f.id !== id).map(f => (f.parent === id ? { ...f, parent: fo.parent } : f)),
    tpls: tpls.map(t => (t.folder === id ? { ...t, folder: fo.parent } : t)),
  }
}

/** A template's status in the rail: its dot and its tooltip (no meta line — the handoff). */
export function railStatus(t: MinutesTemplate, now: MinutesEdit, inFolder: string | null): { dot: 'live' | 'changed' | 'draft'; title: string } {
  const c = countChanges(now, t.published)
  const n = now.fields.length
  const line = c === null ? 'Draft · never published' : c ? `v${t.version} live · ${c} unpublished change${c > 1 ? 's' : ''}` : `v${t.version} · live`
  return {
    dot: c === null ? 'draft' : c ? 'changed' : 'live',
    title: `${inFolder ? `In ${inFolder}\n` : ''}${line}\n${n} field${n === 1 ? '' : 's'} · right-click for more`,
  }
}

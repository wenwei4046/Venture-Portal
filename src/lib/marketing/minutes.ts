// Marketing's Minutes Builder (mig 20261023235800, `Minutes Builder.dc.html`): the minutes templates — each one's fields
// (which are required, which the PIC sees on the link, a table's columns; the project and the attendees every minutes
// keep, locked) and its completion rules — what the foot sums up and warns of, what publishing refuses (as
// mkt_minutes_check does), and only what changed, for the save. Pure.

export const MINUTES_TYPES = ['Short text', 'Long text', 'Date', 'Number', 'People', 'Project link', 'Free space', 'Table', 'Signature'] as const
export type MinutesType = (typeof MINUTES_TYPES)[number]
/** The kinds a field is added as (the handoff's TYPES): the project link and the signatures come with every template. */
export const ADDABLE_TYPES: readonly MinutesType[] = ['Short text', 'Long text', 'Date', 'Number', 'People', 'Project link', 'Free space', 'Table']
export const MINUTES_COL_TYPES = ['Text', 'Number', 'Date', 'Person'] as const
export type MinutesColType = (typeof MINUTES_COL_TYPES)[number]
export const COL_GLYPH: Record<MinutesColType, string> = { Text: 'Aa', Number: '#', Date: '▦', Person: '◎' }

export interface MinutesField {
  /** The field's key on the page (not kept). */
  key: string
  name: string
  type: MinutesType
  /** Blocks Complete while empty. */
  req: boolean
  /** The PIC sees it on the link. */
  pic: boolean
  /** The project and the attendees: never removed, always required. */
  lock: boolean
  /** A table's columns. */
  cols?: { name: string; type: MinutesColType }[]
}

export type RuleKey = 'sign' | 'pic' | 'project' | 'file' | 'lock'
export type MinutesRules = Record<RuleKey, boolean>
export const RULES: readonly { key: RuleKey; name: string; hint: string }[] = [
  { key: 'sign', name: 'Every attendee signs', hint: 'Complete stays locked until all attendees sign' },
  { key: 'pic', name: 'PIC signs off on the link', hint: 'The PIC approves the minutes before the tracking link is created' },
  { key: 'project', name: 'Must link a project', hint: 'Pulls the subsidiary, product and dates from the project' },
  { key: 'file', name: 'File to Library on complete', hint: 'Saved in the subsidiary’s Library → Minutes folder' },
  { key: 'lock', name: 'Lock after complete', hint: 'No edits once signed off · changes need a new version' },
]

export interface MinutesTemplate {
  id: string
  name: string
  fields: MinutesField[]
  rules: MinutesRules
  rev: number
  version: number
  changed: boolean
  publishedAt: string | null
  publishedBy: string | null
  updatedAt: string | null
  updatedBy: string | null
}

export const MAX_MINUTES_FIELDS = 40

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const str = (v: unknown) => (typeof v === 'string' ? v : '')
const strOrNull = (v: unknown) => (typeof v === 'string' && v ? v : null)
const int = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.trunc(v) : null)

let seq = 0
export const fieldKey = () => `f${Date.now().toString(36)}${(seq++).toString(36)}`

/** A column's kind: as set, else Date for a name that says so ("Due date", "Deadline", "Day"), else Text. */
export const colTypeOf = (type: string | undefined, name: string): MinutesColType =>
  MINUTES_COL_TYPES.find(t => t === type) ?? (/date|due|deadline|day/i.test(name) ? 'Date' : 'Text')

export function minutesFieldFromRow(v: unknown): MinutesField | null {
  if (!isObj(v)) return null
  const type = MINUTES_TYPES.find(t => t === v.type)
  if (!type) return null
  const cols = type === 'Table' && Array.isArray(v.cols)
    ? v.cols.filter(isObj).map(c => ({ name: str(c.name), type: colTypeOf(str(c.type), str(c.name)) }))
    : undefined
  return { key: fieldKey(), name: str(v.name), type, req: v.req === true, pic: v.pic === true, lock: v.lock === true, ...(cols ? { cols } : {}) }
}

export function rulesFromRow(v: unknown): MinutesRules {
  const r = isObj(v) ? v : {}
  return { sign: r.sign === true, pic: r.pic === true, project: r.project === true, file: r.file === true, lock: r.lock === true }
}

/** mkt_minutes_templates(): the templates as they were made. */
export function minutesTemplatesFromRow(v: unknown): MinutesTemplate[] {
  const list = isObj(v) && Array.isArray(v.templates) ? v.templates : []
  return list.filter(isObj).map(t => ({
    id: str(t.id),
    name: str(t.name),
    fields: Array.isArray(t.fields) ? t.fields.map(minutesFieldFromRow).filter((f): f is MinutesField => !!f) : [],
    rules: rulesFromRow(t.rules),
    rev: int(t.rev) ?? 1,
    version: int(t.version) ?? 0,
    changed: t.changed !== false,
    publishedAt: strOrNull(t.publishedAt),
    publishedBy: strOrNull(t.publishedBy),
    updatedAt: strOrNull(t.updatedAt),
    updatedBy: strOrNull(t.updatedBy),
  }))
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
export const NEW_RULES: MinutesRules = { sign: false, pic: false, project: true, file: true, lock: true }

/** "New minutes", "New minutes 2" … — a name not taken. */
export function newMinutesName(taken: readonly string[]): string {
  const lower = new Set(taken.map(t => t.trim().toLowerCase()))
  if (!lower.has('new minutes')) return 'New minutes'
  let n = 2
  while (lower.has(`new minutes ${n}`)) n++
  return `New minutes ${n}`
}

/** A field added by name and kind — before the signatures, which close the minutes. A table starts with three columns. */
export function addMinutesField(fields: readonly MinutesField[], name: string, type: MinutesType): MinutesField[] {
  const f: MinutesField = {
    key: fieldKey(), name: name.trim(), type, req: false, pic: true, lock: false,
    ...(type === 'Table' ? { cols: [{ name: 'Item', type: 'Text' }, { name: 'Details', type: 'Text' }, { name: 'Owner', type: 'Text' }] } : {}),
  }
  const at = fields.findIndex(x => x.type === 'Signature')
  const out = [...fields]
  out.splice(at < 0 ? out.length : at, 0, f)
  return out
}

/** What the foot sums up: "9 fields · 6 required · 7 visible to PIC". */
export function minutesSummary(fields: readonly MinutesField[]): string {
  const req = fields.filter(f => f.req || f.lock).length
  const pic = fields.filter(f => f.pic).length
  return `${fields.length} field${fields.length === 1 ? '' : 's'} · ${req} required · ${pic} visible to PIC`
}

/** The foot's warnings (the handoff's). */
export function minutesWarnings(fields: readonly MinutesField[], rules: MinutesRules): string[] {
  const out: string[] = []
  if (rules.sign && !fields.some(f => f.type === 'Signature')) out.push('“Every attendee signs” is on, but there is no Signatures field')
  if (rules.pic && !fields.some(f => f.pic && f.type !== 'People' && f.type !== 'Project link' && f.type !== 'Date' && f.type !== 'Signature')) {
    out.push('PIC signs off but can’t see any content field')
  }
  return out
}

/** What publishing refuses, as the database does. */
export function minutesProblems(fields: readonly MinutesField[]): string[] {
  const out: string[] = []
  const names = fields.map(f => f.name.trim().toLowerCase())
  if (names.some(n => !n)) out.push('A field has no name')
  else if (new Set(names).size !== names.length) out.push('Two fields share a name')
  if (fields.some(f => f.type === 'Table' && (f.cols ?? []).some(c => !c.name.trim()))) out.push('A table column has no name')
  if (!fields.some(f => f.type === 'Project link') || !fields.some(f => f.type === 'People' && f.lock)) out.push('Minutes keep their project and attendees')
  return out
}

/** The fields as mkt_minutes_save takes them. */
export function minutesFieldsPayload(fields: readonly MinutesField[]): Record<string, unknown>[] {
  return fields.map(f => ({
    name: f.name,
    type: f.type,
    req: f.req || f.lock,
    pic: f.pic,
    lock: f.lock,
    ...(f.type === 'Table' ? { cols: (f.cols ?? []).map(c => ({ name: c.name, type: c.type })) } : {}),
  }))
}

export interface MinutesEdit {
  name: string
  fields: MinutesField[]
  rules: MinutesRules
}

/** The parts of `now` not as `saved` had them; null when nothing changed. */
export function minutesPatch(saved: MinutesEdit, now: MinutesEdit): Record<string, unknown> | null {
  const patch: Record<string, unknown> = {}
  if (now.name !== saved.name) patch.name = now.name
  if (JSON.stringify(minutesFieldsPayload(now.fields)) !== JSON.stringify(minutesFieldsPayload(saved.fields))) patch.fields = minutesFieldsPayload(now.fields)
  if (JSON.stringify(now.rules) !== JSON.stringify(saved.rules)) patch.rules = now.rules
  return Object.keys(patch).length ? patch : null
}

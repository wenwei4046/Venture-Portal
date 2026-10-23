/**
 * People › Documentation (2026-10-11, HR revamp round 2 — README §10): the
 * arithmetic behind its four tabs, pure so the page stays thin and this is
 * tested. The database's one read is `hr_documentation()` (mig
 * 20261011070000); `documentationFromRow` turns its jsonb into these types.
 *
 * Shared on purpose: the HR phone app's Data center and the Revenue app's
 * Documentation screen draw from the same model.
 */

import { dayLabel, shortDay } from '@/lib/commission/sales-group-requests'

export interface DocDepartment {
  id: string
  name: string
  /** Active people in it. */
  people: number
}

export interface DocPerson {
  id: string
  name: string
  code: string | null
  title: string | null
  departmentId: string | null
}

export interface DocEvent {
  what: string
  at: string
  who: string
  note: string
}

export interface DocDocument {
  id: string
  ref: string
  name: string
  fileName: string
  contentType: string | null
  size: number | null
  departmentIds: string[]
  departments: string[]
  uploadedAt: string
  uploadedBy: string
  deletedAt: string | null
  events: DocEvent[]
}

export interface LetterType {
  id: string
  name: string
  compulsory: boolean
  /** Letters of this type on file. */
  count: number
}

export interface PersonLetter {
  id: string
  ref: string
  staffId: string
  staffName: string
  /** Null for a published type of HR's own (a Memo saved to the Data center). */
  typeId: string | null
  typeName: string
  fileName: string
  contentType: string | null
  size: number | null
  filedAt: string
  filedBy: string
  source: 'upload' | 'publish'
  readAt: string | null
  acknowledgedAt: string | null
  /** Withdrawn (2026-10-11): off its person's record and out of the Revenue app, its file deleted; kept with its trail. */
  withdrawnAt: string | null
  /**
   * Kept from its person (2026-10-14 — the user: a letter can be hidden from them too): still on the record and counted,
   * nowhere in their app — the memo it travelled as with it. Null while they see it.
   */
  hiddenAt: string | null
  events: DocEvent[]
}

export interface PublishType {
  id: string
  name: string
  builtin: boolean
}

export interface Published {
  id: string
  kind: string
  title: string
  publishedAt: string
  audience: string | null
  /** A memo from before Documentation went to sub-departments (Fair, IR). */
  subDepartments: string[]
  attachmentName: string | null
  saved: boolean
  recipients: number
  acknowledged: number
  /** Withdrawn from everyone it reached (2026-10-11) — it stays on the list as HR's record. */
  withdrawnAt: string | null
  withdrawnBy: string | null
  /** What it had reached when it was withdrawn: "Had reached 12 people · 9 acknowledged". */
  withdrawnNote: string | null
  /** When its attachment was deleted from the bucket. */
  attachmentDeletedAt: string | null
}

export interface Documentation {
  departments: DocDepartment[]
  people: DocPerson[]
  documents: DocDocument[]
  letterTypes: LetterType[]
  letters: PersonLetter[]
  publishTypes: PublishType[]
  published: Published[]
}

// ── Reading the database's answer ───────────────────────────────────────────

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {})
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])
const str = (v: unknown): string => (typeof v === 'string' ? v : '')
const strOrNull = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null)
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v !== '' && Number.isFinite(Number(v)) ? Number(v) : 0)
const numOrNull = (v: unknown): number | null => (v === null || v === undefined || v === '' ? null : num(v))

function eventsOf(v: unknown): DocEvent[] {
  return arr(v).map(e => {
    const o = obj(e)
    return { what: str(o.what), at: str(o.at), who: str(o.who), note: str(o.note) }
  })
}

export function documentationFromRow(raw: unknown): Documentation | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const o = raw as Record<string, unknown>
  return {
    departments: arr(o.departments).map(d => {
      const x = obj(d)
      return { id: str(x.id), name: str(x.name), people: num(x.people) }
    }),
    people: arr(o.people).map(p => {
      const x = obj(p)
      return { id: str(x.id), name: str(x.name), code: strOrNull(x.code), title: strOrNull(x.title), departmentId: strOrNull(x.departmentId) }
    }),
    documents: arr(o.documents).map(d => {
      const x = obj(d)
      return {
        id: str(x.id),
        ref: str(x.ref),
        name: str(x.name),
        fileName: str(x.fileName),
        contentType: strOrNull(x.contentType),
        size: numOrNull(x.size),
        departmentIds: arr(x.departmentIds).map(str).filter(Boolean),
        departments: arr(x.departments).map(str).filter(Boolean),
        uploadedAt: str(x.uploadedAt),
        uploadedBy: str(x.uploadedBy),
        deletedAt: strOrNull(x.deletedAt),
        events: eventsOf(x.events),
      }
    }),
    letterTypes: arr(o.letterTypes).map(t => {
      const x = obj(t)
      return { id: str(x.id), name: str(x.name), compulsory: x.compulsory === true, count: num(x.count) }
    }),
    letters: arr(o.letters).map(l => {
      const x = obj(l)
      return {
        id: str(x.id),
        ref: str(x.ref),
        staffId: str(x.staffId),
        staffName: str(x.staffName),
        typeId: strOrNull(x.typeId),
        typeName: str(x.typeName),
        fileName: str(x.fileName),
        contentType: strOrNull(x.contentType),
        size: numOrNull(x.size),
        filedAt: str(x.filedAt),
        filedBy: str(x.filedBy),
        source: x.source === 'publish' ? 'publish' : 'upload',
        readAt: strOrNull(x.readAt),
        acknowledgedAt: strOrNull(x.acknowledgedAt),
        withdrawnAt: strOrNull(x.withdrawnAt),
        hiddenAt: strOrNull(x.hiddenAt),
        events: eventsOf(x.events),
      }
    }),
    publishTypes: arr(o.publishTypes).map(t => {
      const x = obj(t)
      return { id: str(x.id), name: str(x.name), builtin: x.builtin === true }
    }),
    published: arr(o.published).map(m => {
      const x = obj(m)
      return {
        id: str(x.id),
        kind: str(x.kind) || 'Memo',
        title: str(x.title),
        publishedAt: str(x.publishedAt),
        audience: strOrNull(x.audience),
        subDepartments: arr(x.subDepartments).map(str).filter(Boolean),
        attachmentName: strOrNull(x.attachmentName),
        saved: x.saved === true,
        recipients: num(x.recipients),
        acknowledged: num(x.acknowledged),
        withdrawnAt: strOrNull(x.withdrawnAt),
        withdrawnBy: strOrNull(x.withdrawnBy),
        withdrawnNote: strOrNull(x.withdrawnNote),
        attachmentDeletedAt: strOrNull(x.attachmentDeletedAt),
      }
    }),
  }
}

// ── Words ───────────────────────────────────────────────────────────────────

/** "Revenue Department" reads "Revenue", as the handoff writes it; every other name as it is. */
export function deptLabel(name: string): string {
  return name.replace(/\s+Department$/i, '').trim() || name
}

/** The file's kind as its tile says it: "PDF", "XLSX" (four letters at most). */
export function fileExt(fileName: string): string {
  const dot = fileName.lastIndexOf('.')
  return dot >= 0 ? fileName.slice(dot + 1).toUpperCase().slice(0, 4) : ''
}

/** "1 Oct 2026" — the office's calendar day. */
export function docDay(at: string | null): string {
  return at ? dayLabel(at) : '—'
}

/** "6 Oct" — the Published list's day. */
export function docShortDay(at: string): string {
  return shortDay(at)
}

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

// ── Letters ─────────────────────────────────────────────────────────────────

export type LetterStatus = 'delivered' | 'opened' | 'ack' | 'withdrawn'

/** Delivered → Opened → Acknowledged: the memo the letter travelled as, as its person answered it — or Withdrawn. */
export function letterStatus(l: Pick<PersonLetter, 'readAt' | 'acknowledgedAt' | 'withdrawnAt'>): LetterStatus {
  if (l.withdrawnAt) return 'withdrawn'
  if (l.acknowledgedAt) return 'ack'
  if (l.readAt) return 'opened'
  return 'delivered'
}

export const LETTER_STATUS: Readonly<Record<LetterStatus, { label: string; tone: 'info' | 'alert' | 'ledger' | 'gone' }>> = {
  delivered: { label: 'Delivered', tone: 'info' },
  opened: { label: 'Opened', tone: 'alert' },
  ack: { label: 'Acknowledged', tone: 'ledger' },
  withdrawn: { label: 'Withdrawn', tone: 'gone' },
}

/** The letters still on file — a withdrawn one counts for nothing anywhere (2026-10-11). */
export function liveLetters<T extends Pick<PersonLetter, 'withdrawnAt'>>(letters: readonly T[]): T[] {
  return letters.filter(l => !l.withdrawnAt)
}

/** A letter's whole trail: what was done to it here, and what its person did in the Revenue app. */
export function letterTrail(l: PersonLetter): DocEvent[] {
  const out = [...l.events]
  if (l.readAt) out.push({ what: 'Opened in Revenue app', at: l.readAt, who: l.staffName, note: '' })
  if (l.acknowledgedAt) out.push({ what: 'Acknowledged', at: l.acknowledgedAt, who: l.staffName, note: '' })
  return out
    .map((e, i) => ({ e, i }))
    .sort((a, b) => (Date.parse(a.e.at) || 0) - (Date.parse(b.e.at) || 0) || a.i - b.i)
    .map(x => x.e)
}

/** The compulsory types this person has no letter of (a withdrawn one is none). */
export function missingFor(personId: string, letters: readonly PersonLetter[], types: readonly LetterType[]): LetterType[] {
  const held = new Set(liveLetters(letters).filter(l => l.staffId === personId && l.typeId).map(l => l.typeId))
  return types.filter(t => t.compulsory && !held.has(t.id))
}

/** Everybody who has none of a compulsory type. */
export function missingCount(type: LetterType, people: readonly DocPerson[], letters: readonly PersonLetter[]): number {
  if (!type.compulsory) return 0
  const held = new Set(liveLetters(letters).filter(l => l.typeId === type.id).map(l => l.staffId))
  return people.filter(p => !held.has(p.id)).length
}

export interface DataCenterPerson extends DocPerson {
  /** "Team Leader · Revenue". */
  line: string
  letters: number
  /** "Offer letter missing, …" — empty when nothing compulsory is missing. */
  missing: string
}

/** Data center's people column: each active person, their letter count and what compulsory is missing. */
export function dataCenterPeople(doc: Pick<Documentation, 'people' | 'letters' | 'letterTypes' | 'departments'>): DataCenterPerson[] {
  const deptName = new Map(doc.departments.map(d => [d.id, deptLabel(d.name)]))
  const count = new Map<string, number>()
  for (const l of liveLetters(doc.letters)) count.set(l.staffId, (count.get(l.staffId) ?? 0) + 1)
  return doc.people.map(p => ({
    ...p,
    line: [p.title, p.departmentId ? deptName.get(p.departmentId) : null].filter(Boolean).join(' · '),
    letters: count.get(p.id) ?? 0,
    missing: missingFor(p.id, doc.letters, doc.letterTypes).map(t => `${t.name} missing`).join(', '),
  }))
}

// ── Publish ─────────────────────────────────────────────────────────────────

export interface AudienceGroup {
  department: DocDepartment
  /** Everybody in it. */
  all: DocPerson[]
  /** The ones still ticked. */
  picked: DocPerson[]
}

/** The departments picked, each with its people and who of them is still ticked. */
export function audienceGroups(
  departments: readonly DocDepartment[],
  people: readonly DocPerson[],
  pickedDepts: ReadonlySet<string>,
  unticked: ReadonlySet<string>,
): AudienceGroup[] {
  return departments
    .filter(d => pickedDepts.has(d.id))
    .map(d => {
      const all = people.filter(p => p.departmentId === d.id)
      return { department: d, all, picked: all.filter(p => !unticked.has(p.id)) }
    })
}

/** "Revenue · everyone  /  HR · Grace Lim" — the Published list's audience. */
export function audienceLabel(groups: readonly AudienceGroup[]): string {
  return groups
    .filter(g => g.picked.length > 0)
    .map(g => `${deptLabel(g.department.name)} · ${g.picked.length === g.all.length ? 'everyone' : g.picked.map(p => p.name).join(', ')}`)
    .join('  /  ')
}

/** Why Publish cannot go yet, in the prototype's order — or null. */
export function publishRefusal(p: { title: string; body: string; hasFile: boolean; groups: readonly AudienceGroup[] }): string | null {
  const to = p.groups.reduce((n, g) => n + g.picked.length, 0)
  if (!p.title.trim()) return 'Add a title.'
  if (p.groups.length > 0 && to === 0) return 'Tick at least one person.'
  if (!p.body.trim() && !p.hasFile) return 'Add a body or attach a file.'
  if (to === 0) return 'Pick at least one department.'
  return null
}

/**
 * "Goes to 12 people. Each one is told and must tap Acknowledge — once, in any view." A memo reaches its people
 * in every face of the app since 2026-10-12 (the portal's every view, the HR app, the Revenue app), not only the
 * Revenue app.
 */
export function publishSummary(groups: readonly AudienceGroup[]): string {
  const to = groups.reduce((n, g) => n + g.picked.length, 0)
  return to
    ? `Goes to ${plural(to, 'person', 'people')}. Each one is told and must tap Acknowledge — once, in any view.`
    : 'Pick a department to choose who it goes to.'
}

/** "9 of 12 acknowledged" and its bar; an old memo addressed by sub-department counts what it can. */
export function ackLine(m: Published): { line: string; pct: number } {
  if (m.recipients > 0) {
    return { line: `${m.acknowledged} of ${m.recipients} acknowledged`, pct: Math.round((m.acknowledged / m.recipients) * 100) }
  }
  return { line: `${m.acknowledged} acknowledged`, pct: 0 }
}

/** The Published list's audience line. */
export function publishedAudience(m: Published): string {
  return m.audience ?? (m.subDepartments.length ? m.subDepartments.join(', ') : '—')
}

/** A withdrawn memo's line on the Published list: "Withdrawn 11 Oct by Grace Lim · Had reached 12 people · 9 acknowledged · attachment deleted". */
export function withdrawnLine(m: Pick<Published, 'withdrawnAt' | 'withdrawnBy' | 'withdrawnNote' | 'attachmentDeletedAt'>): string {
  if (!m.withdrawnAt) return ''
  return [
    `Withdrawn ${shortDay(m.withdrawnAt)}${m.withdrawnBy ? ` by ${m.withdrawnBy}` : ''}`,
    m.withdrawnNote,
    m.attachmentDeletedAt ? 'attachment deleted' : null,
  ].filter(Boolean).join(' · ')
}

// ── Uploads ─────────────────────────────────────────────────────────────────

/** The file box's accept list: "PDF, Office, image, video or zip" — videos, PowerPoint and zip since 2026-10-24. */
export const DOC_ACCEPT = '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.csv,.png,.jpg,.jpeg,.webp,.gif,.heic,.mp4,.mov,.webm,.zip'
/** The bucket's own limit (mig 20261024006700, the owner: "make the size more bigger for all"): 2 GB. */
export const MAX_FILE_BYTES = 2 * 1024 * 1024 * 1024

const TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  csv: 'text/csv',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  heic: 'image/heic',
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm',
  zip: 'application/zip',
}

/** The type the bucket is told — by the name's ending, which a browser does not always fill in. */
export function contentTypeOf(fileName: string, given?: string | null): string | null {
  const ext = fileName.slice(fileName.lastIndexOf('.') + 1).toLowerCase()
  return TYPES[ext] ?? (given && Object.values(TYPES).includes(given) ? given : null)
}

/** Why this file cannot go up — or null. */
export function fileRefusal(file: { name: string; size: number; type?: string }): string | null {
  if (!contentTypeOf(file.name, file.type)) return 'That kind of file cannot be kept here — a PDF, an Office file, an image, a video or a zip.'
  if (file.size > MAX_FILE_BYTES) return 'That file is larger than 2 GB.'
  return null
}

/** A safe object name: the file's own name, its odd characters made plain. */
export function safeFileName(name: string): string {
  const cleaned = name.normalize('NFKD').replace(/[^\w.-]+/g, '_').replace(/_+/g, '_').replace(/^[_.]+/, '')
  return (cleaned || 'file').slice(-120)
}

/** Where a file goes in the bucket: `documents/<id>/x.pdf`, `letters/<staff>/<id>/x.pdf`, `publish/<id>/x.pdf`, `drive/<id>/x.pdf` (a Data center folder's, 2026-10-12). */
export function objectPath(folder: 'documents' | 'publish' | 'drive' | { letterFor: string }, id: string, fileName: string): string {
  const base = typeof folder === 'string' ? folder : `letters/${folder.letterFor}`
  return `${base}/${id}/${safeFileName(fileName)}`
}

/** The Documents tab's default name: the file's, without its ending, its underscores as spaces. */
export function nameFromFile(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim()
}

/** How the preview drawer shows a file: inline for a PDF, a picture or a video, else "No preview". */
export function previewKind(fileName: string, contentType: string | null): 'pdf' | 'image' | 'video' | 'sheet' | 'none' {
  const type = contentTypeOf(fileName, contentType)
  if (type === 'application/pdf') return 'pdf'
  if (type && type.startsWith('image/') && type !== 'image/heic') return 'image'
  // Played where it is (2026-10-24, videos taken): the player asks the file a piece at a time, so a big one starts at once.
  if (type && type.startsWith('video/')) return 'video'
  // Excel and CSV are drawn as the handoff's sheet (2026-10-11, lib/documentation/sheet.ts); a Word file stays a download, as there.
  if (type === TYPES.xlsx || type === TYPES.xls || type === TYPES.csv) return 'sheet'
  return 'none'
}

/**
 * IT support (2026-10-20 — the user: "i want add on a button to get submit for IT support or help"; everybody sends a
 * title, the details and screenshots or files, as a bug, a new feature or a suggestion; "左边这里 category 就会多一个 IT
 * request" — for "just principal or ulitmate full access" (a screenshot can carry the sender's pay); "我们也可以帮做
 * annotation … 他也能看到自己 submit 的 case status。如果我们给它 fix 了，他那边就可以收到 fix 的通知").
 *
 * What a request is as the app reads and writes it. Pure, so every screen draws the same thing and this is tested. The
 * database decides who may do what (mig 20261021020100): anybody signed in sends one and follows their own; IT requests ·
 * View reads everybody's; Edit writes notes on one and sets its status, and its sender is told — New, In progress or
 * Fixed: once it is Fixed its sender closes it (2026-10-27).
 */

import { officeDay } from '@/lib/office-time'

export type ItCategory = 'bug' | 'feature' | 'suggestion'
export type ItStatus = 'new' | 'in_progress' | 'fixed' | 'closed'
export type ItSide = 'it' | 'sender'

/** What it is about — the form's three, in the user's words: fix a bug, add a feature, a suggestion. */
export const IT_CATEGORIES: ReadonlyArray<{ id: ItCategory; label: string; sub: string }> = [
  { id: 'bug', label: 'Fix a bug', sub: 'Something is broken or wrong' },
  { id: 'feature', label: 'New feature', sub: 'Something the app should do' },
  { id: 'suggestion', label: 'Suggestion', sub: 'An idea to make it better' },
]
export const CATEGORY_LABEL: Readonly<Record<ItCategory, string>> = { bug: 'Bug', feature: 'New feature', suggestion: 'Suggestion' }

export const IT_STATUSES: ReadonlyArray<{ id: ItStatus; label: string }> = [
  { id: 'new', label: 'New' },
  { id: 'in_progress', label: 'In progress' },
  { id: 'fixed', label: 'Fixed' },
  { id: 'closed', label: 'Closed' },
]
export const STATUS_LABEL: Readonly<Record<ItStatus, string>> = { new: 'New', in_progress: 'In progress', fixed: 'Fixed', closed: 'Closed' }
/**
 * What IT sets (2026-10-27 — the user: "我这边写已经 fix 了，所以那个 close 是不需要的。等我这边按了已经 fix，这个 close
 * 其实应该是由提出这个 request / support 的人去操作"): New, In progress, Fixed. Closed is its sender's — once IT has marked
 * it Fixed, they try it and close it, and the desk reads it closed (mig 20261026183719).
 */
export const IT_DESK_STATUSES: ReadonlyArray<{ id: ItStatus; label: string }> = IT_STATUSES.filter(s => s.id !== 'closed')
/** Its sender may close it: IT has marked it Fixed. */
export const senderMayClose = (r: Pick<ItRequest, 'mine' | 'status'>): boolean => r.mine && r.status === 'fixed'
/** A status's chip, in the app's tones: waiting, being worked on, done, put away. */
export const STATUS_TONE: Readonly<Record<ItStatus, 'pending' | 'warn' | 'good' | 'none'>> = { new: 'pending', in_progress: 'warn', fixed: 'good', closed: 'none' }

/** The database's limits (mig 20261021020100; a file 2 GB since mig 20261024006700), said before anything is sent. */
export const IT_LIMITS = { title: 120, details: 5000, note: 3000, files: 10, fileBytes: 2 * 1024 * 1024 * 1024 } as const

export interface ItFile {
  id: string
  /** The note it came with; null = the request's own. */
  noteId: string | null
  name: string
  contentType: string | null
  size: number | null
  at: string
}

export interface ItNote {
  id: string
  /** IT's note, or the sender's reply. */
  side: ItSide
  authorName: string
  body: string
  /** A status it set (both null for words alone). */
  statusFrom: ItStatus | null
  statusTo: ItStatus | null
  at: string
  mine: boolean
}

export interface ItRequest {
  id: string
  /** IT-0001 … */
  ref: string
  category: ItCategory
  title: string
  details: string
  status: ItStatus
  /** Where it was sent from, and on what. */
  app: string
  device: string | null
  createdAt: string
  updatedAt: string
  statusAt: string | null
  statusByName: string | null
  senderName: string
  senderTitle: string | null
  /** The reader sent it. */
  mine: boolean
  files: ItFile[]
  notes: ItNote[]
}

/** A file going up with a request or a note — what the browser's upload answered. */
export interface ItUpload {
  path: string
  name: string
  contentType: string
  size: number
}

const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null)
const str = (v: unknown): string => (typeof v === 'string' ? v : '')
const strOrNull = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null)
const numOrNull = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v !== '' && Number.isFinite(Number(v)) ? Number(v) : null
const CATEGORIES: readonly string[] = ['bug', 'feature', 'suggestion']
const STATUSES: readonly string[] = ['new', 'in_progress', 'fixed', 'closed']
const statusOrNull = (v: unknown): ItStatus | null => (typeof v === 'string' && STATUSES.includes(v) ? (v as ItStatus) : null)

function fileFromRow(v: unknown): ItFile | null {
  const o = obj(v)
  if (!o || !str(o.id)) return null
  return { id: str(o.id), noteId: strOrNull(o.noteId), name: str(o.name) || 'file', contentType: strOrNull(o.contentType), size: numOrNull(o.size), at: str(o.at) }
}

function noteFromRow(v: unknown): ItNote | null {
  const o = obj(v)
  if (!o || !str(o.id)) return null
  return {
    id: str(o.id), side: o.side === 'it' ? 'it' : 'sender', authorName: str(o.authorName), body: str(o.body),
    statusFrom: statusOrNull(o.statusFrom), statusTo: statusOrNull(o.statusTo), at: str(o.at), mine: o.mine === true,
  }
}

/** One request as the database answers it (`it_requests_json`); null for anything else. */
export function itRequestFromRow(v: unknown): ItRequest | null {
  const o = obj(v)
  if (!o || !str(o.id) || !CATEGORIES.includes(str(o.category)) || !STATUSES.includes(str(o.status))) return null
  return {
    id: str(o.id), ref: str(o.ref), category: str(o.category) as ItCategory, title: str(o.title), details: str(o.details),
    status: str(o.status) as ItStatus, app: str(o.app), device: strOrNull(o.device),
    createdAt: str(o.createdAt), updatedAt: str(o.updatedAt), statusAt: strOrNull(o.statusAt), statusByName: strOrNull(o.statusByName),
    senderName: str(o.senderName), senderTitle: strOrNull(o.senderTitle), mine: o.mine === true,
    files: (Array.isArray(o.files) ? o.files : []).map(fileFromRow).filter((f): f is ItFile => !!f),
    notes: (Array.isArray(o.notes) ? o.notes : []).map(noteFromRow).filter((n): n is ItNote => !!n),
  }
}

/** `my_it_requests()` / `it_requests_desk()`. */
export function itRequestsFromRow(v: unknown): ItRequest[] {
  return (Array.isArray(v) ? v : []).map(itRequestFromRow).filter((r): r is ItRequest => !!r)
}

/** What stops a request being sent, in the database's words — or null. */
export function submitProblem(input: { category: string; title: string; details: string; files: number }): string | null {
  if (!CATEGORIES.includes(input.category)) return 'Pick what it is: a bug, a new feature or a suggestion.'
  const title = input.title.trim()
  if (!title) return 'Add a title.'
  if (title.length > IT_LIMITS.title) return `Keep the title to ${IT_LIMITS.title} characters.`
  if (input.details.length > IT_LIMITS.details) return 'Keep the details to 5,000 characters.'
  if (input.files > IT_LIMITS.files) return `Attach up to ${IT_LIMITS.files} files at a time.`
  return null
}

/** What stops a note being written — or null. A status set to what it already is moves nothing. */
export function noteProblem(input: { body: string; files: number; status: ItStatus | null; current: ItStatus }): string | null {
  const moves = input.status !== null && input.status !== input.current
  if (!input.body.trim() && !moves && input.files === 0) return 'Write a note, attach a file or change the status.'
  if (input.body.trim().length > IT_LIMITS.note) return 'Keep a note to 3,000 characters.'
  if (input.files > IT_LIMITS.files) return `Attach up to ${IT_LIMITS.files} files at a time.`
  return null
}

/** The bucket's own list (mig 20261021020100): the type a file goes up as, by the browser's word or else its name. */
const BY_TYPE: readonly string[] = [
  'image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/heic', 'image/heif',
  'video/mp4', 'video/quicktime', 'video/webm',
  'application/pdf', 'text/plain', 'text/csv', 'application/json',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/zip', 'application/x-zip-compressed', 'application/vnd.rar', 'application/x-rar-compressed',
  'application/x-7z-compressed',
]
const BY_NAME: Readonly<Record<string, string>> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', heic: 'image/heic', heif: 'image/heif',
  mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm', pdf: 'application/pdf', txt: 'text/plain', log: 'text/plain',
  csv: 'text/csv', json: 'application/json', doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', zip: 'application/zip',
  rar: 'application/vnd.rar', '7z': 'application/x-7z-compressed',
}
/** What the file input offers. */
export const IT_ACCEPT = 'image/*,video/*,.pdf,.txt,.log,.csv,.json,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.rar,.7z'

const extOf = (name: string) => (/\.([A-Za-z0-9]{1,5})$/.exec(name)?.[1] ?? '').toLowerCase()

/** The type a file goes up as — null when the bucket would refuse it. */
export function itContentType(name: string, type: string): string | null {
  const t = (type || '').split(';')[0].trim().toLowerCase()
  if (BY_TYPE.includes(t)) return t
  return BY_NAME[extOf(name)] ?? null
}

/** Why a file cannot go up — or null. */
export function itFileRefusal(file: { name: string; size: number; type: string }): string | null {
  if (!itContentType(file.name, file.type)) return `${file.name || 'That file'}: a picture, a video, a PDF, an Office file, a zip or a text file.`
  if (file.size < 1) return `${file.name || 'That file'} is empty.`
  if (file.size > IT_LIMITS.fileBytes) return `${file.name || 'That file'} is over 2 GB.`
  return null
}

/** Where a file goes in the bucket: the uploader's own folder, a fresh folder each time, a safe name. */
export function itObjectPath(uid: string, name: string, key: string): string {
  const safe = (name || 'file').normalize('NFKD').replace(/[^\w.\-]+/g, '_').replace(/_+/g, '_').replace(/^[_.]+/, '').slice(-80) || 'file'
  return `${uid}/${key}/${safe}`
}

export const isImage = (contentType: string | null) => !!contentType && contentType.startsWith('image/') && contentType !== 'image/heic' && contentType !== 'image/heif'
export const isVideo = (contentType: string | null) => !!contentType && contentType.startsWith('video/')

/**
 * How a filed file shows beside its request (2026-10-24): what a browser draws in place — a picture, a video, a PDF, a
 * text file — or null (an Office file, a zip, a CSV, an iPhone's HEIC), which opens in a new tab or downloads instead.
 */
export function previewKind(name: string, contentType: string | null): 'image' | 'video' | 'pdf' | 'text' | null {
  const type = itContentType(name, contentType ?? '') ?? ''
  if (isImage(type)) return 'image'
  if (isVideo(type)) return 'video'
  if (type === 'application/pdf') return 'pdf'
  if (type === 'text/plain' || type === 'application/json') return 'text'
  return null
}

/** A moment on the office's calendar: 20 Oct (a request sent at 01:00 is the office's day, not UTC's). */
export const itDay = (iso: string): string => (iso ? officeDay(iso).format('D MMM') : '')
/** …and its time: 20 Oct · 14:32. */
export const itWhen = (iso: string): string => (iso ? officeDay(iso).format('D MMM · HH:mm') : '')

/** 950 KB, 3.4 MB. */
export function fileSize(bytes: number | null): string {
  if (bytes === null || !Number.isFinite(bytes)) return ''
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** The file's tile: PNG, PDF, ZIP … */
export function fileTag(name: string, contentType: string | null): string {
  const ext = extOf(name)
  if (ext) return ext.toUpperCase().slice(0, 4)
  return (contentType?.split('/')[1] ?? 'FILE').toUpperCase().slice(0, 4)
}

/**
 * The device a request was sent from, in a few words — what IT wants to know of a bug: "iPhone · iOS 18.1 · Safari ·
 * app · 390×844". Read from the browser that sends it.
 */
export function deviceLabel(ua: string, opts: { standalone?: boolean; width?: number; height?: number } = {}): string {
  const ver = (re: RegExp) => {
    const m = re.exec(ua)
    return !m ? '' : m[2] && m[2] !== '0' ? `${m[1]}.${m[2]}` : m[1]
  }
  const ios = ver(/OS (\d+)[_.](\d+)/)
  const os = /iPhone/.test(ua) ? ['iPhone', ios && `iOS ${ios}`]
    : /iPad/.test(ua) ? ['iPad', ios && `iPadOS ${ios}`]
    : /Android/.test(ua) ? [`Android ${ver(/Android (\d+)(?:\.(\d+))?/)}`.trim()]
    : /Windows/.test(ua) ? ['Windows']
    : /Mac OS X|Macintosh/.test(ua) ? ['Mac']
    : /Linux/.test(ua) ? ['Linux'] : ['Unknown device']
  const browser = /EdgA?\//.test(ua) ? 'Edge' : /SamsungBrowser\//.test(ua) ? 'Samsung Internet' : /CriOS\/|Chrome\//.test(ua) ? 'Chrome'
    : /FxiOS\/|Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : ''
  const size = opts.width && opts.height ? `${Math.round(opts.width)}×${Math.round(opts.height)}` : ''
  return [...os, browser, opts.standalone ? 'app' : '', size].filter(Boolean).join(' · ').slice(0, 300)
}

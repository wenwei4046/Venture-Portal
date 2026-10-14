/**
 * People › Documentation › Data center as a Drive (2026-10-12 — the user: the
 * people column "scroll 得很高"; "参考 Google Drive 的做法，它是可以 create folder
 * 的", company → department → the person; HR is centralized, so a subsidiary
 * gets a folder, and folders named by department inside it).
 *
 * The tree, pure and tested. Every place has an address the page keeps in its
 * URL (`?tab=data-center&in=…`):
 *
 *   root               the Data center: HOUZS Venture + the folders HR made there
 *   company:hv         HOUZS Venture: its departments + folders HR made there
 *   dept:<id>          a department: its active people + folders HR made there
 *   person:<staff id>  a person: their record (the letters, as before)
 *   folder:<id>        a folder HR made: folders and files, any depth
 *
 * HOUZS Venture, its departments and their people come from People
 * (`hr_documentation()`), so they follow it by themselves — and "Publish &
 * save" files each copy into its person's folder. What HR made comes from
 * `hr_drive()` (mig 20261012220000).
 *
 * The Bin (mig 20261013183000, `?in=bin`, the Talent Bank's rules): a file or
 * a folder HR deleted in the last 30 days, none of it in the tree; `binFrom`
 * says where each was. A folder HR made moves with Move to… (`moveTargets`).
 *
 * A person's own (mig 20261014190000 — the user: "documentation 我要分成两种：
 * company / personal"): a person's folder holds folders and files of HR's
 * beside their letters, each shared with them or kept back (`memberView`, and
 * whether they see it, `memberSees`, worked out by the database); anything HR
 * made may be View only me (`lock`) — the read leaves out what the reader is
 * not shown; a file moves too, and both are copied (Copy to…, Duplicate).
 */

import { dataCenterPeople, deptLabel, fileExt, liveLetters, type DataCenterPerson, type DocEvent, type Documentation, type PersonLetter } from './model'

export const ROOT = 'root'
/** The Bin's address: not a place of the tree — what HR deleted in the last 30 days (`?in=bin`). */
export const BIN = 'bin'
export const HV = 'company:hv'
/** The portal's own company — the one folder of the Data center made by itself. */
export const HV_NAME = 'HOUZS Venture'

/**
 * View only me (2026-10-14): only the one who set it, whoever stands higher on the ladder and the Principal are shown it
 * — and everything in a folder with it. The read already leaves out what the reader is not shown.
 */
export interface DriveLock {
  /** Who set it. */
  by: string
  /** The reader set it. */
  mine: boolean
  at: string
}

/** What HR made, as the page draws it. */
interface DriveItem {
  /** View only me — this one's own; a folder above it may be locked too. */
  lock: DriveLock | null
  /** Shared with the person whose folder it is in: true, kept back (false), or as its folder (null). */
  memberView: boolean | null
  /** Whether that person sees it — null outside a person's folder. */
  memberSees: boolean | null
}

export interface DriveFolder extends DriveItem {
  id: string
  name: string
  /** The address of the place it is in: root, company:hv, dept:<id>, person:<staff id>, folder:<id>. */
  parent: string
  createdAt: string
  createdBy: string
}

export interface DriveFile extends DriveItem {
  id: string
  ref: string
  fileName: string
  contentType: string | null
  size: number | null
  parent: string
  uploadedAt: string
  uploadedBy: string
  /** Deleted: its row and trail stay, greyed under "Show deleted"; its file is gone from the bucket. */
  deletedAt: string | null
  events: DocEvent[]
}

/** Something in the Bin (2026-10-13): a file HR kept or a folder HR made, deleted; it waits 30 days, then goes. */
export interface DriveBinItem {
  id: string
  kind: 'file' | 'folder'
  name: string
  /** Where it was: the address of the place it was in. */
  at: string
  /** A folder's own id: a folder:<id> another item was in may be this one, in the Bin too. */
  folderId: string | null
  fileId: string | null
  ref: string
  contentType: string | null
  size: number | null
  deletedAt: string
  deletedBy: string
  /** When the hourly sweep deletes it for good. */
  expiresAt: string
}

export interface Drive {
  folders: DriveFolder[]
  files: DriveFile[]
  /** The Bin, newest first. */
  bin: DriveBinItem[]
  /**
   * When it was read, by the server's clock (`loadDrive`) — the Bin's days are counted from it, fresh after every
   * write and the same on the server and in the browser. '' when not known.
   */
  readAt: string
  /** The reader may lock things View only me: a login of their own, their title on the ladder. */
  canLock: boolean
}

export const EMPTY_DRIVE: Drive = { folders: [], files: [], bin: [], readAt: '', canLock: false }

// ── Reading the database's answer ───────────────────────────────────────────

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {})
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])
const str = (v: unknown): string => (typeof v === 'string' ? v : '')
const strOrNull = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null)
const numOrNull = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v !== '' && Number.isFinite(Number(v)) ? Number(v) : null
const boolOrNull = (v: unknown): boolean | null => (typeof v === 'boolean' ? v : null)

/** Its lock, its share and whether its person sees it (mig 20261014190000). */
function itemOf(x: Record<string, unknown>): DriveItem {
  const lock = obj(x.lock)
  return {
    lock: x.lock && typeof x.lock === 'object' ? { by: str(lock.by) || 'HR', mine: lock.mine === true, at: str(lock.at) } : null,
    memberView: boolOrNull(x.memberView),
    memberSees: boolOrNull(x.memberSees),
  }
}

/** `hr_drive()`'s answer. */
export function driveFromRow(raw: unknown): Drive | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const o = raw as Record<string, unknown>
  return {
    folders: arr(o.folders).flatMap(f => {
      const x = obj(f)
      return str(x.id)
        ? [{ id: str(x.id), name: str(x.name), parent: str(x.parent) || ROOT, createdAt: str(x.createdAt), createdBy: str(x.createdBy), ...itemOf(x) }]
        : []
    }),
    files: arr(o.files).flatMap(f => {
      const x = obj(f)
      if (!str(x.id)) return []
      return [{
        id: str(x.id),
        ref: str(x.ref),
        fileName: str(x.fileName),
        contentType: strOrNull(x.contentType),
        size: numOrNull(x.size),
        parent: str(x.parent) || ROOT,
        uploadedAt: str(x.uploadedAt),
        uploadedBy: str(x.uploadedBy),
        deletedAt: strOrNull(x.deletedAt),
        events: arr(x.events).map(e => {
          const y = obj(e)
          return { what: str(y.what), at: str(y.at), who: str(y.who), note: str(y.note) }
        }),
        ...itemOf(x),
      }]
    }),
    bin: arr(o.bin).flatMap(b => {
      const x = obj(b)
      const kind = str(x.kind)
      if (!str(x.id) || (kind !== 'file' && kind !== 'folder')) return []
      return [{
        id: str(x.id),
        kind,
        name: str(x.name),
        at: str(x.at) || ROOT,
        folderId: strOrNull(x.folderId),
        fileId: strOrNull(x.fileId),
        ref: str(x.ref),
        contentType: strOrNull(x.contentType),
        size: numOrNull(x.size),
        deletedAt: str(x.deletedAt),
        deletedBy: str(x.deletedBy),
        expiresAt: str(x.expiresAt),
      }]
    }),
    readAt: '',
    canLock: obj(o.me).canLock === true,
  }
}

// ── Places ──────────────────────────────────────────────────────────────────

export type PlaceKind = 'root' | 'company' | 'dept' | 'person' | 'folder'

/** An address read back: what kind of place, and whose id. */
export function parsePlace(at: string | null | undefined): { kind: PlaceKind; id: string } | null {
  if (at === ROOT) return { kind: 'root', id: '' }
  if (at === HV) return { kind: 'company', id: 'hv' }
  const m = /^(dept|person|folder):([0-9a-f-]{36})$/i.exec(at ?? '')
  return m ? { kind: m[1].toLowerCase() as 'dept' | 'person' | 'folder', id: m[2].toLowerCase() } : null
}

export const deptAt = (id: string) => `dept:${id}`
export const personAt = (id: string) => `person:${id}`
export const folderAt = (id: string) => `folder:${id}`

type Tree = Pick<Documentation, 'departments' | 'people' | 'letters' | 'letterTypes'>

/** Whether an address is still a place (a folder deleted, a person gone, a department emptied — not any more). */
export function placeExists(at: string, doc: Tree, drive: Drive): boolean {
  const p = parsePlace(at)
  if (!p) return false
  if (p.kind === 'root' || p.kind === 'company') return true
  if (p.kind === 'dept') return doc.departments.some(d => d.id === p.id)
  if (p.kind === 'person') return doc.people.some(x => x.id === p.id)
  return drive.folders.some(f => f.id === p.id)
}

/** A person's folder sits in their department, or in HOUZS Venture when they have none. */
function personParent(doc: Tree, id: string): string {
  const dept = doc.people.find(p => p.id === id)?.departmentId
  return dept && doc.departments.some(d => d.id === dept) ? deptAt(dept) : HV
}

/** The place a place is in — null for the Data center itself. */
export function parentOf(at: string, doc: Tree, drive: Drive): string | null {
  const p = parsePlace(at)
  if (!p || p.kind === 'root') return null
  if (p.kind === 'company') return ROOT
  if (p.kind === 'dept') return HV
  if (p.kind === 'person') return personParent(doc, p.id)
  return drive.folders.find(f => f.id === p.id)?.parent ?? ROOT
}

/** A place's own name. */
export function placeName(at: string, doc: Tree, drive: Drive): string {
  const p = parsePlace(at)
  if (!p) return ''
  if (p.kind === 'root') return 'Data center'
  if (p.kind === 'company') return HV_NAME
  if (p.kind === 'dept') return deptLabel(doc.departments.find(d => d.id === p.id)?.name ?? '')
  if (p.kind === 'person') return doc.people.find(x => x.id === p.id)?.name ?? ''
  return drive.folders.find(f => f.id === p.id)?.name ?? ''
}

/** Data center › HOUZS Venture › Revenue › KRIS — from the top to the place itself. */
export function crumbs(at: string, doc: Tree, drive: Drive): Array<{ at: string; name: string }> {
  const out: Array<{ at: string; name: string }> = []
  const seen = new Set<string>()
  let cur: string | null = placeExists(at, doc, drive) ? at : ROOT
  while (cur && !seen.has(cur)) {
    seen.add(cur)
    out.unshift({ at: cur, name: placeName(cur, doc, drive) })
    cur = parentOf(cur, doc, drive)
  }
  return out
}

/** "HOUZS Venture › Revenue" — the path of the place a thing is in, for a search result. */
export function pathLine(at: string, doc: Tree, drive: Drive): string {
  return crumbs(at, doc, drive).slice(1).map(c => c.name).join(' › ') || 'Data center'
}

// ── What a place holds ──────────────────────────────────────────────────────

export interface FolderCard {
  at: string
  kind: 'company' | 'dept' | 'person' | 'folder'
  name: string
  /** "7 departments · 60 people", "Team Leader · 2 letters", "3 folders · 2 files". */
  line: string
  /** People of it whose compulsory letter is missing — the red "!" (a person's: 1 or 0). */
  missing: number
  /** What is missing, in words, for the "!"'s title. */
  missingWhy: string
  /** Made by HR: renamed and deleted with Documentation · Edit. A folder made by itself has no menu. */
  own: boolean
  /** A folder HR made (2026-10-14): View only me, and — in a person's folder — its share and whether they see it. */
  lock?: DriveLock | null
  memberView?: boolean | null
  memberSees?: boolean | null
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

/** What a folder HR made holds, in words. */
function contentsLine(at: string, drive: Drive): string {
  const folders = drive.folders.filter(f => f.parent === at).length
  const files = drive.files.filter(f => f.parent === at && !f.deletedAt).length
  if (!folders && !files) return 'Empty'
  return [folders ? plural(folders, 'folder') : '', files ? plural(files, 'file') : ''].filter(Boolean).join(' · ')
}

/** A folder HR made, as a card. */
function ownCard(f: DriveFolder, drive: Drive): FolderCard {
  return {
    at: folderAt(f.id),
    kind: 'folder',
    name: f.name,
    line: contentsLine(folderAt(f.id), drive),
    missing: 0,
    missingWhy: '',
    own: true,
    lock: f.lock,
    memberView: f.memberView,
    memberSees: f.memberSees,
  }
}

/** The folders HR made in a place, as cards (by name). */
function ownCards(at: string, drive: Drive): FolderCard[] {
  return drive.folders
    .filter(f => f.parent === at)
    .sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }))
    .map(f => ownCard(f, drive))
}

function personCard(p: DataCenterPerson, drive: Drive): FolderCard {
  // What HR keeps for them beside their letters (2026-10-14).
  const at = personAt(p.id)
  const folders = drive.folders.filter(f => f.parent === at).length
  const files = drive.files.filter(f => f.parent === at && !f.deletedAt).length
  return {
    at,
    kind: 'person',
    name: p.name,
    line: [p.title, plural(p.letters, 'letter'), folders ? plural(folders, 'folder') : '', files ? plural(files, 'file') : ''].filter(Boolean).join(' · '),
    missing: p.missing ? 1 : 0,
    missingWhy: p.missing,
    own: false,
  }
}

/**
 * The folders in a place: what is there by itself first (HOUZS Venture, its departments, their people), then HR's —
 * a person's folder holds only HR's (since 2026-10-14; their letters are drawn as their record).
 */
export function folderCards(at: string, doc: Tree, drive: Drive): FolderCard[] {
  const p = parsePlace(at)
  if (!p) return []
  if (p.kind === 'person') return ownCards(at, drive)
  const people = dataCenterPeople(doc)
  if (p.kind === 'root') {
    const missing = people.filter(x => x.missing).length
    return [
      {
        at: HV,
        kind: 'company',
        name: HV_NAME,
        line: `${plural(doc.departments.length, 'department')} · ${plural(people.length, 'person', 'people')}`,
        missing,
        missingWhy: missing ? `${plural(missing, 'person', 'people')} missing a compulsory letter` : '',
        own: false,
      },
      ...ownCards(ROOT, drive),
    ]
  }
  if (p.kind === 'company') {
    const depts = doc.departments.map(d => {
      const mine = people.filter(x => x.departmentId === d.id)
      const missing = mine.filter(x => x.missing).length
      const extra = drive.folders.filter(f => f.parent === deptAt(d.id)).length
      return {
        at: deptAt(d.id),
        kind: 'dept' as const,
        name: deptLabel(d.name),
        line: [plural(mine.length, 'person', 'people'), extra ? plural(extra, 'folder') : ''].filter(Boolean).join(' · '),
        missing,
        missingWhy: missing ? `${plural(missing, 'person', 'people')} missing a compulsory letter` : '',
        own: false,
      }
    })
    // Somebody active with no department of the Data center's lands in HOUZS Venture itself.
    const known = new Set(doc.departments.map(d => d.id))
    const loose = people.filter(x => !x.departmentId || !known.has(x.departmentId)).map(x => personCard(x, drive))
    return [...depts, ...loose, ...ownCards(HV, drive)]
  }
  if (p.kind === 'dept') {
    return [...people.filter(x => x.departmentId === p.id).map(x => personCard(x, drive)), ...ownCards(at, drive)]
  }
  return ownCards(at, drive)
}

/** The files HR keeps in a place — a person's folder too, beside their letters; deleted ones only when asked. */
export function placeFiles(at: string, drive: Drive, withDeleted = false): DriveFile[] {
  return drive.files
    .filter(f => f.parent === at && (withDeleted || !f.deletedAt))
    .sort((a, b) => Number(!!a.deletedAt) - Number(!!b.deletedAt) || a.fileName.localeCompare(b.fileName, 'en', { sensitivity: 'base' }))
}

/** Where a new folder or file may go: anywhere — a person's folder too, since 2026-10-14 (the database refused it before). */
export function takesFolders(at: string): boolean {
  return !!parsePlace(at)
}

/**
 * The person whose folder a place is in — the person's folder itself, or a folder HR made somewhere inside it — or
 * null. What is there may be shared with them (2026-10-14).
 */
export function personOf(at: string, drive: Pick<Drive, 'folders'>): string | null {
  const seen = new Set<string>()
  let cur: string | undefined = at
  while (cur && !seen.has(cur)) {
    seen.add(cur)
    const p = parsePlace(cur)
    if (!p || p.kind !== 'folder') return p?.kind === 'person' ? p.id : null
    cur = drive.folders.find(f => f.id === p.id)?.parent
  }
  return null
}

/** "Only you and above", "Only Alvin and above" — a lock's words for its badge and its menu. */
export function lockWords(lock: DriveLock): string {
  return lock.mine ? 'Only you and above' : `Only ${lock.by} and above`
}

/** Why a folder name will not do here — or null. The database asks the same (`hr_drive_name_taken`). */
export function folderNameRefusal(name: string, at: string, doc: Tree, drive: Drive, except?: string): string | null {
  const n = name.trim()
  if (!n) return 'Name the folder.'
  if (n.length > 80) return 'Keep the name under 80 characters.'
  if (/[/\\]/.test(n)) return 'A folder’s name cannot hold a slash.'
  const lower = n.toLowerCase()
  const taken = folderCards(at, doc, drive).some(c => c.name.trim().toLowerCase() === lower && c.at !== (except ? folderAt(except) : ''))
  return taken ? `${n} is here already.` : null
}

// ── A file's tile ────────────────────────────────────────────────────────────

export type FileTone = 'pdf' | 'sheet' | 'doc' | 'image' | 'other'

/** Which colour a file's tile wears: a PDF red, a sheet green, a Word file blue, a picture plum. */
export function fileTone(fileName: string, contentType: string | null): FileTone {
  const ext = fileExt(fileName).toLowerCase()
  const type = contentType ?? ''
  if (ext === 'pdf' || type === 'application/pdf') return 'pdf'
  if (['xls', 'xlsx', 'csv'].includes(ext) || /spreadsheet|ms-excel|text\/csv/.test(type)) return 'sheet'
  if (['doc', 'docx'].includes(ext) || /wordprocessing|msword/.test(type)) return 'doc'
  if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'heic'].includes(ext) || type.startsWith('image/')) return 'image'
  return 'other'
}

/** "2.4 MB", "980 KB" — a file's size on its card. */
export function sizeLabel(bytes: number | null): string {
  if (bytes === null || bytes < 0) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`
}

// ── Search ──────────────────────────────────────────────────────────────────

export type SearchHit =
  | { kind: 'place'; card: FolderCard; path: string }
  | { kind: 'file'; file: DriveFile; path: string }
  | { kind: 'letter'; letter: PersonLetter; path: string }

/**
 * Anything in the Data center whose name holds the words: departments, people, folders HR made, their files and
 * the letters on file (by file or letter type). At most 60, places first.
 */
export function searchDrive(query: string, doc: Tree, drive: Drive): SearchHit[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const has = (s: string) => s.toLowerCase().includes(q)
  const people = dataCenterPeople(doc)
  const places: SearchHit[] = [
    ...doc.departments.filter(d => has(deptLabel(d.name))).flatMap(d => folderCards(HV, doc, drive).filter(c => c.at === deptAt(d.id))),
    ...people.filter(p => has(p.name) || has(p.code ?? '')).map(p => personCard(p, drive)),
    ...drive.folders.filter(f => has(f.name)).map(f => ownCard(f, drive)),
  ].map(card => ({ kind: 'place' as const, card, path: pathLine(parentOf(card.at, doc, drive) ?? ROOT, doc, drive) }))
  const files: SearchHit[] = drive.files
    .filter(f => !f.deletedAt && has(f.fileName))
    .map(file => ({ kind: 'file' as const, file, path: pathLine(file.parent, doc, drive) }))
  const letters: SearchHit[] = liveLetters(doc.letters)
    .filter(l => has(l.fileName) || has(l.typeName))
    .map(letter => ({ kind: 'letter' as const, letter, path: pathLine(personAt(letter.staffId), doc, drive) }))
  return [...places, ...files, ...letters].slice(0, 60)
}

// ── Move to… (2026-10-13) ───────────────────────────────────────────────────

/**
 * Every place a folder or a file HR keeps may be moved or copied to, top down, each with its path ("HOUZS Venture ›
 * Revenue"): the Data center itself, HOUZS Venture, its departments, each person's folder (since 2026-10-14) and the
 * folders HR made — never `from` (a folder) or anything inside it. The Talent Bank's twin is lib/hiring/bank.ts
 * `moveTargets`.
 */
export function moveTargets(doc: Tree, drive: Drive, from: string): Array<{ at: string; path: string; depth: number }> {
  const out: Array<{ at: string; path: string; depth: number }> = [{ at: ROOT, path: 'Data center', depth: 0 }]
  const walk = (at: string, depth: number) => {
    for (const card of folderCards(at, doc, drive)) {
      if (card.at === from) continue
      out.push({ at: card.at, path: pathLine(card.at, doc, drive), depth })
      walk(card.at, depth + 1)
    }
  }
  walk(ROOT, 1)
  return out
}

/** A copy's name in the same place, as Drive names it: "Copy of Offer.pdf". (A folder's the database picks.) */
export function copyName(fileName: string): string {
  return `Copy of ${fileName}`.slice(0, 200)
}

// ── The Bin (2026-10-13) ────────────────────────────────────────────────────

const DAY = 86_400_000

/** Whole days until the hourly sweep deletes it — 1 on its last day. Shared with the Talent Bank's Bin. */
export function binDaysLeft(item: { expiresAt: string }, now: number): number {
  const t = Date.parse(item.expiresAt)
  return Number.isFinite(t) ? Math.max(0, Math.ceil((t - now) / DAY)) : 0
}

/** "29 days left", "1 day left". */
export function binLeftLabel(days: number): string {
  return days === 1 ? '1 day left' : `${days} days left`
}

/**
 * Where something in the Bin was, in words — "HOUZS Venture › Revenue", "Carres › Sales". A folder in the Bin is
 * named through the Bin (the tree no longer draws it).
 */
export function binFrom(item: DriveBinItem, doc: Tree, drive: Drive): string {
  return binWords(item.at, doc, drive, new Set())
}

function binWords(at: string, doc: Tree, drive: Drive, seen: Set<string>): string {
  const p = parsePlace(at)
  if (!p || p.kind === 'root') return 'Data center'
  if (p.kind !== 'folder') return pathLine(at, doc, drive)
  if (seen.has(at)) return 'Data center'
  seen.add(at)
  const live = drive.folders.find(f => f.id === p.id)
  const binned = drive.bin.find(b => b.kind === 'folder' && b.folderId === p.id)
  const folder = live ? { name: live.name, parent: live.parent } : binned ? { name: binned.name, parent: binned.at } : null
  if (!folder) return 'Data center'
  return parsePlace(folder.parent)?.kind === 'root' ? folder.name : `${binWords(folder.parent, doc, drive, seen)} › ${folder.name}`
}

/** The Bin as the Drive draws a place: its folders, then its files — newest first in each. */
export function binSections(bin: readonly DriveBinItem[]): { folders: DriveBinItem[]; files: DriveBinItem[] } {
  return { folders: bin.filter(b => b.kind === 'folder'), files: bin.filter(b => b.kind === 'file') }
}

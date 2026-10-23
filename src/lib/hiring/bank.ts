import type { FolderCard } from '@/lib/documentation/drive'
import { reasonLabel } from './reasons'
import type { HiringRequest, HiringTalent } from './types'

/**
 * Hiring › Talent Bank as a Drive (2026-10-12 — the user: "talent bank need be like google drive as well, can create
 * new file, and name as well. then the current venture same as well. so when save or upload can detect and locate
 * file"; asked: company › department › people; the companies and departments come both from Admin › Guest Link ›
 * Subsidiaries & departments and from folders HR makes; HR's folders hold people and files).
 *
 * The tree, pure and tested. Every place has an address the page keeps in its URL (`?in=`):
 *
 *   root                        the Talent Bank: HOUZS Venture, the guest link's companies, folders HR made there
 *   company:hv / company:<id>   a company: its departments, folders HR made there, people kept at its level
 *   dept:<hv|id>:<name>         a department: its people and the folders HR made there
 *   folder:<id>                 a folder HR made: folders, people and files
 *   talent:<id>                 a person: their record (the panel and their own page, as before)
 *
 * HOUZS Venture's departments are Hiring › Form settings' Department choices by their first part; a subsidiary's are
 * the guest link's list. A department nobody lists any more stays while something is in it. `hiring_bank()` (mig
 * 20261013030000) answers the companies, the folders and files HR keeps, and where each talent is; a talent saved
 * from a request is placed by the database by name (`hiring_bank_locate`) — `savedIn` says where, before it is.
 *
 * The Bin (mig 20261013061500, `?in=bin`): what was deleted in the last 30 days — a file, a folder, a person, a file
 * taken off a person — none of it in the tree any more; `binFrom` says where each was.
 */

export const ROOT = 'root'
/** The Bin's address: not a place of the tree — what was deleted in the last 30 days (`?in=bin`). */
export const BIN = 'bin'
export const HV = 'company:hv'
/** The portal's own company — always the first folder of the bank. */
export const HV_NAME = 'HOUZS Venture'
export const BANK_NAME = 'Talent Bank'

export interface BankSub {
  id: string
  code: string
  name: string
  departments: string[]
  /** Taken off Admin › Guest Link's list: it stays in the bank only while something is in it. */
  removed: boolean
}

export interface BankFolder {
  id: string
  name: string
  /** The address of the place it is in. */
  parent: string
  createdAt: string
  createdBy: string
}

export interface BankFile {
  id: string
  name: string
  contentType: string | null
  size: number | null
  parent: string
  addedAt: string
  addedBy: string
}

/**
 * Something in the Bin (2026-10-13 — the user: "make a bin, then that bin will last for 30 days. file that last for
 * more than 30days in bin, will auto delete"): a file kept in a place, a folder HR made, a person, or a file taken off a
 * person. It waits 30 days, then the hourly sweep deletes it (mig 20261013061500).
 */
export type BinKind = 'file' | 'folder' | 'talent' | 'talent_file'

export interface BinItem {
  id: string
  kind: BinKind
  name: string
  /** Where it was: its place's address (a person's file: '' — it was on `talentName`). */
  at: string
  /** A folder's own id: a folder:<id> another item was in may be this one, in the Bin too. */
  folderId: string | null
  talentId: string | null
  /** A person's file: whose it was. */
  talentName: string
  /** A person's file: its type (Résumé, IC …). */
  fileType: string
  contentType: string | null
  size: number | null
  deletedAt: string
  deletedBy: string
  /** When the hourly sweep deletes it for good. */
  expiresAt: string
}

export interface Bank {
  /** HOUZS Venture's departments, in Form settings' order. */
  hq: string[]
  subs: BankSub[]
  folders: BankFolder[]
  files: BankFile[]
  /** Where each talent in the bank is: talent id → address. */
  places: Record<string, string>
  /** The Bin, newest first. */
  bin: BinItem[]
  /**
   * When it was read, by the server's clock (`loadTalentBank`) — the Bin's days are counted from it, so they are fresh
   * after every write, and the same on the server and in the browser. '' when not known.
   */
  readAt: string
}

export const EMPTY_BANK: Bank = { hq: [], subs: [], folders: [], files: [], places: {}, bin: [], readAt: '' }

/** What the tree is read from: the bank's own answer and the people in it (the board's talents). */
export interface BankTree {
  bank: Bank
  talents: readonly HiringTalent[]
}

// ── Reading the database's answer ───────────────────────────────────────────

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {})
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])
const str = (v: unknown): string => (typeof v === 'string' ? v : '')
const strOrNull = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null)
const numOrNull = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v !== '' && Number.isFinite(Number(v)) ? Number(v) : null
const names = (v: unknown): string[] => arr(v).filter((x): x is string => typeof x === 'string' && x.trim() !== '').map(x => x.trim())

/** `hiring_bank()`'s answer — every department address in its list's own spelling (the lists are matched by name, any case). */
export function bankFromRow(raw: unknown): Bank | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const o = raw as Record<string, unknown>
  const places: Record<string, string> = {}
  for (const [k, v] of Object.entries(obj(o.places))) if (typeof v === 'string' && v) places[k] = v
  const bank: Bank = {
    hq: names(o.hq),
    subs: arr(o.subs).flatMap(x => {
      const s = obj(x)
      return str(s.id) ? [{ id: str(s.id), code: str(s.code), name: str(s.name), departments: names(s.departments), removed: s.removed === true }] : []
    }),
    folders: arr(o.folders).flatMap(x => {
      const f = obj(x)
      return str(f.id) ? [{ id: str(f.id), name: str(f.name), parent: str(f.parent) || ROOT, createdAt: str(f.createdAt), createdBy: str(f.createdBy) }] : []
    }),
    files: arr(o.files).flatMap(x => {
      const f = obj(x)
      if (!str(f.id)) return []
      return [{
        id: str(f.id),
        name: str(f.name),
        contentType: strOrNull(f.contentType),
        size: numOrNull(f.size),
        parent: str(f.parent) || ROOT,
        addedAt: str(f.addedAt),
        addedBy: str(f.addedBy),
      }]
    }),
    places,
    bin: arr(o.bin).flatMap(x => {
      const b = obj(x)
      const kind = str(b.kind)
      if (!str(b.id) || !BIN_KINDS.includes(kind as BinKind)) return []
      return [{
        id: str(b.id),
        kind: kind as BinKind,
        name: str(b.name),
        at: str(b.at),
        folderId: strOrNull(b.folderId),
        talentId: strOrNull(b.talentId),
        talentName: str(b.talentName),
        fileType: str(b.fileType),
        contentType: strOrNull(b.contentType),
        size: numOrNull(b.size),
        deletedAt: str(b.deletedAt),
        deletedBy: str(b.deletedBy),
        expiresAt: str(b.expiresAt),
      }]
    }),
    readAt: '',
  }
  const listed = (at: string) => {
    const p = parsePlace(at)
    if (p?.kind !== 'dept') return at
    const named = listedDepts(p.co, bank).find(d => lower(d) === lower(p.dept))
    return deptAt(p.co, named ?? p.dept.trim())
  }
  return {
    ...bank,
    folders: bank.folders.map(f => ({ ...f, parent: listed(f.parent) })),
    files: bank.files.map(f => ({ ...f, parent: listed(f.parent) })),
    places: Object.fromEntries(Object.entries(bank.places).map(([k, v]) => [k, listed(v)])),
    bin: bank.bin.map(b => (b.at ? { ...b, at: listed(b.at) } : b)),
  }
}

const BIN_KINDS: readonly BinKind[] = ['file', 'folder', 'talent', 'talent_file']

// ── Addresses ───────────────────────────────────────────────────────────────

export type PlaceKind = 'root' | 'company' | 'dept' | 'folder' | 'talent'
/** An address read back: `co` is 'hv' or a subsidiary's id (a company, a department); `id` a folder's or a talent's. */
export interface Place {
  kind: PlaceKind
  co: string
  dept: string
  id: string
}

export const companyAt = (co: string) => `company:${co}`
export const deptAt = (co: string, name: string) => `dept:${co}:${name}`
export const folderAt = (id: string) => `folder:${id}`
export const talentAt = (id: string) => `talent:${id}`

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const lower = (s: string) => s.trim().toLowerCase()

export function parsePlace(at: string | null | undefined): Place | null {
  const a = at ?? ''
  if (a === ROOT) return { kind: 'root', co: '', dept: '', id: '' }
  const m = /^(company|folder|talent):(.+)$/.exec(a)
  if (m) {
    if (m[1] === 'company') return m[2] === 'hv' || UUID.test(m[2]) ? { kind: 'company', co: m[2].toLowerCase(), dept: '', id: '' } : null
    return UUID.test(m[2]) ? { kind: m[1] as 'folder' | 'talent', co: '', dept: '', id: m[2].toLowerCase() } : null
  }
  const d = /^dept:([^:]+):(.+)$/.exec(a)
  if (d && (d[1] === 'hv' || UUID.test(d[1])) && d[2].trim()) return { kind: 'dept', co: d[1].toLowerCase(), dept: d[2], id: '' }
  return null
}

/** Where a talent is — the database's answer, or (read before it placed them) their department in HOUZS Venture. */
export function placeOfTalent(t: Pick<HiringTalent, 'id' | 'department'>, bank: Bank): string {
  const at = bank.places[t.id]
  if (at) return at
  return deptAt('hv', bank.hq.find(d => lower(d) === lower(t.department)) ?? t.department.trim())
}

/** An address as the tree names it: a department in its own spelling (an old link may say "sales" for Sales). */
export function canonicalAt(at: string, tree: BankTree): string {
  const p = parsePlace(at)
  if (p?.kind !== 'dept') return at
  const named = departmentsOf(p.co, tree).find(d => lower(d) === lower(p.dept))
  return named ? deptAt(p.co, named) : at
}

// ── Companies and their departments ─────────────────────────────────────────

/** Every address something sits in: the people, HR's folders, its files. */
function occupied(tree: BankTree): string[] {
  return [
    ...tree.talents.map(t => placeOfTalent(t, tree.bank)),
    ...tree.bank.folders.map(f => f.parent),
    ...tree.bank.files.map(f => f.parent),
  ]
}

function listedDepts(co: string, bank: Bank): string[] {
  return co === 'hv' ? bank.hq : bank.subs.find(s => s.id === co)?.departments ?? []
}

/** A company's departments: those it lists, then any one something is still in (named as it was). */
export function departmentsOf(co: string, tree: BankTree): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  const add = (d: string) => {
    if (!d.trim() || seen.has(lower(d))) return
    seen.add(lower(d))
    out.push(d.trim())
  }
  listedDepts(co, tree.bank).forEach(add)
  for (const at of occupied(tree)) {
    const p = parsePlace(at)
    if (p?.kind === 'dept' && p.co === co) add(p.dept)
  }
  return out
}

/** The company a place is in at the very top — or the folder HR made at the top, or nothing (the bank itself). */
function topOf(at: string, tree: BankTree): string | null {
  let cur: string | null = at
  const seen = new Set<string>()
  while (cur && !seen.has(cur)) {
    seen.add(cur)
    const p = parsePlace(cur)
    if (!p || p.kind === 'root') return null
    if (p.kind === 'company') return cur
    if (p.kind === 'dept') return companyAt(p.co)
    const parent = parentOfRaw(cur, tree)
    if (parent === ROOT) return cur
    cur = parent
  }
  return null
}

/** The companies of the bank: HOUZS Venture, the guest link's list, and one taken off it while it still holds something. */
export function companiesOf(tree: BankTree): Array<{ co: string; name: string; removed: boolean }> {
  const held = new Set(occupied(tree).map(at => topOf(at, tree)).filter((x): x is string => !!x))
  return [
    { co: 'hv', name: HV_NAME, removed: false },
    ...tree.bank.subs.filter(s => !s.removed || held.has(companyAt(s.id))).map(s => ({ co: s.id, name: s.name, removed: s.removed })),
  ]
}

// ── Places ──────────────────────────────────────────────────────────────────

function parentOfRaw(at: string, tree: BankTree): string | null {
  const p = parsePlace(at)
  if (!p || p.kind === 'root') return null
  if (p.kind === 'company') return ROOT
  if (p.kind === 'dept') return companyAt(p.co)
  if (p.kind === 'talent') {
    const t = tree.talents.find(x => x.id === p.id)
    return t ? placeOfTalent(t, tree.bank) : ROOT
  }
  return tree.bank.folders.find(f => f.id === p.id)?.parent ?? ROOT
}

/** The place a place is in — null for the bank itself. */
export function parentOf(at: string, tree: BankTree): string | null {
  return parentOfRaw(at, tree)
}

/** Whether an address is still a place (a folder deleted, a talent removed, a department emptied — not any more). */
export function placeExists(at: string, tree: BankTree): boolean {
  const p = parsePlace(at)
  if (!p) return false
  if (p.kind === 'root') return true
  if (p.kind === 'company') return companiesOf(tree).some(c => c.co === p.co)
  if (p.kind === 'dept') return companiesOf(tree).some(c => c.co === p.co) && departmentsOf(p.co, tree).some(d => lower(d) === lower(p.dept))
  if (p.kind === 'talent') return tree.talents.some(t => t.id === p.id)
  return tree.bank.folders.some(f => f.id === p.id)
}

/** A place's own name. */
export function placeName(at: string, tree: BankTree): string {
  const p = parsePlace(at)
  if (!p) return ''
  if (p.kind === 'root') return BANK_NAME
  if (p.kind === 'company') return p.co === 'hv' ? HV_NAME : tree.bank.subs.find(s => s.id === p.co)?.name ?? ''
  if (p.kind === 'dept') return departmentsOf(p.co, tree).find(d => lower(d) === lower(p.dept)) ?? p.dept
  if (p.kind === 'talent') return tree.talents.find(t => t.id === p.id)?.name ?? ''
  return tree.bank.folders.find(f => f.id === p.id)?.name ?? ''
}

/** Talent Bank › Carres › Sales › Ali — from the top to the place itself. */
export function crumbs(at: string, tree: BankTree): Array<{ at: string; name: string }> {
  const out: Array<{ at: string; name: string }> = []
  const seen = new Set<string>()
  let cur: string | null = placeExists(at, tree) ? at : ROOT
  while (cur && !seen.has(cur)) {
    seen.add(cur)
    out.unshift({ at: cur, name: placeName(cur, tree) })
    cur = parentOf(cur, tree)
  }
  return out
}

/** "Carres › Sales" — where a place is, in words (the bank itself for the top). */
export function pathLine(at: string, tree: BankTree): string {
  return crumbs(at, tree).slice(1).map(c => c.name).join(' › ') || BANK_NAME
}

/** Whether an address is the place itself or anywhere inside it. */
function within(addr: string, at: string, tree: BankTree): boolean {
  let cur: string | null = addr
  const seen = new Set<string>()
  while (cur && !seen.has(cur)) {
    if (cur === at) return true
    seen.add(cur)
    cur = parentOf(cur, tree)
  }
  return false
}

// ── What a place holds ──────────────────────────────────────────────────────

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

function peopleUnder(at: string, tree: BankTree): number {
  return tree.talents.filter(t => within(placeOfTalent(t, tree.bank), at, tree)).length
}

/** What a folder HR made holds, in words. */
function contentsLine(at: string, tree: BankTree): string {
  const folders = tree.bank.folders.filter(f => f.parent === at).length
  const people = tree.talents.filter(t => placeOfTalent(t, tree.bank) === at).length
  const files = tree.bank.files.filter(f => f.parent === at).length
  const parts = [folders ? plural(folders, 'folder') : '', people ? plural(people, 'person', 'people') : '', files ? plural(files, 'file') : '']
  return parts.filter(Boolean).join(' · ') || 'Empty'
}

function ownCards(at: string, tree: BankTree): FolderCard[] {
  return tree.bank.folders
    .filter(f => f.parent === at)
    .sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }))
    .map(f => ({ at: folderAt(f.id), kind: 'folder' as const, name: f.name, line: contentsLine(folderAt(f.id), tree), missing: 0, missingWhy: '', own: true }))
}

function companyCard(c: { co: string; name: string; removed: boolean }, tree: BankTree): FolderCard {
  const at = companyAt(c.co)
  const line = [plural(departmentsOf(c.co, tree).length, 'department'), plural(peopleUnder(at, tree), 'person', 'people')]
  return { at, kind: 'company', name: c.name, line: line.join(' · ') + (c.removed ? ' · off the guest link' : ''), missing: 0, missingWhy: '', own: false }
}

function deptCard(co: string, d: string, tree: BankTree): FolderCard {
  const at = deptAt(co, d)
  const folders = tree.bank.folders.filter(f => f.parent === at).length
  const line = [plural(peopleUnder(at, tree), 'person', 'people'), folders ? plural(folders, 'folder') : ''].filter(Boolean).join(' · ')
  return { at, kind: 'dept', name: d, line, missing: 0, missingWhy: '', own: false }
}

/**
 * The folders in a place, as the Data center's cards: what is there by itself first (the companies, a company's
 * departments), then the folders HR made there.
 */
export function folderCards(at: string, tree: BankTree): FolderCard[] {
  const p = parsePlace(at)
  if (!p || p.kind === 'talent') return []
  if (p.kind === 'root') return [...companiesOf(tree).map(c => companyCard(c, tree)), ...ownCards(ROOT, tree)]
  if (p.kind === 'company') return [...departmentsOf(p.co, tree).map(d => deptCard(p.co, d, tree)), ...ownCards(at, tree)]
  return ownCards(at, tree)
}

/** The people kept right in a place (not in its folders), by name. */
export function talentsIn(at: string, tree: BankTree): HiringTalent[] {
  return tree.talents
    .filter(t => placeOfTalent(t, tree.bank) === at)
    .sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }))
}

/** The files HR keeps right in a place, by name. */
export function placeFiles(at: string, bank: Bank): BankFile[] {
  return bank.files.filter(f => f.parent === at).sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }))
}

/** Where people may be added or moved: a company, a department or a folder — never the bank itself or a person. */
export function holdsPeople(at: string): boolean {
  const p = parsePlace(at)
  return !!p && (p.kind === 'company' || p.kind === 'dept' || p.kind === 'folder')
}

/** Where a folder or a file may go: anywhere but inside a person (their folder is their record). */
export function takesFolders(at: string): boolean {
  const p = parsePlace(at)
  return !!p && p.kind !== 'talent'
}

/** Why a folder name will not do here — or null. The database asks the same (`hiring_bank_name_taken`). */
export function folderNameRefusal(name: string, at: string, tree: BankTree, except?: string): string | null {
  const n = name.trim()
  if (!n) return 'Name the folder.'
  if (n.length > 80) return 'Keep the name under 80 characters.'
  if (/[/\\]/.test(n)) return 'A folder’s name cannot hold a slash.'
  const l = n.toLowerCase()
  const p = parsePlace(at)
  const twin = tree.bank.folders.some(f => f.parent === at && lower(f.name) === l && f.id !== except)
  const byItself =
    (p?.kind === 'root' && (l === lower(HV_NAME) || tree.bank.subs.some(s => !s.removed && lower(s.name) === l))) ||
    (p?.kind === 'company' && listedDepts(p.co, tree.bank).some(d => lower(d) === l))
  return twin || byItself ? `${n} is here already.` : null
}

/**
 * Every place something may be moved to, top down, each with its path ("Carres › Sales › Seniors"). `from` leaves a
 * place and everything in it out (a folder never goes inside itself; a department's people never into its own
 * folders); `withRoot` offers the bank itself too (a folder may sit at the top; a person may not).
 */
export function moveTargets(tree: BankTree, opts: { from?: string; withRoot?: boolean } = {}): Array<{ at: string; path: string; depth: number }> {
  const out: Array<{ at: string; path: string; depth: number }> = opts.withRoot ? [{ at: ROOT, path: BANK_NAME, depth: 0 }] : []
  const walk = (at: string, depth: number) => {
    for (const card of folderCards(at, tree)) {
      if (card.at === opts.from) continue
      out.push({ at: card.at, path: pathLine(card.at, tree), depth })
      walk(card.at, depth + 1)
    }
  }
  walk(ROOT, opts.withRoot ? 1 : 0)
  return out
}

/** What is right in a place (not deeper): its people, folders and files — Move everyone's count. */
export function heldIn(at: string, tree: BankTree): { people: number; folders: number; files: number; line: string } {
  const people = talentsIn(at, tree).length
  const folders = tree.bank.folders.filter(f => f.parent === at).length
  const files = tree.bank.files.filter(f => f.parent === at).length
  const line = [people ? plural(people, 'person', 'people') : '', folders ? plural(folders, 'folder') : '', files ? plural(files, 'file') : ''].filter(Boolean).join(', ')
  return { people, folders, files, line }
}

// ── Saved from a request: where it goes ─────────────────────────────────────

/**
 * Where a candidate saved from this request is kept (the database places them the same way — `hiring_bank_home` and
 * `hiring_bank_locate`): a guest's request in its company and its department; HOUZS Venture's in the department picked.
 */
export function savedIn(request: Pick<HiringRequest, 'source' | 'requesterCompany' | 'answers'>, department: string): { company: string; dept: string; label: string } {
  const guest = request.source === 'guest' && !!request.requesterCompany?.trim()
  const company = guest ? request.requesterCompany!.trim() : HV_NAME
  const asked = (request.answers.dept ?? '').trim()
  const dept = guest ? asked || department.trim() : department.trim() || asked.split(' · ')[0].trim()
  return { company, dept, label: [company, dept].filter(Boolean).join(' › ') }
}

// ── Search ──────────────────────────────────────────────────────────────────

export type BankHit =
  | { kind: 'place'; card: FolderCard; path: string }
  | { kind: 'talent'; talent: HiringTalent; path: string }
  | { kind: 'file'; file: BankFile; path: string }

/** Anything in the bank whose name holds the words — companies, departments, folders, people (and what they fit), files. At most 60, places first. */
export function searchBank(query: string, tree: BankTree): BankHit[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const has = (s: string) => s.toLowerCase().includes(q)
  const places: BankHit[] = moveTargets(tree)
    .filter(x => has(placeName(x.at, tree)))
    .map(x => {
      const card = folderCards(parentOf(x.at, tree) ?? ROOT, tree).find(c => c.at === x.at)
      return card ? { kind: 'place' as const, card, path: pathLine(parentOf(x.at, tree) ?? ROOT, tree) } : null
    })
    .filter((x): x is { kind: 'place'; card: FolderCard; path: string } => !!x)
  const people: BankHit[] = tree.talents
    .filter(t => has(t.name) || has(t.position) || has(t.phone) || has(t.email) || has(t.notes) || (!!t.reason && has(reasonLabel(t.reason))))
    .map(talent => ({ kind: 'talent' as const, talent, path: pathLine(placeOfTalent(talent, tree.bank), tree) }))
  const files: BankHit[] = tree.bank.files.filter(f => has(f.name)).map(file => ({ kind: 'file' as const, file, path: pathLine(file.parent, tree) }))
  return [...places, ...people, ...files].slice(0, 60)
}

// ── The Bin ─────────────────────────────────────────────────────────────────

/** The days left, counted as the Data center's Bin counts them (one rule for both Drives). */
export { binDaysLeft, binLeftLabel } from '@/lib/documentation/drive'

/**
 * Where something in the Bin was, in words — "Carres › Sales"; a person's file, the person. A folder in the Bin is
 * named through the Bin (the tree no longer draws it), a department nobody lists by its own name.
 */
export function binFrom(item: BinItem, tree: BankTree): string {
  if (item.kind === 'talent_file') return item.talentName
  return addressWords(item.at, tree, new Set())
}

function addressWords(at: string, tree: BankTree, seen: Set<string>): string {
  const p = parsePlace(at)
  if (!p || p.kind === 'root' || p.kind === 'talent') return BANK_NAME
  const company = (co: string) => (co === 'hv' ? HV_NAME : tree.bank.subs.find(s => s.id === co)?.name ?? '')
  if (p.kind === 'company') return company(p.co)
  if (p.kind === 'dept') return `${company(p.co)} › ${departmentsOf(p.co, tree).find(d => lower(d) === lower(p.dept)) ?? p.dept.trim()}`
  if (seen.has(at)) return BANK_NAME
  seen.add(at)
  const live = tree.bank.folders.find(f => f.id === p.id)
  const binned = tree.bank.bin.find(b => b.kind === 'folder' && b.folderId === p.id)
  const folder = live ? { name: live.name, parent: live.parent } : binned ? { name: binned.name, parent: binned.at } : null
  if (!folder) return BANK_NAME
  return parsePlace(folder.parent)?.kind === 'root' ? folder.name : `${addressWords(folder.parent, tree, seen)} › ${folder.name}`
}

/** The Bin as the Drive draws a place: its folders, its people, then its files (a person's among them) — newest first. */
export function binSections(bin: readonly BinItem[]): { folders: BinItem[]; people: BinItem[]; files: BinItem[] } {
  return {
    folders: bin.filter(b => b.kind === 'folder'),
    people: bin.filter(b => b.kind === 'talent'),
    files: bin.filter(b => b.kind === 'file' || b.kind === 'talent_file'),
  }
}

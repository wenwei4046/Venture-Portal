// The Library (`Library.dc.html`, ⑥-1): each subsidiary's folders — one of each folder type, the types shared by every
// subsidiary — their files (in R2, ≤ 50 MB) and link folders (Google Drive …); every file under its folder type's
// category; search across every folder; the Dustbin's 30 days. Read from mkt_library(); its writes are the actions'.
// Pure.

import { officeTime } from '@/lib/office-time'
import { shortDay } from './board'

export type LibCat = 'Brand' | 'Product' | 'Photo' | 'Video' | 'Content' | 'Minutes'
export const LIB_CATS: readonly LibCat[] = ['Brand', 'Product', 'Photo', 'Video', 'Content', 'Minutes']
/** A file up to 50 MB is uploaded; a bigger one goes in as a link folder (the user's answer). */
export const LIB_MAX_BYTES = 50 * 1024 * 1024
/** A new folder type's colours (the handoff's six; the database takes no other). */
export const LIB_TYPE_COLORS = [
  'oklch(0.55 0.12 300)', 'oklch(0.58 0.12 50)', 'oklch(0.50 0.08 175)', 'oklch(0.52 0.09 260)', 'oklch(0.62 0.10 80)', 'oklch(0.55 0.12 340)',
] as const
/** How long the Dustbin keeps what is put in it. */
export const BIN_DAYS = 30

export interface LibType { id: string; name: string; color: string; cat: LibCat; link: boolean }
export interface LibSub { id: string; code: string; name: string; emoji: string; dot: string; client: boolean }
export interface LibFolder { id: string; sub: string; type: string; url: string | null; at: string }
export interface LibFile { id: string; folder: string; name: string; path: string; size: number; mime: string; by: string; at: string }
export interface LibTrash { kind: 'file' | 'folder'; id: string; name: string; sub: string; type: string; n: number | null; size: number | null; by: string; at: string }
export interface Library { today: string; types: LibType[]; subs: LibSub[]; folders: LibFolder[]; files: LibFile[]; trash: LibTrash[] }

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const str = (v: unknown) => (typeof v === 'string' ? v : '')
const num = (v: unknown) => (typeof v === 'number' ? v : Number(v) || 0)
const rows = (v: unknown) => (Array.isArray(v) ? v : []).filter(isObj)
const cat = (v: unknown): LibCat => (LIB_CATS as readonly string[]).includes(str(v)) ? (v as LibCat) : 'Content'

export const EMPTY_LIBRARY: Library = { today: '', types: [], subs: [], folders: [], files: [], trash: [] }

/** mkt_library(). */
export function libraryFromRow(v: unknown): Library {
  if (!isObj(v)) return EMPTY_LIBRARY
  return {
    today: str(v.today),
    types: rows(v.types).filter(t => str(t.id)).map(t => ({ id: str(t.id), name: str(t.name), color: str(t.color), cat: cat(t.cat), link: t.link === true })),
    subs: rows(v.subs).filter(s => str(s.id) && str(s.code)).map(s => ({
      id: str(s.id), code: str(s.code), name: str(s.name), emoji: str(s.emoji) || '🏢', dot: str(s.dot), client: s.client === true,
    })),
    folders: rows(v.folders).filter(f => str(f.id)).map(f => ({ id: str(f.id), sub: str(f.sub), type: str(f.type), url: str(f.url) || null, at: str(f.at) })),
    files: rows(v.files).filter(f => str(f.id) && str(f.path)).map(f => ({
      id: str(f.id), folder: str(f.folder), name: str(f.name), path: str(f.path), size: num(f.size), mime: str(f.mime), by: str(f.by), at: str(f.at),
    })),
    trash: rows(v.trash).filter(t => str(t.id)).map(t => ({
      kind: t.kind === 'folder' ? 'folder' : 'file', id: str(t.id), name: str(t.name), sub: str(t.sub), type: str(t.type),
      n: t.n == null ? null : num(t.n), size: t.size == null ? null : num(t.size), by: str(t.by), at: str(t.at),
    })),
  }
}

// ── A file's look ─────────────────────────────────────────────────────────────────
export type FileKind = 'video' | 'image' | 'doc'
export const fileKind = (f: Pick<LibFile, 'mime'>): FileKind => (f.mime.startsWith('video/') ? 'video' : f.mime.startsWith('image/') ? 'image' : 'doc')
/** "PDF", "DOCX" — the name's own ending, else FILE. */
export function extOf(name: string): string {
  const m = /\.([a-z0-9]{1,6})$/i.exec(name)
  return m ? m[1].toUpperCase() : 'FILE'
}
/** "4.5 MB", "842 KB", "12 B". */
export function sizeLabel(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`
  return `${bytes} B`
}
/** The day, the office's: "2 Oct". */
export const libDay = (at: string) => {
  const t = at ? officeTime(at) : null
  return t?.isValid() ? shortDay(t.format('YYYY-MM-DD')) : ''
}

// ── Where the page is ─────────────────────────────────────────────────────────────
export type LibView = { t: 'all' } | { t: 'co'; sub: string } | { t: 'folder'; sub: string; folder: string } | { t: 'bin' }

/** The view a page's address asks for: ?co=CAR, ?folder=<id>, ?bin=1 — anything unknown is everything. */
export function libView(lib: Library, p: { co?: string | null; folder?: string | null; bin?: string | null }): LibView {
  if (p.bin) return { t: 'bin' }
  const folder = p.folder ? lib.folders.find(f => f.id === p.folder) : null
  if (folder) return { t: 'folder', sub: folder.sub, folder: folder.id }
  const sub = p.co ? lib.subs.find(s => s.code === p.co!.toUpperCase()) : null
  return sub ? { t: 'co', sub: sub.id } : { t: 'all' }
}

/** The address of a view (and the filters kept with it). */
export function libHref(lib: Library, v: LibView, keep: { cat?: LibCat | null; q?: string } = {}): string {
  const sp = new URLSearchParams()
  if (v.t === 'bin') sp.set('bin', '1')
  if (v.t === 'co') sp.set('co', lib.subs.find(s => s.id === v.sub)?.code ?? '')
  if (v.t === 'folder') sp.set('folder', v.folder)
  if (keep.cat) sp.set('cat', keep.cat)
  if (keep.q) sp.set('q', keep.q)
  const s = sp.toString()
  return s ? `/marketing/library?${s}` : '/marketing/library'
}

export interface LibIndex {
  type: (id: string) => LibType | undefined
  sub: (id: string) => LibSub | undefined
  folder: (id: string) => LibFolder | undefined
  /** A file's category: its folder type's. */
  catOf: (f: LibFile) => LibCat
  subOf: (f: LibFile) => string
}

export function libIndex(lib: Library): LibIndex {
  const types = new Map(lib.types.map(t => [t.id, t]))
  const subs = new Map(lib.subs.map(s => [s.id, s]))
  const folders = new Map(lib.folders.map(f => [f.id, f]))
  return {
    type: id => types.get(id),
    sub: id => subs.get(id),
    folder: id => folders.get(id),
    catOf: f => types.get(folders.get(f.folder)?.type ?? '')?.cat ?? 'Content',
    subOf: f => folders.get(f.folder)?.sub ?? '',
  }
}

/** The files a view shows — the handoff's: everything's newest twelve, a subsidiary's newest first, a folder's own;
 * a search reaches every folder (but a folder's search stays in it). */
export function viewFiles(lib: Library, v: LibView, f: { cat: LibCat | null; q: string }): LibFile[] {
  const ix = libIndex(lib)
  const q = f.q.trim().toLowerCase()
  const base = lib.files.filter(x => (!f.cat || ix.catOf(x) === f.cat) && (!q || x.name.toLowerCase().includes(q)))
  if (v.t === 'bin') return []
  if (v.t === 'folder') return base.filter(x => x.folder === v.folder)
  if (q) return base
  if (v.t === 'co') return base.filter(x => ix.subOf(x) === v.sub)
  return base.slice(0, 12)
}

/** The rail's counts: files per subsidiary (under the category picked), per category (in the view's reach). */
export function railCounts(lib: Library, v: LibView, c: LibCat | null): { subs: Record<string, number>; all: number; cats: Record<string, number>; catAll: number } {
  const ix = libIndex(lib)
  const subs: Record<string, number> = {}
  let all = 0
  for (const f of lib.files) {
    if (c && ix.catOf(f) !== c) continue
    const s = ix.subOf(f)
    subs[s] = (subs[s] ?? 0) + 1
    all++
  }
  const inReach = (f: LibFile) => v.t === 'all' || v.t === 'bin' || ix.subOf(f) === v.sub
  const cats: Record<string, number> = {}
  let catAll = 0
  for (const f of lib.files) {
    if (!inReach(f)) continue
    const k = ix.catOf(f)
    cats[k] = (cats[k] ?? 0) + 1
    catAll++
  }
  return { subs, all, cats, catAll }
}

/** A subsidiary's folders as tiles: its type's name and colour, how many files and when last changed — a link
 * folder says where it points. */
export function folderTiles(lib: Library, sub: string): { folder: LibFolder; type: LibType; n: number; meta: string }[] {
  const ix = libIndex(lib)
  return lib.folders
    .filter(f => f.sub === sub && ix.type(f.type))
    .map(f => {
      const type = ix.type(f.type)!
      const n = lib.files.filter(x => x.folder === f.id).length
      const meta = type.link ? `${linkHost(f.url)} · link` : `${n} file${n === 1 ? '' : 's'}${f.at ? ` · updated ${libDay(f.at)}` : ''}`
      return { folder: f, type, n, meta }
    })
    .sort((a, b) => lib.types.indexOf(a.type) - lib.types.indexOf(b.type))
}

/** "Google Drive", "Dropbox", else the address's host. */
export function linkHost(url: string | null): string {
  if (!url) return 'Link'
  try {
    const h = new URL(url).hostname.replace(/^www\./, '')
    return /(^|\.)drive\.google\.com$|(^|\.)docs\.google\.com$/.test(h) ? 'Google Drive' : /(^|\.)dropbox\.com$/.test(h) ? 'Dropbox' : h
  } catch {
    return 'Link'
  }
}

/** The types a subsidiary may still take a folder of — those it has, greyed. */
export const typeChoices = (lib: Library, sub: string) =>
  lib.types.map(t => ({ type: t, has: lib.folders.some(f => f.sub === sub && f.type === t.id) }))

/** The Dustbin's rows: where each came from and the days it has left — never more than BIN_DAYS, though the database's
 * clock may run a little ahead of the browser's. */
export function binRows(lib: Library, nowMs: number): (LibTrash & { from: string; left: number })[] {
  const ix = libIndex(lib)
  return lib.trash.map(t => {
    const sub = ix.sub(t.sub)?.name ?? ''
    const type = ix.type(t.type)?.name ?? ''
    const binned = Date.parse(t.at)
    const gone = Number.isFinite(binned) ? binned + BIN_DAYS * 86400000 : nowMs
    const left = Math.min(BIN_DAYS, Math.max(0, Math.ceil((gone - nowMs) / 86400000)))
    return { ...t, from: t.kind === 'folder' ? sub : `${sub} / ${type}`, left }
  })
}

/** Where a file may move (every other folder holding files) or a folder (every other subsidiary — one with a folder of
 * its type already, greyed). */
export function moveTargets(lib: Library, kind: 'file' | 'folder', id: string): { id: string; label: string; emoji: string; note: string; off: boolean }[] {
  const ix = libIndex(lib)
  if (kind === 'file') {
    const file = lib.files.find(f => f.id === id)
    return lib.folders
      .filter(f => !ix.type(f.type)?.link)
      .map(f => {
        const s = ix.sub(f.sub)
        const n = lib.files.filter(x => x.folder === f.id).length
        return { id: f.id, label: `${s?.name ?? ''} / ${ix.type(f.type)?.name ?? ''}`, emoji: s?.emoji ?? '🏢', note: `${n} file${n === 1 ? '' : 's'}`, off: f.id === file?.folder }
      })
  }
  const folder = ix.folder(id)
  return lib.subs.map(s => {
    const here = s.id === folder?.sub
    const taken = !here && lib.folders.some(f => f.sub === s.id && f.type === folder?.type)
    const n = lib.folders.filter(f => f.sub === s.id).length
    return { id: s.id, label: s.name, emoji: s.emoji, note: taken ? 'has one' : `${n} folder${n === 1 ? '' : 's'}`, off: here || taken }
  })
}

// ── A file's place in the bucket ─────────────────────────────────────────────────
/** A name safe in a path: letters, digits, dot, dash, underscore; its ending kept; never empty. */
export function tidyFileName(name: string): string {
  const m = /^(.*?)(\.[a-z0-9]{1,6})?$/i.exec(name.trim())
  const stem = (m?.[1] ?? '').normalize('NFKD').replace(/[^\w.-]+/g, '-').replace(/-{2,}/g, '-').replace(/^[-.]+|[-.]+$/g, '').slice(0, 100)
  return `${stem || 'file'}${(m?.[2] ?? '').toLowerCase()}`
}
/** library/<uuid>/<name> — the bucket's INSERT policy asks for library/, the Library's row for this shape. */
export const libraryPath = (fileName: string, uuid: string) => `library/${uuid}/${tidyFileName(fileName)}`
/** The name a file is listed under: its own, without its ending. */
export const listedName = (fileName: string) => fileName.replace(/\.[a-z0-9]{1,6}$/i, '').replace(/\s+/g, ' ').trim().slice(0, 200) || 'File'

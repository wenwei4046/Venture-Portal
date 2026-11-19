// Lead View v2 › Data Center (2026-11-02, the v2 handoff §7.10, mig 20261102140000): folders under each brand's own folder
// and Shared, the files in them, web links and their checks. The pure parts — the tree, the drawn "link for AI agent",
// a file's status, its tile — so the screen, AI Agent's Knowledge and the drafting agent agree.

import { fileStatus, readable, type DataFile, type KnowledgePick } from './agent'
import type { FileQuestion } from './agent-memory'

export interface DataFolder {
  id: string
  /** null = Shared. */
  brandId: string | null
  /** null = right in its brand's folder. */
  parentId: string | null
  name: string
  color: FolderColor | null
  updatedAt: string
}

export type FolderColor = 'rust' | 'green' | 'amber' | 'slate' | 'plum'
/** The right-click menu's six swatches, as drawn (Default first). */
export const FOLDER_COLORS: ReadonlyArray<[string, FolderColor | null]> = [['Default', null], ['Rust', 'rust'], ['Green', 'green'], ['Amber', 'amber'], ['Slate', 'slate'], ['Plum', 'plum']]

export type CheckEvery = 'hour' | 'day' | 'week'
export const CHECK_EVERY: ReadonlyArray<[CheckEvery, string]> = [['hour', 'Every hour'], ['day', 'Every day'], ['week', 'Every week']]
const EVERY_MS: Record<CheckEvery, number> = { hour: 3600e3, day: 86400e3, week: 7 * 86400e3 }

/** A place in the tree: a brand's own folder ('B:<brandId>'), Shared ('B:shared') or a folder (its id). */
export type Place = string
export const SHARED_PLACE = 'B:shared'
export const brandPlace = (brandId: string | null): Place => (brandId ? `B:${brandId}` : SHARED_PLACE)
export const isBrandPlace = (p: Place | null): boolean => !!p && p.startsWith('B:')
/** Where a file sits. */
export const placeOf = (f: Pick<DataFile, 'folderId' | 'brandId'>): Place => f.folderId ?? brandPlace(f.brandId)

export interface DcNode { place: Place; name: string; parent: Place | null; brandId: string | null; color: FolderColor | null; folder: DataFolder | null }

/** "Raya & promos 2026" → "raya-and-promos-2026". */
export function slug(t: string): string {
  return t.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

/** The tree: the brands' own folders (in the brands' order), Shared last, and the folders under them. */
export function dcTree(brands: Array<{ id: string; name: string }>, folders: DataFolder[], files: DataFile[]) {
  const nodes = new Map<Place, DcNode>()
  for (const b of brands) nodes.set(brandPlace(b.id), { place: brandPlace(b.id), name: b.name, parent: null, brandId: b.id, color: null, folder: null })
  nodes.set(SHARED_PLACE, { place: SHARED_PLACE, name: 'Shared', parent: null, brandId: null, color: null, folder: null })
  for (const d of folders) nodes.set(d.id, { place: d.id, name: d.name, parent: d.parentId ?? brandPlace(d.brandId), brandId: d.brandId, color: d.color, folder: d })
  const all = [...nodes.values()]
  const roots = all.filter(n => n.parent === null)
  const kids = (p: Place | null) => (p === null ? roots : all.filter(n => n.parent === p).sort((a, b) => a.name.localeCompare(b.name)))
  const desc = (p: Place): Place[] => [p, ...kids(p).flatMap(k => desc(k.place))]
  const chain = (p: Place | null): DcNode[] => {
    const out: DcNode[] = []
    for (let n = p ? nodes.get(p) : undefined, i = 0; n && i < 60; n = n.parent ? nodes.get(n.parent) : undefined, i++) out.unshift(n)
    return out
  }
  const live = files.filter(f => f.kind === 'file')
  const filesIn = (p: Place) => live.filter(f => placeOf(f) === p)
  const count = (p: Place) => { const set = new Set(desc(p)); return live.filter(f => set.has(placeOf(f))).length }
  const pathOf = (p: Place | null) => chain(p).map(n => n.name).join(' / ')
  /** The address the AI Agent's Knowledge takes, as drawn: https://leadview.my/dc/<folders>[/<file>]. */
  const linkOf = (p: Place, fileName?: string) => 'https://leadview.my/dc/' + chain(p).map(n => slug(n.name)).join('/') + (fileName ? '/' + slug(fileName.replace(/\.[^.]+$/, '')) : '')
  return { nodes, roots, kids, desc, chain, filesIn, count, pathOf, linkOf, get: (p: Place) => nodes.get(p) }
}
export type DcTree = ReturnType<typeof dcTree>

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
/** "2026-10-31" or an instant → "31 Oct" (office days). */
export function dayMon(v: string): string {
  const d = /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(v + 'T00:00:00Z') : new Date(new Date(v).getTime() + 8 * 3600e3)
  return `${d.getUTCDate()} ${MON[d.getUTCMonth()]}`
}

export type DcTone = 'red' | 'grey' | 'amber' | 'green'
/** A file's state, as drawn: Expired (its end date passed) · Paused · Ends in N days (14 or fewer) · In use. */
export function dcState(f: Pick<DataFile, 'status' | 'validUntil'>, today: string): { label: string; tone: DcTone; expired: boolean } {
  if (f.validUntil && f.validUntil < today) return { label: 'Expired', tone: 'red', expired: true }
  if (f.status === 'paused') return { label: 'Paused', tone: 'grey', expired: false }
  if (f.validUntil) {
    const n = Math.round((Date.parse(f.validUntil + 'T00:00:00Z') - Date.parse(today + 'T00:00:00Z')) / 864e5)
    if (n <= 14) return { label: `Ends in ${n} ${n === 1 ? 'day' : 'days'}`, tone: 'amber', expired: false }
  }
  return { label: 'In use', tone: 'green', expired: false }
}

/** A file's tile, as drawn: PDF rust, XLS green, DOC slate, JPG amber, anything else plain. */
export function extOf(name: string, mime = ''): { ext: string; tone: 'rust' | 'green' | 'slate' | 'amber' | 'plain' } {
  const e = (name.split('.').pop() ?? '').toUpperCase()
  if (e === 'PDF' || mime === 'application/pdf') return { ext: 'PDF', tone: 'rust' }
  if (['XLS', 'XLSX', 'CSV'].includes(e)) return { ext: 'XLS', tone: 'green' }
  if (['DOC', 'DOCX', 'TXT', 'MD'].includes(e)) return { ext: 'DOC', tone: 'slate' }
  if (['JPG', 'JPEG', 'PNG', 'WEBP', 'GIF', 'HEIC'].includes(e) || mime.startsWith('image/')) return { ext: 'JPG', tone: 'amber' }
  return { ext: (e || 'FILE').slice(0, 4), tone: 'plain' }
}

/** "https://2990s.com.my/sofas/" → "2990s.com.my/sofas". */
export const hostOf = (u: string): string => u.replace(/^https?:\/\//, '').replace(/\/$/, '')

/** "Today 9:12" · "Yesterday" · "31 Oct" · "Not yet" — when a link was last checked (office time). */
export function checkedLabel(at: string | null, now: number): string {
  if (!at) return 'Not yet'
  const t = new Date(at).getTime()
  if (now - t < 60e3) return 'Just now'
  const day = (ms: number) => new Date(ms + 8 * 3600e3).toISOString().slice(0, 10)
  const local = new Date(t + 8 * 3600e3)
  if (day(t) === day(now)) return `Today ${local.getUTCHours()}:${String(local.getUTCMinutes()).padStart(2, '0')}`
  if (day(t) === day(now - 864e5)) return 'Yesterday'
  return dayMon(at)
}

/** Is the link's last reading older than its frequency (or never read)? Then the agent reads it afresh. */
export function linkDue(f: Pick<DataFile, 'checkedAt' | 'checkEvery'>, now: number): boolean {
  return !f.checkedAt || now - new Date(f.checkedAt).getTime() >= EVERY_MS[f.checkEvery ?? 'day']
}

/** A new folder's name that no folder beside it has: "Untitled folder", "Untitled folder 2" … */
export function freeName(taken: string[], base = 'Untitled folder'): string {
  const low = new Set(taken.map(t => t.toLowerCase()))
  if (!low.has(base.toLowerCase())) return base
  for (let i = 2; ; i++) if (!low.has(`${base} ${i}`.toLowerCase())) return `${base} ${i}`
}

/**
 * What a brand's agent reads through its Knowledge picks: each file and link picked, and every file in a folder picked
 * (its folders too, as they change) — each once, paused when its pick is. Files the Data Center paused or that ended
 * are the caller's to leave out (`dcState`).
 */
export function knowledgeReads(picks: Array<{ kind: 'folder' | 'file' | 'link'; ref: string; paused: boolean }>, files: DataFile[], folders: DataFolder[]): Array<{ file: DataFile; paused: boolean; via: string | null }> {
  const under = (id: string): string[] => [id, ...folders.filter(d => d.parentId === id).flatMap(d => under(d.id))]
  const out = new Map<string, { file: DataFile; paused: boolean; via: string | null }>()
  const put = (f: DataFile, paused: boolean, via: string | null) => {
    const had = out.get(f.id)
    if (!had || (had.paused && !paused)) out.set(f.id, { file: f, paused, via })
  }
  for (const p of picks) {
    if (p.kind === 'folder') {
      const set = new Set(under(p.ref))
      for (const f of files) if (f.kind === 'file' && f.folderId && set.has(f.folderId)) put(f, p.paused, p.ref)
    } else {
      const f = files.find(x => x.id === p.ref && x.kind === p.kind)
      if (f) put(f, p.paused, null)
    }
    // v3 § 5 — the whole line: the files sitting right in each folder above the pick, up to its brand's folder.
    if (p.kind !== 'link') for (const lv of readLine(p, files, folders).slice(0, -1)) for (const f of lv.files) put(f, p.paused, lv.place)
  }
  return [...out.values()]
}

/** One level of a pick's line: the brand's folder (or Shared), each folder down to the pick, and the pick itself. */
export interface ReadLevel {
  place: Place
  name: string
  /** What the AI reads here: the files right in this folder — at the pick, the file or everything in the folder. */
  files: DataFile[]
  /** Folders beside the line that are not read (none at the brand's level or at the pick). */
  skipped: string[]
}

/**
 * Lead View v3 § 5 › Knowledge › WHAT THE AI READS: picking a folder or file deep in the Data Center reads every file
 * sitting right in each folder above it, then the pick (a folder: everything in it; a file: that file). Folders off the
 * line are not read. Example: `2990s / Sofa / 3 seater / Pushback / Model A` reads Sofa's, 3 seater's, Pushback's and
 * Model A's files — not 2 seater, Slide out or Model B.
 */
export function readLine(pick: { kind: 'folder' | 'file' | 'link'; ref: string }, files: DataFile[], folders: DataFolder[]): ReadLevel[] {
  const byId = new Map(folders.map(d => [d.id, d]))
  const file = pick.kind === 'file' ? files.find(f => f.id === pick.ref && f.kind === 'file') : undefined
  const start = pick.kind === 'folder' ? byId.get(pick.ref) : undefined
  if (pick.kind === 'link' || (!file && !start)) return []
  const brandId = start ? start.brandId : file!.brandId
  // The folders from the top down to the pick's folder (a file right in its brand's folder has none).
  const chain: DataFolder[] = []
  for (let d = start ?? (file!.folderId ? byId.get(file!.folderId) : undefined); d && chain.length < 50; d = d.parentId ? byId.get(d.parentId) : undefined) chain.unshift(d)
  const direct = (folderId: string | null) => files.filter(f => f.kind === 'file' && (f.folderId ?? null) === folderId && (folderId !== null || f.brandId === brandId))
  const under = (id: string): string[] => [id, ...folders.filter(d => d.parentId === id).flatMap(d => under(d.id))]
  const kids = (parent: string | null) => folders.filter(d => (d.parentId ?? null) === parent && (parent !== null || d.brandId === brandId))
  const levels: ReadLevel[] = [{ place: brandPlace(brandId), name: '', files: direct(null), skipped: [] }]
  chain.forEach((d, i) => {
    const next = chain[i + 1]
    levels.push({ place: d.id, name: d.name, files: direct(d.id), skipped: next ? kids(d.id).filter(k => k.id !== next.id).map(k => k.name) : [] })
  })
  const last = levels[levels.length - 1]
  if (file) {
    // The pick is the file: its own level reads it alone (a file right in its brand's folder is the brand's level).
    if (chain.length) last.files = [file]
    else levels[0].files = [file]
  } else if (start) {
    const set = new Set(under(start.id))
    last.files = files.filter(f => f.kind === 'file' && f.folderId && set.has(f.folderId))
    last.skipped = []
  }
  return levels
}

// ── What the agent reads, said the same on the server and on AI Agent › Knowledge (2026-11-19) ──

/** The model's limits on one reply's attached files: six files, 10 MB each, 24 MB together. */
export const READ_LIMITS = { files: 6, eachBytes: 10_000_000, totalBytes: 24_000_000 } as const

/** read · too-big (over 10 MB) · over-limit (six already, or 24 MB together) · cannot-read (Word, Excel …) · link (read as a web page). */
export type ReadState = 'read' | 'too-big' | 'over-limit' | 'cannot-read' | 'link'

export const READ_STATE_LABEL: Record<Exclude<ReadState, 'read' | 'link'>, string> = {
  'too-big': 'Not read — over 10 MB',
  'over-limit': 'Not read — over the 6-file limit',
  'cannot-read': 'Not read — the AI can’t read this type (use PDF, CSV, a note or a picture)',
}

/**
 * Which of the agent's files it reads before a reply, in the order it reads them: text first (notes, CSV), then PDFs,
 * then pictures — each kind in the order it was picked — while the limits hold; the rest say why not.
 */
export function readPlan(files: DataFile[]): Array<{ file: DataFile; state: ReadState }> {
  const rank = { text: 0, pdf: 1, image: 2 } as const
  const kinds = files.map((file, i) => ({ file, i, how: readable(file) }))
  const out: Array<{ file: DataFile; state: ReadState }> = []
  const rest: Array<{ file: DataFile; state: ReadState }> = []
  let n = 0, total = 0
  const ranked = kinds.filter(k => k.how === 'text' || k.how === 'pdf' || k.how === 'image')
    .sort((x, y) => rank[x.how as keyof typeof rank] - rank[y.how as keyof typeof rank] || x.i - y.i)
  for (const { file } of ranked) {
    if (!file.path) rest.push({ file, state: 'cannot-read' })
    else if (file.sizeBytes > READ_LIMITS.eachBytes) rest.push({ file, state: 'too-big' })
    else if (n >= READ_LIMITS.files || total + file.sizeBytes > READ_LIMITS.totalBytes) rest.push({ file, state: 'over-limit' })
    else { n++; total += file.sizeBytes; out.push({ file, state: 'read' }) }
  }
  for (const k of kinds) {
    if (k.how === 'link') rest.push({ file: k.file, state: 'link' })
    else if (k.how === null) rest.push({ file: k.file, state: 'cannot-read' })
  }
  return [...out, ...rest]
}

/** The files a brand's agent reads from its Knowledge picks: picked, the pick not paused, the file usable today. */
export function agentFiles(picks: KnowledgePick[], files: DataFile[], folders: DataFolder[], today: string): DataFile[] {
  return knowledgeReads(picks, files, folders).filter(s => !s.paused && fileStatus(s.file, today).usable).map(s => s.file)
}

/** "sofa › chiller › push back" — the folders a file sits in, under its brand's folder ("Shared › …" for Shared; '' right in the brand's folder). */
export function folderPath(f: Pick<DataFile, 'folderId' | 'brandId'>, folders: DataFolder[]): string {
  const byId = new Map(folders.map(d => [d.id, d]))
  const names: string[] = []
  for (let d = f.folderId ? byId.get(f.folderId) : undefined; d && names.length < 50; d = d.parentId ? byId.get(d.parentId) : undefined) names.unshift(d.name)
  return [...(f.brandId === null ? ['Shared'] : []), ...names].join(' › ')
}

/** A folder's own id and the ids of each folder above it. */
function folderIds(id: string | null | undefined, folders: DataFolder[]): string[] {
  const out: string[] = []
  for (let d = id ? folders.find(x => x.id === id) : undefined; d && out.length < 50; d = d.parentId ? folders.find(x => x.id === d!.parentId) : undefined) out.push(d.id)
  return out
}

/**
 * Lead View AI Agent improvement pack A (2026-11-19): the agent's files laid out by folder, so it knows the shelves
 * (`sofa › chiller › push back`) and which file is which — each with its card id and category, its ASKED ABOUT
 * instructions under it and a folder's under the folder. Files it could not read this time are listed as such: the
 * agent knows they exist, never their contents. Only folders with files appear — an empty folder is no product.
 */
export function knowledgeOutline(plan: Array<{ file: DataFile; state: ReadState }>, folders: DataFolder[], fileQs: FileQuestion[]): string {
  const files = plan.filter(p => p.state !== 'link')
  if (!files.length) return ''
  const notes = (refs: string[], kind: 'file' | 'folder') => fileQs.filter(q => q.kind === kind && refs.includes(q.ref) && q.instruction.trim()).map(q => `When asked "${q.question}": ${q.instruction.trim()}`)
  const groups = new Map<string, { path: string; folderId: string | null; rows: string[] }>()
  for (const { file: f, state } of files) {
    const path = folderPath(f, folders)
    const key = `${f.brandId ?? 'shared'}|${f.folderId ?? ''}`
    if (!groups.has(key)) groups.set(key, { path, folderId: f.folderId ?? null, rows: [] })
    const how = state === 'read'
      ? (readable(f) === 'image' ? 'picture, attached' : 'attached')
      : 'NOT read this time — you have not seen its contents'
    const meta = [`file-${f.id}`, (f.category ?? '').trim(), how].filter(Boolean).join(' · ')
    const own = notes([f.id], 'file')
    groups.get(key)!.rows.push(`- ${f.name} (${meta})${own.map(n => `\n  - ${n}`).join('')}`)
  }
  const blocks = [...groups.values()].sort((x, y) => x.path.localeCompare(y.path)).map(g => {
    const fNotes = notes(folderIds(g.folderId, folders), 'folder')
    return [`## ${g.path || '(the brand’s folder itself)'}`, ...(fNotes.length ? [`How to answer about this folder:\n${fNotes.map(n => `  - ${n}`).join('\n')}`] : []), ...g.rows].join('\n')
  })
  return [
    '# The brand’s files, by folder',
    'Each heading is a Data Center folder, from the top down (a product line, then its kind, then the model); the names say what is inside. Use them to know what the brand sells and how it is grouped, and cite a file by its card id (file-…). A file marked NOT read exists, but say a colleague will confirm its details rather than guess them.',
    ...blocks,
  ].join('\n\n')
}

// ── Data Center › New note (improvement pack C, 2026-11-19) ──

/** A note's words at most — the agent reads up to 200,000 characters of a text file. */
export const NOTE_MAX = 20_000

/** "Chiller models" → "Chiller models.txt"; a name that already ends .txt or .md keeps it. */
export function noteFileName(name: string): string {
  const n = name.replace(/[\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 150)
  return /\.(txt|md)$/i.test(n) ? n : `${n}.txt`
}

/** A note is a plain text file kept in the Data Center (a .txt or .md, not a CSV): it opens to edit. */
export function isNote(f: Pick<DataFile, 'kind' | 'name' | 'mime'>): boolean {
  return f.kind === 'file' && (/\.(txt|md)$/i.test(f.name) || (/^text\/plain\b/.test(f.mime) && !/\.csv$/i.test(f.name)))
}

/** Why a note cannot be saved yet, or ''. */
export function noteProblem(name: string, body: string): string {
  if (!name.trim()) return 'Give the note a name.'
  if (!body.trim()) return 'Write something in the note.'
  if (body.length > NOTE_MAX) return `A note holds ${NOTE_MAX.toLocaleString('en-US')} characters at most — this one has ${body.length.toLocaleString('en-US')}.`
  return ''
}

// Projects as a Drive (2026-11-17 — docs/design_handoff_workflow_projects/ › 2): subsidiaries are folders; inside one, its
// product projects are folders and its Quick / recurring tasks files; inside a project, its deliverables are files. The
// path lives in the address (`?sub=` a subsidiary's code, `?p=` a project's id). Open / Done / All count the level shown;
// a search looks at the level and everything under it, flat. Pure.

import type { MktSub } from './board'
import type { ProjectRow, ProjectScope } from './projects'

export interface DrivePath {
  /** A subsidiary's code, or null at the root. */
  sub: string | null
  /** A product project's id inside that subsidiary, or null. */
  project: string | null
}

export interface SubFolder {
  sub: MktSub
  /** What sits in it at its own level (projects and tasks — never a project's deliverables). */
  items: number
  /** Anything in it late (deliverables too). */
  late: number
}

export interface DriveLevel {
  level: 'root' | 'sub' | 'project'
  path: DrivePath
  /** The subsidiary open, the project open. */
  sub: MktSub | null
  project: ProjectRow | null
  subFolders: SubFolder[]
  /** Product projects shown as folders (a subsidiary's level, or among search results). */
  folders: ProjectRow[]
  /** Tasks shown as files. */
  files: ProjectRow[]
  counts: Record<ProjectScope, number>
  /** A search is on: folders and files are its results, flat. */
  searching: boolean
}

/** A product project's tasks (its deliverables on the board), every one whatever the scope. */
export function tasksOf(rows: ProjectRow[], projectId: string): ProjectRow[] {
  return rows.filter(r => r.parent === projectId)
}

const inScope = (r: ProjectRow, scope: ProjectScope) => scope === 'all' || (scope === 'open' ? r.open : !r.open)

/** Whose words a search matches: Track ID, title or the person it is now with. */
export function matches(r: ProjectRow, q: string): boolean {
  const t = q.trim().toLowerCase()
  if (!t) return true
  return r.trackId.toLowerCase().includes(t) || r.title.toLowerCase().includes(t) || r.who.toLowerCase().includes(t)
}

/** The path the address asks for, kept only where it is real: a project only inside its own subsidiary. */
export function cleanPath(rows: ProjectRow[], subs: MktSub[], sub: string | null, project: string | null): DrivePath {
  const s = sub ? subs.find(x => x.code === sub.toUpperCase()) ?? null : null
  if (!s) return { sub: null, project: null }
  const p = project ? rows.find(r => r.kind === 'product' && (r.id === project || r.trackId === project) && r.sub?.code === s.code) : null
  return { sub: s.code, project: p ? p.id : null }
}

export function driveLevel(rows: ProjectRow[], subs: MktSub[], path: DrivePath, scope: ProjectScope, q: string): DriveLevel {
  const sub = path.sub ? subs.find(s => s.code === path.sub) ?? null : null
  const project = sub && path.project ? rows.find(r => r.id === path.project && r.kind === 'product') ?? null : null
  const level: DriveLevel['level'] = project ? 'project' : sub ? 'sub' : 'root'
  // What this level holds, and everything under it (a search's reach).
  const here = level === 'project'
    ? tasksOf(rows, project!.id)
    : level === 'sub'
      ? rows.filter(r => r.sub?.code === sub!.code && !r.parent)
      : rows.filter(r => !r.parent)
  const under = level === 'project'
    ? here
    : level === 'sub'
      ? rows.filter(r => r.sub?.code === sub!.code)
      : rows
  const counts = {
    open: here.filter(r => r.open).length,
    done: here.filter(r => !r.open).length,
    all: here.length,
  }
  const searching = q.trim().length > 0
  if (searching) {
    const hit = under.filter(r => inScope(r, scope) && matches(r, q))
    return {
      level, path, sub, project, subFolders: [], searching,
      folders: hit.filter(r => r.kind === 'product'),
      files: hit.filter(r => r.kind !== 'product'),
      counts,
    }
  }
  const subFolders = level === 'root'
    ? subs.map(s => ({
      sub: s,
      items: rows.filter(r => r.sub?.code === s.code && !r.parent && inScope(r, scope)).length,
      late: rows.filter(r => r.sub?.code === s.code && r.open && r.tone === 'red').length,
    }))
    : []
  const shown = here.filter(r => inScope(r, scope))
  return {
    level, path, sub, project, subFolders, searching,
    folders: level === 'sub' ? shown.filter(r => r.kind === 'product') : [],
    files: level === 'root' ? [] : shown.filter(r => r.kind !== 'product'),
    counts,
  }
}

/** The address of a path (the page's own), keeping the other parameters it is handed. */
export function driveHref(path: DrivePath, base = '/marketing/projects'): string {
  const u = new URLSearchParams()
  if (path.sub) u.set('sub', path.sub)
  if (path.sub && path.project) u.set('p', path.project)
  const s = u.toString()
  return s ? `${base}?${s}` : base
}

/** A file's preview glyph and words: 🎞️ video, 🖼️ image, 📈 ads — by its type, a deliverable by its title. */
export function fileLook(r: ProjectRow): { emoji: string; kind: string } {
  const t = (r.qType ?? '').toLowerCase()
  const words = r.title.toLowerCase()
  if (t === 'ads' || /\bads?\b|meta|google/.test(words)) return { emoji: '📈', kind: r.kindLabel }
  if (t === 'content' || /video|reel|tiktok|film/.test(words)) return { emoji: '🎞️', kind: r.kindLabel }
  if (t === 'social' || t === 'brand' || /poster|image|post|banner|visual|photo/.test(words)) return { emoji: '🖼️', kind: r.kindLabel }
  return { emoji: r.kind === 'recurring' ? '🔁' : r.kind === 'deliverable' ? '📦' : '⚡', kind: r.kindLabel }
}

/** A project folder's line: "{status} · {n} tasks". */
export function folderMeta(rows: ProjectRow[], p: ProjectRow): string {
  const n = tasksOf(rows, p.id).length
  return `${p.label} · ${n} task${n === 1 ? '' : 's'}`
}

/** What a delete takes with it, said before the second click. */
export function deleteNote(r: ProjectRow): string {
  return r.kind === 'product'
    ? 'Deletes the project and every task inside it. You can undo for 6 seconds.'
    : 'You can undo for 6 seconds.'
}

/** The rows a delete takes off the page at once: the project, its deliverables, a series' runs (as the database does). */
export function withoutDeleted(rows: ProjectRow[], id: string): ProjectRow[] {
  return rows.filter(r => r.id !== id && r.parent !== id && r.series !== id)
}

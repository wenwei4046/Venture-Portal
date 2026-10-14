/**
 * One's own documents (2026-10-14 — the user: "现在的 documentation 我要分成两种：一个是 company，一个是 personal";
 * a folder of a person's data that HR right-clicks open, "他在手机那边用自己的 user 账号 login，就可以 view 到他自己
 * 的资料"). Pure, so every face that draws them — the Revenue app's Documentation, the HR app's and the portal's
 * My documents — draws the same thing, and this is tested.
 *
 *   Company   what HR shares with the person's department (People › Documentation › Documents)
 *   Personal  what of their own Data center folder is shared with them — folders, files — and their letters
 *
 * The database decides what is theirs (`my_documents()`, `my_documents_of()` — mig 20261014190000); each folder and
 * file comes with the nearest folder above it they are shown (`parent`, null at the top of Personal), so a file shared
 * inside a folder that is not stands at the top.
 */

import { fileExt } from './model'
import { memberDocumentsFromRow, type MemberDocument } from './member-model'

export interface MyFolder {
  id: string
  name: string
  /** The folder of Personal it is drawn in; null at the top. */
  parent: string | null
  at: string
}

export interface MyFile {
  id: string
  ref: string
  name: string
  /** "PDF", "XLSX". */
  ext: string
  contentType: string | null
  size: number | null
  at: string
  parent: string | null
  /** False = "New" until they open it. */
  seen: boolean
}

export interface MyLetter {
  id: string
  ref: string
  /** "Offer letter". */
  typeName: string
  name: string
  ext: string
  contentType: string | null
  size: number | null
  at: string
  memoId: string | null
  readAt: string | null
  acknowledgedAt: string | null
}

export interface Personal {
  folders: MyFolder[]
  files: MyFile[]
  letters: MyLetter[]
}

export interface MyDocuments {
  /** Their People record — null for a login no record names (principal@, hr@ …): nothing is theirs. */
  staffId: string | null
  company: MemberDocument[]
  personal: Personal
}

export const EMPTY_PERSONAL: Personal = { folders: [], files: [], letters: [] }

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {})
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])
const str = (v: unknown): string => (typeof v === 'string' ? v : '')
const strOrNull = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null)
const numOrNull = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v !== '' && Number.isFinite(Number(v)) ? Number(v) : null

/** The Personal part of `my_documents()` / `my_documents_of()`. */
export function personalFromRow(raw: unknown): Personal {
  const o = obj(raw)
  return {
    folders: arr(o.folders).flatMap(f => {
      const x = obj(f)
      return str(x.id) ? [{ id: str(x.id), name: str(x.name), parent: strOrNull(x.parent), at: str(x.at) }] : []
    }),
    files: arr(o.files).flatMap(f => {
      const x = obj(f)
      if (!str(x.id)) return []
      const name = str(x.name)
      return [{
        id: str(x.id),
        ref: str(x.ref),
        name,
        ext: fileExt(name),
        contentType: strOrNull(x.contentType),
        size: numOrNull(x.size),
        at: str(x.at),
        parent: strOrNull(x.parent),
        seen: x.seen === true,
      }]
    }),
    letters: arr(o.letters).flatMap(l => {
      const x = obj(l)
      if (!str(x.id)) return []
      const name = str(x.name)
      return [{
        id: str(x.id),
        ref: str(x.ref),
        typeName: str(x.typeName) || 'Letter',
        name,
        ext: fileExt(name),
        contentType: strOrNull(x.contentType),
        size: numOrNull(x.size),
        at: str(x.at),
        memoId: strOrNull(x.memoId),
        readAt: strOrNull(x.readAt),
        acknowledgedAt: strOrNull(x.acknowledgedAt),
      }]
    }),
  }
}

/** `my_documents()`'s answer. */
export function myDocumentsFromRow(raw: unknown): MyDocuments | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const o = raw as Record<string, unknown>
  return { staffId: strOrNull(o.staffId), company: memberDocumentsFromRow(o.company), personal: personalFromRow(o.personal) }
}

// ── Drawing Personal ────────────────────────────────────────────────────────

export interface PersonalFolderRow extends MyFolder {
  /** What is in it, all the way down: "3 files". */
  files: number
  /** Of them, not opened yet. */
  unseen: number
}

/** Every folder drawn inside `folder` (and so on down) — for a folder's counts. */
function within(personal: Personal, folder: string): Set<string> {
  const out = new Set<string>([folder])
  let grew = true
  while (grew) {
    grew = false
    for (const f of personal.folders) {
      if (f.parent && out.has(f.parent) && !out.has(f.id)) {
        out.add(f.id)
        grew = true
      }
    }
  }
  return out
}

/**
 * What a place of Personal holds: its folders (A→Z, each with how many files are in it and how many are new), its files
 * (A→Z), and — at the top only — the letters (newest first). An unknown folder holds nothing.
 */
export function personalIn(personal: Personal, folder: string | null): { folders: PersonalFolderRow[]; files: MyFile[]; letters: MyLetter[] } {
  const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' })
  const folders = personal.folders
    .filter(f => f.parent === folder)
    .sort(byName)
    .map(f => {
      const inside = within(personal, f.id)
      const mine = personal.files.filter(x => x.parent !== null && inside.has(x.parent))
      return { ...f, files: mine.length, unseen: mine.filter(x => !x.seen).length }
    })
  return {
    folders,
    files: personal.files.filter(x => x.parent === folder).sort(byName),
    letters: folder === null ? [...personal.letters].sort((a, b) => b.at.localeCompare(a.at)) : [],
  }
}

/** Personal › Contracts › 2026 — from the top to a folder (an unknown one: the top). */
export function personalPath(personal: Personal, folder: string | null): Array<{ id: string | null; name: string }> {
  const out: Array<{ id: string | null; name: string }> = []
  const seen = new Set<string>()
  let cur = folder ? personal.folders.find(f => f.id === folder) : undefined
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id)
    out.unshift({ id: cur.id, name: cur.name })
    cur = cur.parent ? personal.folders.find(f => f.id === cur!.parent) : undefined
  }
  return [{ id: null, name: 'Personal' }, ...out]
}

/** Personal's "new": files not opened, letters not read. */
export function personalUnseen(personal: Personal): number {
  return personal.files.filter(f => !f.seen).length + personal.letters.filter(l => !l.readAt).length
}

/** How a letter stands for its person: to acknowledge, or done. */
export function letterState(l: Pick<MyLetter, 'readAt' | 'acknowledgedAt'>): 'new' | 'read' | 'acknowledged' {
  return l.acknowledgedAt ? 'acknowledged' : l.readAt ? 'read' : 'new'
}

export { type MemberDocument }

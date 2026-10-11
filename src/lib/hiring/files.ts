// A candidate's and a talent's files (2026-10-11, Hiring): the private
// `hiring-files` bucket (mig 20261011080000) takes PDF, Word and images up to
// 10 MB, each under its own folder so two files of one name never meet. Since
// mig 20261011160000 a record keeps several, each with a file type (Résumé,
// IC, Certificate …). Pure.

import type { HiringFile, HiringFileType } from './types'

export const HIRING_BUCKET = 'hiring-files'
export const MAX_FILE_BYTES = 10 * 1024 * 1024
/** What a file input offers. */
export const HIRING_ACCEPT = '.pdf,.doc,.docx,image/*'

const TYPES: Readonly<Record<string, string>> = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
}

/** A file's extension: letters and digits after its last dot (never a path's), lower-cased; '' when none. */
export function extensionOf(name: string): string {
  const m = /\.([A-Za-z0-9]{1,8})$/.exec(name)
  return m && m.index > 0 ? m[1].toLowerCase() : ''
}

export function contentTypeOf(name: string): string | null {
  return TYPES[extensionOf(name)] ?? null
}

/** Why a file cannot be kept, or null. */
export function fileRefusal(file: { name: string; size: number }): string | null {
  if (!file.name || file.size === 0) return 'Choose a file.'
  if (!contentTypeOf(file.name)) return 'A file is a PDF, a Word document or an image.'
  if (file.size > MAX_FILE_BYTES) return 'That file is over 10 MB.'
  return null
}

/** A storage-safe file name: letters, digits, dot, dash, underscore — at most 120 characters, its extension kept. */
export function safeFileName(name: string): string {
  const ext = extensionOf(name)
  const base = (ext ? name.slice(0, -(ext.length + 1)) : name).normalize('NFKD').replace(/[^\w.-]+/g, '_').replace(/_+/g, '_').replace(/^[_.]+|[_.]+$/g, '')
  const kept = (base || 'file').slice(0, 110)
  return ext ? `${kept}.${ext}` : kept
}

/** `files/<id>/<name>` — where a file goes in the bucket (`resumes/` and `attachments/` hold older ones). */
export function objectPath(folder: 'files' | 'resumes' | 'attachments', id: string, name: string): string {
  return `${folder}/${id}/${safeFileName(name)}`
}

/** How a file shows: a PDF in a frame, an image, or neither. */
export function previewKind(name: string | null | undefined): 'pdf' | 'image' | 'none' {
  const ext = extensionOf(name ?? '')
  if (ext === 'pdf') return 'pdf'
  if (ext === 'png' || ext === 'jpg' || ext === 'jpeg' || ext === 'webp') return 'image'
  return 'none'
}

/** "PDF", "DOCX" — the tile beside a file (four letters at most), or a dash. */
export function extLabel(name: string | null | undefined): string {
  return extensionOf(name ?? '').toUpperCase().slice(0, 4) || '—'
}

/** The newest résumé among a record's files (what the résumé button and "Download résumé" open), or null. */
export function resumeOf(files: readonly HiringFile[]): HiringFile | null {
  let best: HiringFile | null = null
  for (const f of files) if (f.resume && (!best || f.addedAt > best.addedAt)) best = f
  return best
}

/**
 * The type a newly chosen file starts as: the Résumé while the record has none
 * (and none is already waiting to go up), otherwise nothing — the person picks.
 */
export function startingType(types: readonly HiringFileType[], kept: readonly HiringFile[], waiting: readonly { typeId: string }[]): string {
  const resume = types.find(t => t.builtin === 'resume')
  if (!resume) return ''
  if (kept.some(f => f.resume) || waiting.some(w => w.typeId === resume.id)) return ''
  return resume.id
}

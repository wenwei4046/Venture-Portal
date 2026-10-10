// Résumés and attachments (2026-10-11, Hiring): the private `hiring-files`
// bucket (mig 20261011080000) takes PDF, Word and images up to 10 MB, each
// under its own folder so two files of one name never meet. Pure.

export const HIRING_BUCKET = 'hiring-files'
export const MAX_FILE_BYTES = 10 * 1024 * 1024

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
  if (!contentTypeOf(file.name)) return 'A résumé is a PDF, a Word document or an image.'
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

/** `resumes/<id>/<name>` — where a file goes in the bucket. */
export function objectPath(folder: 'resumes' | 'attachments', id: string, name: string): string {
  return `${folder}/${id}/${safeFileName(name)}`
}

/** How the résumé drawer shows a file: a PDF in a frame, an image, or neither. */
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

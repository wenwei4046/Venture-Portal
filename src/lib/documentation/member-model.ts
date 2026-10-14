import { fileExt } from './model'

/**
 * A company document as its reader's app draws it (2026-10-11, the Revenue app's Documentation; 2026-10-14 every
 * face's Company): pure — the server-only readers in member.ts / my-docs.ts hand these to client screens.
 */
export interface MemberDocument {
  id: string
  name: string
  fileName: string
  /** "PDF", "XLSX". */
  ext: string
  contentType: string | null
  size: number | null
  uploadedAt: string
  /** False = the app's "New". */
  seen: boolean
}

export function memberDocumentsFromRow(raw: unknown): MemberDocument[] {
  if (!Array.isArray(raw)) return []
  return raw.flatMap(r => {
    if (!r || typeof r !== 'object') return []
    const o = r as Record<string, unknown>
    if (typeof o.id !== 'string' || typeof o.name !== 'string') return []
    const fileName = typeof o.fileName === 'string' ? o.fileName : ''
    return [{
      id: o.id,
      name: o.name,
      fileName,
      ext: fileExt(fileName),
      contentType: typeof o.contentType === 'string' ? o.contentType : null,
      size: typeof o.size === 'number' ? o.size : null,
      uploadedAt: typeof o.uploadedAt === 'string' ? o.uploadedAt : '',
      seen: o.seen === true,
    }]
  })
}

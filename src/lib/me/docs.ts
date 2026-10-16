import { dayMonYear } from '@/lib/attendance/engine'
import type { MyDocuments } from '@/lib/documentation/personal'
import type { MyDocKind } from '@/lib/documentation/my-docs'
import { sizeLabel } from './format'

/**
 * Me › Documents (2026-10-17, the handoff's `isDocs`): Personal — the letters HR saved to one's record and the files
 * of one's own folder HR shares — and Company — what HR publishes for one's department (`my_documents()`, the same
 * reader the HR app's and the Revenue app's Documentation use). Pure.
 */

export type DocTab = 'Personal' | 'Company'

export interface DocRow {
  id: string
  kind: MyDocKind
  title: string
  date: string
  ext: string
  size: string
  isNew: boolean
  contentType: string | null
}

const label = (at: string) => (at ? dayMonYear(at.slice(0, 10)) : '—')

export function docRows(docs: MyDocuments | null, tab: DocTab): DocRow[] {
  if (!docs) return []
  if (tab === 'Company') {
    return [...docs.company]
      .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt))
      .map(c => ({ id: c.id, kind: 'document', title: c.name, date: label(c.uploadedAt), ext: c.ext || 'FILE', size: sizeLabel(c.size), isNew: !c.seen, contentType: c.contentType }))
  }
  const letters: DocRow[] = docs.personal.letters.map(l => ({
    id: l.id, kind: 'letter', title: l.typeName && l.typeName !== 'Letter' ? l.typeName : l.name, date: label(l.at), ext: l.ext || 'FILE',
    size: sizeLabel(l.size), isNew: !l.readAt, contentType: l.contentType,
  }))
  const files: DocRow[] = docs.personal.files.map(f => ({
    id: f.id, kind: 'drive', title: f.name.replace(/\.[a-z0-9]{1,5}$/i, ''), date: label(f.at), ext: f.ext || 'FILE',
    size: sizeLabel(f.size), isNew: !f.seen, contentType: f.contentType,
  }))
  const at = (r: DocRow) => (r.kind === 'letter' ? docs.personal.letters.find(l => l.id === r.id)?.at : docs.personal.files.find(f => f.id === r.id)?.at) ?? ''
  return [...letters, ...files].sort((a, b) => at(b).localeCompare(at(a)))
}

/** "Issued 3 Mar 2023 · PDF · 410 KB" / "Updated 1 Oct 2026 · PDF · 240 KB". */
export const docSub = (r: DocRow, tab: DocTab) => `${tab === 'Company' ? 'Updated' : 'Issued'} ${r.date} · ${r.ext} · ${r.size}`

export const DOC_SUBS: Readonly<Record<DocTab, string>> = {
  Personal: 'Letters HR has saved to your record. Only you and HR see them.',
  Company: 'Published by HR for everyone at HOUZS Venture.',
}

export function docFacts(r: DocRow, tab: DocTab) {
  return {
    eyebrow: tab === 'Personal' ? 'Personal document' : 'Company document',
    facts: [
      { label: 'From', value: 'HR' },
      { label: 'Date', value: r.date },
      { label: 'Kept', value: tab === 'Personal' ? 'Kept for your whole employment' : 'For everyone at HOUZS Venture' },
    ],
    note: tab === 'Personal' ? 'Saved to your record by HR. Ask HR if something is missing.' : 'HR keeps the current version here. Older versions stay with HR.',
  }
}

/** What the viewer can draw: a PDF page by page, a picture; anything else is downloaded. */
export function viewKind(r: Pick<DocRow, 'ext' | 'contentType'>): 'pdf' | 'image' | 'none' {
  const ext = r.ext.toLowerCase()
  if (ext === 'pdf' || r.contentType === 'application/pdf') return 'pdf'
  if (['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext) || (r.contentType ?? '').startsWith('image/')) return 'image'
  return 'none'
}

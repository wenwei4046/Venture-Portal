'use server'

import { requireAuth } from '@/lib/auth'
import { loadMyDocuments, openMyDocument, type MyDocKind } from './my-docs'
import type { MyDocuments } from './personal'

/**
 * My documents (2026-10-14) — the HR app's More › My documents and the portal's Admin › My documents: the signed-in
 * login's own, under its own session (the database answers for `auth.uid()` only, so no permission cell is asked: what
 * is addressed to you is yours, as a memo is). Never while viewing as somebody — the screen would seem to be theirs.
 * Refusals come back as `{ ok: false, reason }`: a thrown message never reaches the browser in production.
 */

export type MyDocsOutcome = { ok: true; data: MyDocuments } | { ok: false; reason: string }
export type MyLinkOutcome = { ok: true; url: string; fileName: string } | { ok: false; reason: string }

const VIEWING_AS = 'Your own documents are not shown while viewing as somebody.'
const KINDS: ReadonlySet<string> = new Set(['document', 'drive', 'letter'])
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function fetchMyDocuments(): Promise<MyDocsOutcome> {
  const user = await requireAuth()
  if (user.viewingAs) return { ok: false, reason: VIEWING_AS }
  const read = await loadMyDocuments()
  return read.ok ? { ok: true, data: read.data } : { ok: false, reason: read.reason }
}

/** One of them: a short link made at the tap (opened in a tab readied in the tap), the open recorded for HR. */
export async function openMyDoc(kind: MyDocKind, id: string, mode: 'view' | 'download' = 'view'): Promise<MyLinkOutcome> {
  const user = await requireAuth()
  if (user.viewingAs) return { ok: false, reason: VIEWING_AS }
  if (!KINDS.has(kind) || !UUID.test(id)) return { ok: false, reason: 'That is not there.' }
  const link = await openMyDocument(kind, id, mode === 'download' ? 'download' : 'view')
  return link.ok ? { ok: true, url: link.url, fileName: link.fileName } : { ok: false, reason: link.reason }
}

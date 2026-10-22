'use server'

import { pushSoon } from '@/lib/push/outbox'
import { isPicCode, picPageFromRow, picRefusal, type PicPage } from './pic'
import { picClient } from './pic-server'

/**
 * The PIC's answer on their link (⑤-1, mig 20261024003000). There is no sign-in to ask for: the link's CODE is the
 * key, and mkt_pic_answer checks it (a product project's, sent, waiting for the PIC) — this only tidies the input. It
 * answers `{ ok, reason }` in the page's words: a refusal the database wrote for the PIC, else the call's own
 * (`picRefusal`, the guest link's rule). The owner's notice goes to their phone too (`pushSoon`).
 */
export type PicDone = { ok: true; page: PicPage | null } | { ok: false; reason: string }

export async function answerPic(code: string, decision: 'approve' | 'changes', name: string, reason: string): Promise<PicDone> {
  if (typeof code !== 'string' || !isPicCode(code)) return { ok: false, reason: 'This link is closed.' }
  if (decision !== 'approve' && decision !== 'changes') return { ok: false, reason: 'Approve, or say what should change.' }
  const { data, error } = await picClient().rpc('mkt_pic_answer', {
    p_code: code,
    p_decision: decision,
    p_name: String(name ?? '').slice(0, 200),
    p_reason: decision === 'changes' ? String(reason ?? '').slice(0, 2000) : null,
  })
  if (error) return { ok: false, reason: picRefusal(error, 'Your answer could not be sent. Please try again.') }
  pushSoon()
  return { ok: true, page: picPageFromRow(data) }
}

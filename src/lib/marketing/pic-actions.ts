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

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** The PIC's answer on a deliverable's stage (②b-2d, mig 20261025033000): mkt_pic_stage_answer checks the code is the
 * deliverable's product project's, the stage waits for the PIC, at the version they read. */
export async function answerPicStage(code: string, project: string, version: number, decision: 'approve' | 'changes', name: string, reason: string): Promise<PicDone> {
  if (typeof code !== 'string' || !isPicCode(code)) return { ok: false, reason: 'This link is closed.' }
  if (typeof project !== 'string' || !UUID.test(project) || !Number.isInteger(version)) return { ok: false, reason: 'Reload the page and try again.' }
  if (decision !== 'approve' && decision !== 'changes') return { ok: false, reason: 'Approve, or say what should change.' }
  const { data, error } = await picClient().rpc('mkt_pic_stage_answer', {
    p_code: code,
    p_project: project,
    p_version: version,
    p_decision: decision,
    p_name: String(name ?? '').slice(0, 200),
    p_reason: decision === 'changes' ? String(reason ?? '').slice(0, 2000) : null,
  })
  if (error) return { ok: false, reason: picRefusal(error, 'Your answer could not be sent. Please try again.') }
  pushSoon()
  return { ok: true, page: picPageFromRow(data) }
}

import type { SupabaseClient } from '@supabase/supabase-js'
import { sendWhatsAppText } from '../whatsapp/send'
import { pageToken, sendMessengerText } from '../messenger/send'
import type { CrmAutoReplySet } from './crm-data'

/**
 * Auto-replies, sent (2026-10-19; the owner: "只要业务有设定 & 开启，那当广告资讯进来，就可以发送", "分配到CRM后也要可以根据crm
 * 的自动回复发送"; mig 20261019120000). The person a chat is given to keeps their own (Profile › Auto-reply): a welcome
 * for a customer's first message, an after-hours note outside their hours (the office's clock), and keyword replies.
 * After Meta has its answer, the webhook hands the delivery's customer messages here; each reply is claimed in the
 * database first (once — the same words within an hour are not sent again), then sent from the number / Page the
 * customer wrote to, then given Meta's id. Never throws.
 */

const OFFICE_OFFSET_MS = 8 * 3_600_000 // Asia/Kuala_Lumpur, no daylight saving

/** Minutes past midnight on the office's clock. */
export const officeMinutes = (at: Date) => {
  const d = new Date(at.getTime() + OFFICE_OFFSET_MS)
  return d.getUTCHours() * 60 + d.getUTCMinutes()
}
const toMinutes = (hhmm: string | undefined, fallback: number) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec((hhmm ?? '').trim())
  return m && +m[1] < 24 && +m[2] < 60 ? +m[1] * 60 + +m[2] : fallback
}
/** Outside from–to (an evening-to-morning window works too). */
export function afterHours(at: Date, from?: string, to?: string): boolean {
  const f = toMinutes(from, 8 * 60), t = toMinutes(to, 20 * 60), now = officeMinutes(at)
  if (f === t) return false
  return f < t ? now < f || now >= t : now < f && now >= t
}

/** Inside an away period: from and to are the office's (UTC+8) date and time, "2026-12-24T18:00". */
export function inAway(at: Date, from?: string, to?: string): boolean {
  const t = (s?: string) => (s && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s) ? Date.parse(`${s}:00+08:00`) : NaN);
  const a = t(from), b = t(to), x = at.getTime();
  return !Number.isNaN(a) && !Number.isNaN(b) && x >= a && x < b;
}

/** The replies one customer message triggers, in the order they go: welcome, away (else after hours), keywords. */
export function autoReplyTexts(settings: Partial<CrmAutoReplySet> | null | undefined, msg: { body: string; sentAt: string; first: boolean }): string[] {
  if (!settings) return []
  const out: string[] = []
  const add = (t: string | undefined) => { const s = (t ?? '').trim(); if (s && !out.includes(s)) out.push(s) }
  if (settings.welcome?.on && msg.first) add(settings.welcome.text)
  const at = new Date(msg.sentAt)
  // Away (holiday) takes the place of the after-hours reply while it lasts.
  const away = !!settings.away?.on && !Number.isNaN(at.getTime()) && inAway(at, settings.away.from, settings.away.to)
  if (away) add(settings.away!.text)
  else if (settings.after?.on && !Number.isNaN(at.getTime()) && afterHours(at, settings.after.from, settings.after.to)) add(settings.after.text)
  const text = (msg.body ?? '').toLowerCase()
  if (text) for (const k of settings.kws ?? []) {
    if (!k?.on) continue
    const words = (k.words ?? '').split(/[,，]/).map(w => w.trim().toLowerCase()).filter(Boolean)
    if (words.some(w => text.includes(w))) add(k.text)
  }
  return out
}

interface DueRow { message_id: string; contact_id: string; account_id: string; customer: string; body: string; sent_at: string; first: boolean; settings: Partial<CrmAutoReplySet> | null }

export async function sendAutoReplies(db: SupabaseClient, channel: 'whatsapp' | 'messenger', externalIds: string[],
  token: string | undefined, fetchImpl: typeof fetch = fetch): Promise<number> {
  const ids = [...new Set(externalIds.filter(Boolean))]
  if (!token || !ids.length) return 0
  let sent = 0
  try {
    const { data, error } = await db.rpc('crm_auto_reply_due', { p_channel: channel, p_external_ids: ids })
    if (error || !Array.isArray(data)) return 0
    const pages = new Map<string, string | null>()
    for (const row of data as DueRow[]) {
      for (const text of autoReplyTexts(row.settings, { body: row.body, sentAt: row.sent_at, first: row.first })) {
        const { data: claimed, error: ce } = await db.rpc('crm_auto_reply_claim', { p_message: row.message_id, p_body: text })
        if (ce || typeof claimed !== 'string') continue
        let result: { ok: true; id: string } | { ok: false; error: string }
        if (channel === 'whatsapp') {
          const r = await sendWhatsAppText({ phoneNumberId: row.account_id, to: row.customer, body: text, token }, fetchImpl)
          result = r.ok ? { ok: true, id: r.wamid } : r
        } else {
          if (!pages.has(row.account_id)) pages.set(row.account_id, await pageToken(row.account_id, token, fetchImpl))
          const pt = pages.get(row.account_id)
          const r = pt ? await sendMessengerText({ pageId: row.account_id, psid: row.customer, body: text, token: pt, window: 'open' }, fetchImpl)
            : { ok: false as const, error: 'This Facebook Page is not connected to the CRM.' }
          result = r.ok ? { ok: true, id: r.mid } : r
        }
        await db.rpc('crm_auto_reply_done', { p_id: claimed, p_external_id: result.ok ? result.id : null, p_error: result.ok ? null : result.error })
        if (result.ok) sent++
      }
    }
  } catch (e) {
    console.error('crm auto-reply failed:', e instanceof Error ? e.message : 'unknown')
  }
  return sent
}

// Lead View › a Messenger delivery's events for the brands' Pages (2026-10-27, mig 20261027130000). Two things the CRM's
// parser leaves out matter to Lead View:
//   - `standby`: while Meta's AI (or another app) holds a conversation, its customer's messages reach this app as standby
//     events, not messaging ones — the same shape, read here as messages, so Lead View sees every customer;
//   - echoes: what the Page sends — from Business Suite, its AI, the phone — comes back marked is_echo, and is kept on the
//     conversation (lead_ingest_page_replies) unless this app sent it (its app_id), which Lead View has already.
// The CRM's Pages are never read here (its parser and functions are unchanged).

import { metaMediaUrl, parseMessengerDelivery, type MsgInbound, type MsgKind } from '@/lib/messenger/webhook'

export interface PageReply {
  externalId: string
  pageId: string
  /** The customer the Page wrote to. */
  psid: string
  kind: MsgKind
  body: string | null
  /** A photo, video, voice note or file the Page sent: Meta's own address (mig 20261027180000; it expires after a while). */
  mediaUrl?: string | null
  /** Meta's id of the message this reply quotes (mig 20261027220000). */
  replyToMid?: string | null
  sentAt: string
}

type Ev = {
  sender?: { id?: string }
  recipient?: { id?: string }
  timestamp?: number
  message?: { mid?: string; text?: string; is_echo?: boolean; app_id?: number | string; attachments?: Array<{ type?: string; title?: string; payload?: TemplatePayload & { sticker_id?: number; url?: string } }>; reply_to?: { mid?: string } }
}

type TemplateButton = { title?: string }
type TemplatePayload = { text?: string; buttons?: TemplateButton[]; elements?: Array<{ title?: string; subtitle?: string; buttons?: TemplateButton[] }> }

/**
 * The words of a card the Page sent (2026-10-28 — the user, a "[Message]" in Lead View where Business Suite showed a
 * greeting with three buttons): Meta's `template` attachment — a button template (its title or text, then its
 * buttons) or a generic one (each card's title, subtitle and buttons). A button reads "▸ <title>". Null for anything else.
 */
export function templateText(a: { type?: string; title?: string; payload?: TemplatePayload } | undefined): string | null {
  if (a?.type !== 'template' || !a.payload) return null
  const buttons = (bs?: TemplateButton[]) => (bs ?? []).map(b => b.title?.trim()).filter(Boolean).map(t => '▸ ' + t)
  const parts = [a.title?.trim() || a.payload.text?.trim() || '', ...buttons(a.payload.buttons)]
  for (const el of a.payload.elements ?? []) parts.push(...[el.title?.trim(), el.subtitle?.trim()].filter((x): x is string => !!x), ...buttons(el.buttons))
  const text = parts.filter(Boolean).join('\n')
  return text ? text.slice(0, 2000) : null
}

const KINDS: Record<string, MsgKind> = { image: 'image', video: 'video', audio: 'audio', file: 'document', location: 'location' }

/** Meta's receipts for the brands' Pages (mig 20261027190000): messages delivered (their ids) and read (a watermark). */
export interface PageReceipts {
  delivered: { externalId: string }[]
  reads: { pageId: string; psid: string; watermark: string }[]
}

/** The Lead View Pages' customer messages (messaging and standby), the Page's own replies sent from elsewhere, and receipts. */
export function leadPageEvents(body: unknown, crmPages: Set<string>, ourAppId: string | undefined): { messages: MsgInbound[]; replies: PageReply[]; receipts: PageReceipts } {
  const b = body as { object?: string; entry?: Array<{ id?: string; time?: number; messaging?: Ev[]; standby?: Ev[] }> } | null
  if (b?.object !== 'page' || !Array.isArray(b.entry)) return { messages: [], replies: [], receipts: { delivered: [], reads: [] } }
  const entries = b.entry
    .filter(e => e?.id && !crmPages.has(e.id))
    .map(e => ({ ...e, messaging: [...(Array.isArray(e.messaging) ? e.messaging : []), ...(Array.isArray(e.standby) ? e.standby : [])] }))
  const parsed = parseMessengerDelivery({ object: 'page', entry: entries })
  const messages = parsed.messages
  const replies: PageReply[] = []
  for (const e of entries) {
    for (const ev of e.messaging) {
      const m = ev?.message
      if (!m?.is_echo || !m.mid || !ev.recipient?.id) continue
      if (ourAppId && String(m.app_id ?? '') === ourAppId) continue // sent by Lead View itself
      const first = m.attachments?.[0]
      const card = m.text ? null : templateText(first)
      const kind: MsgKind = m.text || card ? 'text' : first ? (first.type === 'image' && first.payload?.sticker_id ? 'sticker' : KINDS[first.type ?? ''] ?? 'other') : 'text'
      replies.push({
        externalId: m.mid, pageId: e.id!, psid: ev.recipient.id, kind, body: m.text ?? card,
        ...(['image', 'video', 'audio', 'file'].includes(first?.type ?? '') && metaMediaUrl(first?.payload?.url) ? { mediaUrl: metaMediaUrl(first?.payload?.url) } : {}),
        ...(m.reply_to?.mid ? { replyToMid: m.reply_to.mid } : {}),
        sentAt: new Date(typeof ev.timestamp === 'number' ? ev.timestamp : Date.now()).toISOString(),
      })
    }
  }
  return { messages, replies, receipts: { delivered: parsed.delivered, reads: parsed.reads } }
}

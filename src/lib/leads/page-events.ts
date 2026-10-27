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
  sentAt: string
}

type Ev = {
  sender?: { id?: string }
  recipient?: { id?: string }
  timestamp?: number
  message?: { mid?: string; text?: string; is_echo?: boolean; app_id?: number | string; attachments?: Array<{ type?: string; payload?: { sticker_id?: number; url?: string } }> }
}

const KINDS: Record<string, MsgKind> = { image: 'image', video: 'video', audio: 'audio', file: 'document', location: 'location' }

/** The Lead View Pages' customer messages (messaging and standby) and the Page's own replies sent from elsewhere. */
export function leadPageEvents(body: unknown, crmPages: Set<string>, ourAppId: string | undefined): { messages: MsgInbound[]; replies: PageReply[] } {
  const b = body as { object?: string; entry?: Array<{ id?: string; time?: number; messaging?: Ev[]; standby?: Ev[] }> } | null
  if (b?.object !== 'page' || !Array.isArray(b.entry)) return { messages: [], replies: [] }
  const entries = b.entry
    .filter(e => e?.id && !crmPages.has(e.id))
    .map(e => ({ ...e, messaging: [...(Array.isArray(e.messaging) ? e.messaging : []), ...(Array.isArray(e.standby) ? e.standby : [])] }))
  const messages = parseMessengerDelivery({ object: 'page', entry: entries }).messages
  const replies: PageReply[] = []
  for (const e of entries) {
    for (const ev of e.messaging) {
      const m = ev?.message
      if (!m?.is_echo || !m.mid || !ev.recipient?.id) continue
      if (ourAppId && String(m.app_id ?? '') === ourAppId) continue // sent by Lead View itself
      const first = m.attachments?.[0]
      const kind: MsgKind = m.text ? 'text' : first ? (first.type === 'image' && first.payload?.sticker_id ? 'sticker' : KINDS[first.type ?? ''] ?? 'other') : 'text'
      replies.push({
        externalId: m.mid, pageId: e.id!, psid: ev.recipient.id, kind, body: m.text ?? null,
        ...(['image', 'video', 'audio', 'file'].includes(first?.type ?? '') && metaMediaUrl(first?.payload?.url) ? { mediaUrl: metaMediaUrl(first?.payload?.url) } : {}),
        sentAt: new Date(typeof ev.timestamp === 'number' ? ev.timestamp : Date.now()).toISOString(),
      })
    }
  }
  return { messages, replies }
}

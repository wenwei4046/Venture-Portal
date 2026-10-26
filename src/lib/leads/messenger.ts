// Lead View › Messenger out (2026-10-26, the go-live; mig 20261026110000): one message to one customer through the
// brand's Page — Customer Service's reply, or a template's message with its buttons as Messenger quick replies. The
// CRM's Graph helpers do the asking (lib/messenger/send.ts: the Page's token, the Send API, Meta's words for a refusal);
// this adds Lead View's rules: Meta's window (24 hours; Human Agent waits for App Review), a template's buttons, and the
// answer the database keeps — Meta's id, or why it was not sent. Every token stays on the server.

import { messengerWindow, pageToken, sendMessengerText } from '@/lib/messenger/send'

export interface Outgoing {
  pageId: string | null
  psid: string
  body: string
  /** A template's buttons (Messenger takes 13, 20 characters each); null for a reply. */
  buttons?: string[] | null
  /** When the customer last wrote — Meta's window runs from it. */
  lastInAt: string | null
}

export type Delivered = { mid: string } | { error: string }

export const WINDOW_SHUT = 'More than 24 hours since the customer’s last message — Messenger does not allow a reply now.'
export const NO_PAGE = 'This conversation has no Facebook Page to send from.'
export const NOT_CONNECTED = 'Messenger is not connected on this server (no Meta token).'
export const NO_PAGE_TOKEN = 'Meta gave no access token for this Page — check that the Page is assigned to the system user.'

/** A template's buttons as Messenger's quick replies (13 at most, 20 characters each); none → the plain text. */
export function messageOf(body: string, buttons?: string[] | null): { text: string; quick_replies?: Array<{ content_type: 'text'; title: string; payload: string }> } {
  const titles = (buttons ?? []).map(b => b.trim().slice(0, 20)).filter(Boolean).slice(0, 13)
  return titles.length
    ? { text: body, quick_replies: titles.map(title => ({ content_type: 'text', title, payload: title })) }
    : { text: body }
}

/** Send one message; answers Meta's id or why not — never throws. */
export async function deliver(o: Outgoing, systemToken: string | undefined, now: Date = new Date(), fetchImpl: typeof fetch = fetch): Promise<Delivered> {
  if (!o.pageId) return { error: NO_PAGE }
  const window = messengerWindow(o.lastInAt, now)
  if (window === 'shut') return { error: WINDOW_SHUT }
  if (!systemToken) return { error: NOT_CONNECTED }
  const token = await pageToken(o.pageId, systemToken, fetchImpl)
  if (!token) return { error: NO_PAGE_TOKEN }
  const r = await sendMessengerText({ pageId: o.pageId, psid: o.psid, body: o.body, token, window, message: messageOf(o.body, o.buttons) }, fetchImpl)
  return r.ok ? { mid: r.mid } : { error: r.error }
}

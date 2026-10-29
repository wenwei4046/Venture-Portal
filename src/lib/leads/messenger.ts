// Lead View › Messenger out (2026-10-26, the go-live; mig 20261026110000): one message to one customer through the
// brand's Page — Customer Service's reply, or a template's message with its buttons as Messenger quick replies. The
// CRM's Graph helpers do the asking (lib/messenger/send.ts: the Page's token, the Send API, Meta's words for a refusal);
// this adds Lead View's rules: Meta's window (24 hours; Human Agent waits for App Review), a template's buttons, and the
// answer the database keeps — Meta's id, or why it was not sent. Every token stays on the server.

import { messengerError, messengerWindow, pageToken, sendMessengerAttachment, sendMessengerText } from '@/lib/messenger/send'
import { GRAPH_VERSION } from '@/lib/whatsapp/send'

export interface Outgoing {
  pageId: string | null
  psid: string
  body: string
  /** A template's buttons (Messenger takes 13, 20 characters each); null for a reply. */
  buttons?: string[] | null
  /** When the customer last wrote — Meta's window runs from it. */
  lastInAt: string | null
  /** Meta's id of the message this reply answers (mig 20261027220000); Meta quotes it above the reply. */
  replyToMid?: string | null
}

export type Delivered = { mid: string } | { error: string }

export const WINDOW_SHUT = 'More than 24 hours since the customer’s last message — Messenger does not allow a reply now.'
export const NO_PAGE = 'This conversation has no Facebook Page to send from.'
export const NOT_CONNECTED = 'Messenger is not connected on this server (no Meta token).'
export const NO_PAGE_TOKEN = 'Meta gave no access token for this Page — check that the Page is assigned to the system user.'

/** What Messenger shows on a quick-reply button (Meta's rule). */
export const BUTTON_CHARS = 20
/** A tapped button's payload carries its whole option behind this mark (lib/leads/page-events.ts reads it back). */
export const OPTION_PAYLOAD = 'LV:'

const clip = (s: string) => ([...s].length > BUTTON_CHARS ? [...s].slice(0, BUTTON_CHARS - 1).join('') + '…' : s)

/**
 * A template's buttons as Messenger's quick replies (13 at most). A button shows 20 characters, so when an option is
 * longer (2026-10-29 — the user: "button 不要限制字数") every option is also written in full, numbered, under the
 * message, and the buttons read "1. …". The payload carries the whole option, so the tap reads as the option.
 */
export function messageOf(body: string, buttons?: string[] | null): { text: string; quick_replies?: Array<{ content_type: 'text'; title: string; payload: string }> } {
  const labels = (buttons ?? []).map(b => b.trim()).filter(Boolean).slice(0, 13)
  if (!labels.length) return { text: body }
  const long = labels.some(l => [...l].length > BUTTON_CHARS)
  return {
    text: long ? `${body}\n\n${labels.map((l, i) => `${i + 1}. ${l}`).join('\n')}` : body,
    quick_replies: labels.map((l, i) => ({ content_type: 'text' as const, title: long ? clip(`${i + 1}. ${l}`) : l, payload: OPTION_PAYLOAD + l.slice(0, 900) })),
  }
}

/** Send one message; answers Meta's id or why not — never throws. */
export async function deliver(o: Outgoing, systemToken: string | undefined, now: Date = new Date(), fetchImpl: typeof fetch = fetch): Promise<Delivered> {
  if (!o.pageId) return { error: NO_PAGE }
  const window = messengerWindow(o.lastInAt, now)
  if (window === 'shut') return { error: WINDOW_SHUT }
  if (!systemToken) return { error: NOT_CONNECTED }
  const token = await pageToken(o.pageId, systemToken, fetchImpl)
  if (!token) return { error: NO_PAGE_TOKEN }
  const r = await sendMessengerText({ pageId: o.pageId, psid: o.psid, body: o.body, token, window, message: messageOf(o.body, o.buttons), replyToMid: o.replyToMid }, fetchImpl)
  return r.ok ? { mid: r.mid } : { error: r.error }
}

/**
 * The Page's emoji on a customer's message (mig 20261027220000): Meta's sender action `react` (one emoji; reacting
 * again replaces it) or `unreact` (emoji null). Null when Meta took it, else why not — never throws.
 */
export async function sendReaction(
  o: { pageId: string | null; psid: string; mid: string }, emoji: string | null, systemToken: string | undefined, fetchImpl: typeof fetch = fetch,
): Promise<string | null> {
  if (!o.pageId) return NO_PAGE
  if (!systemToken) return NOT_CONNECTED
  const token = await pageToken(o.pageId, systemToken, fetchImpl)
  if (!token) return NO_PAGE_TOKEN
  const body = emoji
    ? { recipient: { id: o.psid }, sender_action: 'react', payload: { message_id: o.mid, reaction: emoji } }
    : { recipient: { id: o.psid }, sender_action: 'unreact', payload: { message_id: o.mid } }
  let res: Response
  try {
    res = await fetchImpl(`https://graph.facebook.com/${GRAPH_VERSION}/${encodeURIComponent(o.pageId)}/messages`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    })
  } catch {
    return 'Could not reach Messenger. Try again.'
  }
  if (res.ok) return null
  return messengerError(res.status, await res.json().catch(() => null))
}

/** Messenger takes an attachment up to 25 MB. */
export const FILE_LIMIT = 25 * 1024 * 1024
export const TOO_BIG = 'Messenger takes a photo or file up to 25 MB.'

/** What Messenger calls a file by its type. */
export function attachmentKind(mime: string): 'image' | 'video' | 'audio' | 'file' {
  return mime.startsWith('image/') ? 'image' : mime.startsWith('video/') ? 'video' : mime.startsWith('audio/') ? 'audio' : 'file'
}

/** Send one photo or file (2026-10-27, mig 20261027140000); Meta's id or why not — never throws. */
export async function deliverFile(
  o: Pick<Outgoing, 'pageId' | 'psid' | 'lastInAt'>, file: Blob, filename: string, mime: string,
  systemToken: string | undefined, now: Date = new Date(), fetchImpl: typeof fetch = fetch,
): Promise<Delivered> {
  if (!o.pageId) return { error: NO_PAGE }
  const window = messengerWindow(o.lastInAt, now)
  if (window === 'shut') return { error: WINDOW_SHUT }
  if (!systemToken) return { error: NOT_CONNECTED }
  if (file.size > FILE_LIMIT) return { error: TOO_BIG }
  const token = await pageToken(o.pageId, systemToken, fetchImpl)
  if (!token) return { error: NO_PAGE_TOKEN }
  const typed = file.type ? file : new Blob([file], { type: mime || 'application/octet-stream' })
  const r = await sendMessengerAttachment({ pageId: o.pageId, psid: o.psid, token, window, kind: attachmentKind(mime), file: typed, filename }, fetchImpl)
  return r.ok ? { mid: r.mid } : { error: r.error }
}

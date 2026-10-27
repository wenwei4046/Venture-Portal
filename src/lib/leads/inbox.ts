// Lead View › Inbox v2 (2026-10-22, the redesign v2 handoff `docs/design_handoff_lead_view_inbox/Inbox v2.dc.html`):
// what the screen works out — the columns' widths kept in the browser, who is replying now, where the phone
// stands. Pure, tested in inbox.test.ts.

import type { LeadContact } from './types'

/** The browser's memory of the Inbox's columns (the handoff's key and shape). */
export const LAYOUT_KEY = 'inboxv2-layout'
export const LIST_W = { start: 304, min: 230, max: 460 } as const
export const RIGHT_W = { start: 352, min: 290, max: 520 } as const

export interface InboxLayout {
  listW: number
  rightW: number
}

export function clampWidth(value: number, range: { start: number; min: number; max: number }): number {
  if (!Number.isFinite(value)) return range.start
  return Math.max(range.min, Math.min(range.max, Math.round(value)))
}

/** What the browser kept, or the handoff's widths — never a width outside a column's range. */
export function readLayout(raw: string | null): InboxLayout {
  let kept: Partial<Record<keyof InboxLayout, unknown>> = {}
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : {}
    if (parsed && typeof parsed === 'object') kept = parsed as typeof kept
  } catch {
    kept = {}
  }
  const num = (v: unknown, fallback: number) => (typeof v === 'number' ? v : fallback)
  return {
    listW: clampWidth(num(kept.listW, LIST_W.start), LIST_W),
    rightW: clampWidth(num(kept.rightW, RIGHT_W.start), RIGHT_W),
  }
}

/**
 * The two right-hand panels (2026-10-23, the user: the customer panel "默认展开，但可收起", the timeline "独立做在右手边，
 * 默认收起"): open or folded to a rail, as this browser last left them.
 */
export const PANELS_KEY = 'inboxv2-panels'
export const LOG_W = 300
export interface InboxPanels { card: boolean; log: boolean }
export function readPanels(raw: string | null): InboxPanels {
  try {
    const p: unknown = raw ? JSON.parse(raw) : {}
    const o = (p && typeof p === 'object' ? p : {}) as Record<string, unknown>
    return { card: o.card !== false, log: o.log === true }
  } catch {
    return { card: true, log: false }
  }
}

export type Replier = { kind: 'cs'; label: string } | { kind: 'template'; label: string }

/**
 * Who answers this chat now — the header's NOW pill. A button flow still waiting on the customer is replying
 * ("Template · Sofa enquiry"); otherwise Customer Service, by the signed-in name. The AI Agent never replies by
 * itself yet (copilot only), so it is never NOW.
 */
export function replyingNow(contact: Pick<LeadContact, 'flowState' | 'flowName'>, csName: string): Replier {
  if (contact.flowState === 'running') return { kind: 'template', label: `Template · ${contact.flowName?.trim() || 'Automation'}` }
  return { kind: 'cs', label: `CS · ${csName}` }
}

export type PhoneStage = 'none' | 'detected' | 'confirmed' | 'handed'

/** Where the phone card stands: handed over beats everything; else the phone's own state. */
export function phoneStage(contact: Pick<LeadContact, 'handedAt' | 'phone' | 'phoneState'>): PhoneStage {
  if (contact.handedAt) return 'handed'
  if (!contact.phone || contact.phoneState === 'none') return 'none'
  return contact.phoneState
}

/** The card's three steps, lit up to where it stands. */
export function phoneSteps(stage: PhoneStage): Array<{ label: 'Found' | 'Confirmed' | 'Handed'; reached: boolean }> {
  const reached = stage === 'none' ? -1 : ['detected', 'confirmed', 'handed'].indexOf(stage)
  return (['Found', 'Confirmed', 'Handed'] as const).map((label, i) => ({ label, reached: i <= reached }))
}

/** A visit day the date box can show (YYYY-MM-DD); anything else typed before Inbox v2 is kept as words. */
export function isVisitDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value.trim())
}

/** The list's unread badge (mig 20261027160000), as WhatsApp writes it: the number, 99+ past 99. */
export function unreadLabel(n: number): string {
  return n > 99 ? '99+' : String(n)
}

/** What a message's file is, to draw it as Messenger does: by its type when Lead View sent it, else by Meta's label. */
export function mediaKind(mime: string | null | undefined, body: string): 'image' | 'video' | 'audio' | 'file' {
  if (mime) return mime.startsWith('image/') ? 'image' : mime.startsWith('video/') ? 'video' : mime.startsWith('audio/') ? 'audio' : 'file'
  return /^\[(Photo|Sticker)\]/.test(body) ? 'image' : body.startsWith('[Video]') ? 'video' : body.startsWith('[Voice message]') ? 'audio' : 'file'
}

/** Only a label standing for the file ("[Photo]", "[File] plan.pdf") — not shown beside the file itself, as Messenger shows none. */
export function isMediaPlaceholder(body: string): boolean {
  return /^\[(Photo|Video|Voice message|Sticker|File)\]( [^\n]*)?$/.test(body.trim())
}

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

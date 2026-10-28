// Lead View (2026-10-16): handing a lead to a brand's salesperson. They are not in the system (the user:
// 銷售團隊不會在這個系統中 … 會用自己的手機去聯繫客戶) — Customer Service sends them the lead on WhatsApp
// from the browser, the text filled in here, and the portal records who got it (lead_handoff).

import { adLabel } from './ads'
import { formatPhone } from './phone'
import type { LeadBrand, LeadContact, LeadSales } from './types'

/** Who the rotation suggests: the fewest leads this week, then the list's order. Null when the brand has nobody. */
export function suggestedSales(brand: Pick<LeadBrand, 'sales'>): LeadSales | null {
  let best: LeadSales | null = null
  for (const s of brand.sales) {
    if (!best || s.week < best.week || (s.week === best.week && s.sortOrder < best.sortOrder)) best = s
  }
  return best
}

/**
 * The WhatsApp message to the salesperson, as Inbox v2 writes it (2026-10-22, the redesign v2 handoff): one line a
 * field, English and Chinese labels, '-' for what is not known so they know to ask.
 */
export function handoffText(contact: LeadContact, _brandName: string, sales: Pick<LeadSales, 'name'> | null, csName: string): string {
  const or = (v: string) => (v.trim() ? v.trim() : '-')
  const ad = adLabel(contact)
  return [
    `Hi ${sales ? sales.name : 'team'}, new lead from Lead View / 新客户`,
    `Name 姓名: ${or(contact.name)}`,
    `Phone 电话: ${contact.phone ? formatPhone(contact.phone) : '-'}`,
    `Interest 兴趣: ${or(contact.interest)}`,
    `Budget 预算: ${or(contact.budget)}`,
    `Showroom 门市: ${or(contact.showroom)}`,
    `Date 日期: ${visitDay(contact.preferredTime)}`,
    `Source 来源: ${ad ? `Ad · ${ad}` : 'Organic'}`,
    `Note 备注: ${or(contact.note)}`,
    `CS: ${csName}`,
  ].join('\n')
}

/** The visit's day as the message says it: a date the card picked → "Sat 24 Oct"; words typed before it was a date stay. */
export function visitDay(value: string): string {
  const v = value.trim()
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v)
  if (!m) return v || '-'
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
  return d.toLocaleDateString('en-GB', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' })
}

/**
 * Who a handed lead went to: its salesperson, or — handed with nobody named (mig 20261027120000, the brand's WhatsApp
 * group) — the sales group; null while not handed.
 */
export function handedTo(c: Pick<LeadContact, 'handedAt' | 'handedSalesName'>): string | null {
  return c.handedSalesName ?? (c.handedAt ? SALES_GROUP : null)
}
export const SALES_GROUP = 'Sales group'

export type InboxState = 'waiting' | 'answered' | 'handed'

/**
 * Where a conversation stands on the Inbox: handed over, the customer waiting for us, or answered. The customer wrote
 * last but this person has opened the chat since (`unread` 0, mig 20261027170000) — it is seen, not waiting
 * (2026-10-28 — the user: "只要客服打开之后，其实就不会在waiting里了，因为已经被打开，就属于看过"). Without an unread
 * count (Leads, or before the migration) the customer writing last is waiting, as before. With a count, the count
 * decides whoever wrote last — on a real Messenger conversation it is Messenger's own (`withMetaUnread`, mig
 * 20261028100000 — the user: "我需要跟msg 一摸一样"): an away auto-reply does not make a chat read in Business Suite.
 */
export function inboxState(contact: Pick<LeadContact, 'handedAt' | 'lastDir' | 'unread'>): InboxState {
  if (contact.handedAt) return 'handed'
  if (typeof contact.unread === 'number') return contact.unread > 0 ? 'waiting' : 'answered'
  return contact.lastDir === 'in' ? 'waiting' : 'answered'
}

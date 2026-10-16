// Lead View (2026-10-16): handing a lead to a brand's salesperson. They are not in the system (the user:
// 銷售團隊不會在這個系統中 … 會用自己的手機去聯繫客戶) — Customer Service sends them the lead on WhatsApp
// from the browser, the text filled in here, and the portal records who got it (lead_handoff).

import { formatPhone } from './phone'
import type { LeadBrand, LeadContact, LeadSales } from './types'

const CHANNEL: Readonly<Record<LeadContact['channel'], string>> = { messenger: 'Messenger', instagram: 'Instagram' }

/** Who the rotation suggests: the fewest leads this week, then the list's order. Null when the brand has nobody. */
export function suggestedSales(brand: Pick<LeadBrand, 'sales'>): LeadSales | null {
  let best: LeadSales | null = null
  for (const s of brand.sales) {
    if (!best || s.week < best.week || (s.week === best.week && s.sortOrder < best.sortOrder)) best = s
  }
  return best
}

/** The WhatsApp message to the salesperson. Blank fields say so rather than vanish, so they know to ask. */
export function handoffText(contact: LeadContact, brandName: string, sales: Pick<LeadSales, 'name'>, csName: string): string {
  const or = (v: string, missing: string) => (v.trim() ? v.trim() : missing)
  const lines = [
    `【${brandName} New lead 新客户】`,
    `Name 姓名: ${or(contact.name, '[—]')}`,
    `Phone 电话: ${contact.phone ? formatPhone(contact.phone) : '[—]'}`,
    `Interest 意向: ${or(contact.interest, '[not asked 未问]')}${contact.budget.trim() ? ` (budget 预算 ${contact.budget.trim()})` : ''}`,
    `Showroom 分店: ${or(contact.showroom, '[not set 未定]')} · ${or(contact.preferredTime, '[time not set 时间未定]')}`,
    `Source 来源: ${CHANNEL[contact.channel]}${contact.sourceAd.trim() ? ` · ${contact.sourceAd.trim()}` : ' · organic'}`,
  ]
  if (contact.note.trim()) lines.push(`Note 备注: ${contact.note.trim()}`)
  lines.push(`CS 客服: ${csName}`, `→ ${sales.name}, please call the customer to book a visit 🙏 请联络客户安排到店`)
  return lines.join('\n')
}

export type InboxState = 'waiting' | 'answered' | 'handed'

/** Where a conversation stands on the Inbox: handed over, the customer waiting for us, or answered. */
export function inboxState(contact: Pick<LeadContact, 'handedAt' | 'lastDir'>): InboxState {
  if (contact.handedAt) return 'handed'
  return contact.lastDir === 'in' ? 'waiting' : 'answered'
}

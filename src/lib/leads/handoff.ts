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
    `【${brandName} 新客戶 New lead】`,
    `姓名 Name：${or(contact.name, '[—]')}`,
    `電話 Phone：${contact.phone ? formatPhone(contact.phone) : '[—]'}`,
    `意向 Interest：${or(contact.interest, '[未問 not asked]')}${contact.budget.trim() ? `（預算 budget ${contact.budget.trim()}）` : ''}`,
    `分店 Showroom：${or(contact.showroom, '[未定 not set]')} · ${or(contact.preferredTime, '[時間未定 time not set]')}`,
    `來源 Source：${CHANNEL[contact.channel]}${contact.sourceAd.trim() ? ` · ${contact.sourceAd.trim()}` : ' · organic'}`,
  ]
  if (contact.note.trim()) lines.push(`備註 Note：${contact.note.trim()}`)
  lines.push(`客服 CS：${csName}`, `→ ${sales.name}，請聯絡客戶安排到店 🙏`)
  return lines.join('\n')
}

export type InboxState = 'waiting' | 'answered' | 'handed'

/** Where a conversation stands on the Inbox: handed over, the customer waiting for us, or answered. */
export function inboxState(contact: Pick<LeadContact, 'handedAt' | 'lastDir'>): InboxState {
  if (contact.handedAt) return 'handed'
  return contact.lastDir === 'in' ? 'waiting' : 'answered'
}

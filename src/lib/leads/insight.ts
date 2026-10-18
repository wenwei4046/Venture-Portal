// Lead View › Insight (2026-10-16): the period's conversations counted the way Customer Service is judged —
// the phone is the KPI (the user: 客服的 KPI 更多是在拿到電話號碼); handed, booked and came are for reference.

import { adLabel } from './ads'
import type { LeadBrand, LeadContact } from './types'

export interface Tally {
  conversations: number
  phones: number
  handed: number
  booked: number
  came: number
}

export interface TallyRow extends Tally {
  key: string
  label: string
}

export interface LeadInsight {
  total: Tally
  byBrand: TallyRow[]
  byAd: TallyRow[]
  /** Who handed the leads over (a conversation not handed yet counts under nobody). */
  byPerson: TallyRow[]
}

const empty = (): Tally => ({ conversations: 0, phones: 0, handed: 0, booked: 0, came: 0 })

function add(t: Tally, c: LeadContact) {
  t.conversations++
  if (c.phone) t.phones++
  if (c.handedAt) t.handed++
  if (c.appt === 'booked') t.booked++
  if (c.shown === 'came') t.came++
}

/** Phones ÷ conversations, as a whole percent; null with no conversations. */
export function rate(part: number, whole: number): number | null {
  return whole > 0 ? Math.round((part / whole) * 100) : null
}

export function leadInsight(contacts: LeadContact[], brands: Pick<LeadBrand, 'id' | 'name'>[], opts: { withTests?: boolean } = {}): LeadInsight {
  const rows = opts.withTests ? contacts : contacts.filter(c => !c.isTest)
  const total = empty()
  const brand = new Map<string, TallyRow>()
  const ad = new Map<string, TallyRow>()
  const person = new Map<string, TallyRow>()
  const row = (map: Map<string, TallyRow>, key: string, label: string) => {
    let r = map.get(key)
    if (!r) map.set(key, (r = { key, label, ...empty() }))
    return r
  }
  for (const b of brands) row(brand, b.id, b.name)
  for (const c of rows) {
    add(total, c)
    add(row(brand, c.brandId, brands.find(b => b.id === c.brandId)?.name ?? '—'), c)
    const adName = adLabel(c)
    add(row(ad, c.adId || adName || '', adName || 'Organic'), c)
    if (c.handedByName) add(row(person, c.handedByName, c.handedByName), c)
  }
  const byCount = (a: TallyRow, b: TallyRow) => b.conversations - a.conversations || a.label.localeCompare(b.label)
  return {
    total,
    byBrand: [...brand.values()],
    byAd: [...ad.values()].sort(byCount),
    byPerson: [...person.values()].sort(byCount),
  }
}

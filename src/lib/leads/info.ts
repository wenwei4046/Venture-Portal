// Lead View › General info and Business hours (2026-10-22, the redesign v2 handoff `Basic Info.dc.html`,
// `Business Hours.dc.html`; mig 20261022230000): the shapes lead_info() / lead_business_hours() answer, a card's
// status, its tokens `{code.field}`, what the Inbox's menu offers, and the hours' choices. Pure, tested in info.test.ts.

export interface InfoCat {
  id: string
  kind: 'showroom' | 'topic'
  label: string
  icon: string
  /** Added by CS — may be deleted; the four seeded may not. */
  custom: boolean
}

export interface InfoField {
  /** A showroom's fixed field; null for a label · value row. */
  key: 'address' | 'hours' | 'phone' | 'maps' | 'waze' | null
  label: string
  value: string
}

export interface InfoCard {
  id: string
  catId: string
  /** null = every brand. */
  brandId: string | null
  name: string
  code: string
  status: 'draft' | 'on' | 'off'
  validFrom: string | null
  validUntil: string | null
  note: string
  fields: InfoField[]
  uses: string[]
  updatedByName?: string
  updatedAt?: string
}

export interface LeadInfo {
  cats: InfoCat[]
  cards: InfoCard[]
}

/** A showroom's five fields, in the handoff's order, with their icons and hints. */
export const SHOP_FIELDS: ReadonlyArray<{ key: NonNullable<InfoField['key']>; label: string; icon: string; hint: string }> = [
  { key: 'address', label: 'Address', icon: 'mapPin', hint: 'Street, postcode, city' },
  { key: 'hours', label: 'Opening hours', icon: 'clock', hint: 'e.g. 10am – 10pm daily' },
  { key: 'phone', label: 'Phone', icon: 'phone', hint: '03-0000 0000' },
  { key: 'maps', label: 'Google Maps', icon: 'map', hint: 'https://maps.app.goo.gl/…' },
  { key: 'waze', label: 'Waze', icon: 'navigation', hint: 'https://waze.com/ul/…' },
]

/** Lower-case letters and digits joined by "-" — a code, or a field's half of a token. */
export function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

/** `{kl.address}` — what a reply template writes to have the field's value put in at send. */
export function tokenOf(card: Pick<InfoCard, 'code' | 'name'>, field: Pick<InfoField, 'key' | 'label'>): string {
  return `{${card.code || slug(card.name)}.${field.key || slug(field.label)}}`
}

export type CardStatus = { label: string; tone: 'green' | 'amber' | 'red' | 'none'; keys: string[] }

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const dayMonth = (d: string) => `${Number(d.slice(8))} ${MONTHS[Number(d.slice(5, 7)) - 1]}`
const daysBetween = (from: string, to: string) => Math.round((Date.parse(to + 'T00:00:00Z') - Date.parse(from + 'T00:00:00Z')) / 864e5)

/**
 * A card's status chip and the filters it answers to: Draft · Starts 8 Nov (Scheduled) · Expired · Ends in N days
 * (Ending soon, 14 days) · Off · In use.
 */
export function cardStatus(c: Pick<InfoCard, 'status' | 'validFrom' | 'validUntil'>, today: string): CardStatus {
  if (c.status === 'draft') return { label: 'Draft', tone: 'none', keys: ['Draft'] }
  if (c.validFrom && c.validFrom > today) return { label: `Starts ${dayMonth(c.validFrom)}`, tone: 'none', keys: ['Scheduled'] }
  const use = c.status === 'off' ? 'Off' : 'In use'
  if (c.validUntil && c.validUntil < today) return { label: 'Expired', tone: 'red', keys: ['Expired', use] }
  if (c.validUntil && daysBetween(today, c.validUntil) <= 14) {
    const n = daysBetween(today, c.validUntil)
    return { label: n === 0 ? 'Ends today' : `Ends in ${n} day${n === 1 ? '' : 's'}`, tone: 'amber', keys: ['Ending soon', use] }
  }
  return c.status === 'off' ? { label: 'Off', tone: 'none', keys: ['Off'] } : { label: 'In use', tone: 'green', keys: ['In use'] }
}

/** Is a card in use today — In use, inside its dates? Only those reach the Inbox, the agent and the templates. */
export function isLive(c: Pick<InfoCard, 'status' | 'validFrom' | 'validUntil'>, today: string): boolean {
  return c.status === 'on' && !(c.validFrom && c.validFrom > today) && !(c.validUntil && c.validUntil < today)
}

export interface InfoEntry {
  card: InfoCard
  cat: InfoCat | undefined
  fields: Array<{ label: string; value: string; token: string }>
}

/** What the Inbox's General info menu offers for a conversation's brand: live cards of that brand or every brand, filled fields and the note. */
export function infoEntries(info: LeadInfo, brandId: string | null, today: string): InfoEntry[] {
  const cats = new Map(info.cats.map(c => [c.id, c]))
  return info.cards
    .filter(c => isLive(c, today) && (c.brandId === null || c.brandId === brandId))
    .map(card => ({
      card,
      cat: cats.get(card.catId),
      fields: [...card.fields, ...(card.note.trim() ? [{ key: null, label: 'Notes', value: card.note } as InfoField] : [])]
        .filter(f => f.value.trim())
        .map(f => ({ label: f.label || 'Field', value: f.value, token: f.label === 'Notes' && !f.key ? `{${card.code}.notes}` : tokenOf(card, f) })),
    }))
    .filter(e => e.fields.length > 0)
}

/** A reply's tokens filled in from the live cards; one that names nothing live stays as written. */
export function resolveTokens(text: string, info: LeadInfo, today: string): string {
  const live = info.cards.filter(c => isLive(c, today))
  return text.replace(/\{([a-z0-9-]+)\.([a-z0-9-]+)\}/g, (whole, code: string, key: string) => {
    const card = live.find(c => c.code === code)
    if (!card) return whole
    if (key === 'notes') return card.note.trim() ? card.note : whole
    const f = card.fields.find(x => (x.key || slug(x.label)) === key)
    return f?.value.trim() ? f.value : whole
  })
}

// ── Business hours ──

export interface WeekDay {
  /** Monday = 1 … Sunday = 7. */
  day: number
  on: boolean
  from: string
  to: string
}

export interface SpecialDate {
  id: string
  name: string
  from: string
  to: string
  mode: 'closed' | 'custom'
  open: string
  close: string
}

export interface BusinessHours {
  week: WeekDay[]
  specials: SpecialDate[]
  updatedByName?: string
  updatedAt?: string
}

export const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const

/** Every half hour, as the handoff lists it: 00:00 → "12:00 AM" … 23:30 → "11:30 PM". */
export const HALF_HOURS: ReadonlyArray<{ v: string; l: string }> = Array.from({ length: 48 }, (_, k) => {
  const hh = Math.floor(k / 2)
  const mm = k % 2 ? '30' : '00'
  return { v: `${String(hh).padStart(2, '0')}:${mm}`, l: `${hh % 12 || 12}:${mm} ${hh < 12 ? 'AM' : 'PM'}` }
})

/** What the save would refuse, in the page's words; null when it is fine. "to" 00:00 is midnight. */
export function hoursProblem(h: Pick<BusinessHours, 'week' | 'specials'>): string | null {
  const closesBefore = (from: string, to: string) => to !== '00:00' && to <= from
  for (const d of h.week) if (d.on && closesBefore(d.from, d.to)) return `${DAY_NAMES[d.day - 1]} closes before it opens.`
  for (const s of h.specials) {
    if (!s.from || !s.to || s.from > s.to) return `${s.name || 'A special date'} ends before it starts.`
    if (s.mode === 'custom' && closesBefore(s.open, s.close)) return `${s.name || 'A special date'} closes before it opens.`
  }
  return null
}

/** What the migration seeds, for the page before it is applied (nothing can be saved then). */
export const DEFAULT_INFO: LeadInfo = {
  cats: [
    { id: 'seed-showroom', kind: 'showroom', label: 'Showrooms', icon: 'store', custom: false },
    { id: 'seed-payment', kind: 'topic', label: 'Payment methods', icon: 'credit-card', custom: false },
    { id: 'seed-delivery', kind: 'topic', label: 'Delivery', icon: 'truck', custom: false },
    { id: 'seed-warranty', kind: 'topic', label: 'Warranty and returns', icon: 'shield-check', custom: false },
  ],
  cards: [],
}

export const DEFAULT_HOURS: BusinessHours = {
  week: DAY_NAMES.map((_, i) => ({ day: i + 1, on: i < 5, from: '10:00', to: '22:00' })),
  specials: [],
}

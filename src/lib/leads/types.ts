// Lead View (2026-10-16): the shapes the lead_* functions answer (mig 20261016300200) as the screens read them.

export type LeadChannel = 'messenger' | 'instagram'
export type BrandTone = 'ink' | 'clay' | 'blue' | 'olive' | 'plum'
export type PhoneState = 'none' | 'detected' | 'confirmed'
export type Appt = 'unknown' | 'booked' | 'not_booked'
export type Shown = 'unknown' | 'came' | 'no_show'

export interface LeadSales {
  id: string
  name: string
  /** Digits only, as typed less the country code: 0120001101. */
  phone: string
  showroom: string
  sortOrder: number
  /** Leads handed to them in the last seven days — the rotation's count. */
  week: number
}

export interface LeadBrand {
  id: string
  name: string
  tone: BrandTone
  fbPageId: string | null
  igAccountId: string | null
  handoffMode: 'rotate' | 'pick'
  sortOrder: number
  sales: LeadSales[]
}

export interface LeadConfig {
  today: string
  brands: LeadBrand[]
  /** Conversations whose customer spoke last and that are not handed over. */
  waiting: number
  /** Phones got but not handed to a salesperson yet. */
  unhanded: number
}

export interface LeadContact {
  id: string
  brandId: string
  channel: LeadChannel
  isTest: boolean
  name: string
  sourceAd: string
  phone: string | null
  phoneState: PhoneState
  phoneAt: string | null
  interest: string
  budget: string
  showroom: string
  preferredTime: string
  note: string
  handedSalesId: string | null
  handedSalesName: string | null
  handedAt: string | null
  handedByName: string | null
  appt: Appt
  shown: Shown
  lastAt: string
  lastDir: 'in' | 'out'
  lastText: string
  createdAt: string
  /** The button flow on this conversation (mig 20261016310000): running = waiting on the customer's answer. */
  flowState?: 'none' | 'running' | 'done' | 'stopped'
  flowName?: string | null
  /** Promotions consent (mig 20261016340000): Meta's rule for a campaign past the 24-hour window. */
  optIn?: 'none' | 'in' | 'out'
  optInAt?: string | null
}

export interface LeadMessage {
  id: number
  direction: 'in' | 'out'
  sender: 'customer' | 'cs' | 'ai' | 'flow' | 'campaign'
  byName: string
  body: string
  phoneFound: string | null
  delivery: 'recorded' | 'sent' | 'failed'
  at: string
  /** A flow question's buttons, as the customer saw them. */
  buttons?: string[] | null
}

export interface LeadEvent {
  what: string
  by: string
  at: string
}

export interface LeadThread {
  contact: LeadContact
  messages: LeadMessage[]
  events: LeadEvent[]
}

/** The card's fields Customer Service edits (lead_save_card). */
export interface LeadCardFields {
  name?: string
  phone?: string
  interest?: string
  budget?: string
  showroom?: string
  preferredTime?: string
  note?: string
}

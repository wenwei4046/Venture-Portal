// Lead View › Campaigns (2026-10-16, the user's brief part 3: "Campaign Blasting 就是廣發資訊給客戶"). A brand's
// message to many customers, as Meta allows it: whoever wrote in the last 24 hours, and past that only whoever
// agreed to promotions (Meta charges per message); never whoever unsubscribed. The database counts and sends
// (lead_audience, mig 20261016340000); this file is the shapes, the rule's twin and the preview.

export type CampaignChannel = 'all' | 'messenger' | 'instagram'
export type CampaignStatus = 'draft' | 'scheduled' | 'sent'
export type OptIn = 'none' | 'in' | 'out'
export type Basis = 'window' | 'optin' | 'none' | 'out'

export interface Audience {
  /** Contacted within the last N days. */
  days: number
  /** Words in the card's interest (blank = any). */
  interest: string
  phone: 'any' | 'with' | 'without'
  handed: 'any' | 'yes' | 'no'
  source: 'any' | 'ad' | 'organic'
  /** Include test conversations (all there are until Meta is connected). */
  tests: boolean
}

export interface Campaign {
  id: string
  brandId: string
  name: string
  channel: CampaignChannel
  audience: Partial<Audience>
  body: string
  buttons: string[]
  status: CampaignStatus
  scheduledAt: string | null
  sentAt: string | null
  sentByName: string
  updatedByName: string
  updatedAt: string
  /** Delivered (recorded), of which on promotions consent (Meta charges), replied after it, phones got after it. */
  sent: number
  paid: number
  replied: number
  phones: number
}

export interface AudienceCount {
  matched: number
  window: number
  optin: number
  notOptedIn: number
  unsubscribed: number
  sample: string[]
}

export const DEFAULT_AUDIENCE: Audience = { days: 90, interest: '', phone: 'any', handed: 'any', source: 'any', tests: true }

export const DAY_CHOICES: ReadonlyArray<{ days: number; en: string; zh: string }> = [
  { days: 7, en: 'Last 7 days', zh: '7天内' },
  { days: 30, en: 'Last 30 days', zh: '30天内' },
  { days: 90, en: 'Last 90 days', zh: '90天内' },
  { days: 365, en: 'Last year', zh: '一年内' },
]

/** The audience as saved, every key filled. */
export function audienceOf(a: Partial<Audience> | null | undefined): Audience {
  return { ...DEFAULT_AUDIENCE, ...(a ?? {}) }
}

/**
 * Meta's rule, the twin of lead_audience's CASE: unsubscribed never; wrote in the last 24 hours → window (free);
 * else agreed to promotions → optin (charged); else none (left out).
 */
export function basisOf(optIn: OptIn, lastIncoming: string | null, now: Date = new Date()): Basis {
  if (optIn === 'out') return 'out'
  if (lastIncoming && now.getTime() - new Date(lastIncoming).getTime() < 24 * 3600 * 1000) return 'window'
  if (optIn === 'in') return 'optin'
  return 'none'
}

/** The message as one customer reads it: {name} is their name ("there" when we have none), as the send does. */
export function personalize(body: string, name: string): string {
  return body.split('{name}').join(name.trim() || 'there')
}

/** What is wrong before saving, in the database's words; null when it may be saved. */
export function campaignProblem(c: { brandId: string; name: string; body: string; buttons: string[]; scheduledAt: string | null }, now: Date = new Date()): string | null {
  if (!c.brandId) return 'Pick a brand.'
  if (!c.name.trim() || c.name.trim().length > 60) return 'A campaign needs a name (60 characters at most).'
  if (!c.body.trim() || c.body.trim().length > 1900) return 'Write the message (1,900 characters at most).'
  if (c.buttons.length > 3 || c.buttons.some(b => !b.trim() || b.length > 20)) return 'Up to 3 buttons, 20 characters each.'
  if (c.scheduledAt && new Date(c.scheduledAt).getTime() <= now.getTime()) return 'Schedule it for a time still to come.'
  return null
}

/** Of those it reached, the share who did something. Null before it is sent. */
export function share(part: number, of: number): number | null {
  return of ? Math.round((part / of) * 100) : null
}

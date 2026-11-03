// Lead View › Insight (2026-10-16): the period's conversations counted the way Customer Service is judged —
// the phone is the KPI (the user: 客服的 KPI 更多是在拿到電話號碼); handed, booked and came are for reference.

import { adLabel } from './ads'
import type { LeadFlow } from './flow'
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

// ── Insight v2 (2026-10-23, the redesign v2 handoff `Insight.dc.html`; step 6) ─────────────────────────────────────

/** lead_insight_more (mig 20261023400000): who answered first, and how far each template's steps got. */
export interface InsightMore {
  replies: Array<{ brandId: string; test: boolean; phone: boolean; by: 'cs' | 'template' | 'ai' | null; secs: number | null }>
  steps: Array<{ flowId: string; brandId: string; test: boolean; stepId: string; n: number }>
}

/** The v2 handoff's ranges (Today · 7 days · 30 days · Custom); 'q' (this quarter) is kept as a Custom preset. */
export type InsightRange = 'today' | '7' | '30' | 'custom' | 'q'
export const INSIGHT_RANGES: ReadonlyArray<[InsightRange, string]> = [['today', 'Today'], ['7', '7 days'], ['30', '30 days'], ['custom', 'Custom']]

const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10)
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const dayLabel = (day: string) => `${Number(day.slice(8))} ${MON[Number(day.slice(5, 7)) - 1]}`

/** ?r= → the office days it covers (today included) and how the page says it. 30 days is the default. */
/**
 * The period, both days included. `listTo` is the day after `to`: lead_list's end is exclusive, so handing it `to` left
 * today's conversations out — on Lead View's first live day Insight read 0 (2026-10-27).
 */
export function insightRange(raw: string | undefined, today: string, cFrom?: string, cTo?: string): { key: InsightRange; from: string; to: string; listTo: string; label: string } {
  const iso = (v?: string) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)) ? v : null)
  if (raw === 'custom') {
    const to = iso(cTo) && iso(cTo)! <= today ? iso(cTo)! : today
    const lo = addDays(today, -365)
    const from = iso(cFrom) && iso(cFrom)! <= to ? (iso(cFrom)! < lo ? lo : iso(cFrom)!) : addDays(to, -29)
    return { key: 'custom', from, to, listTo: addDays(to, 1), label: `${dayLabel(from)} – ${dayLabel(to)}` }
  }
  if (raw === 'today') return { key: 'today', from: today, to: today, listTo: addDays(today, 1), label: 'Today' }
  const key: InsightRange = raw === '7' || raw === 'q' ? raw : '30'
  if (key === 'q') {
    const m = Number(today.slice(5, 7))
    const from = `${today.slice(0, 4)}-${String(m - ((m - 1) % 3)).padStart(2, '0')}-01`
    return { key, from, to: today, listTo: addDays(today, 1), label: `${dayLabel(from)} – ${dayLabel(today)} ${today.slice(0, 4)}` }
  }
  const n = key === '7' ? 7 : 30
  return { key, from: addDays(today, -(n - 1)), to: today, listTo: addDays(today, 1), label: `Last ${n} days` }
}

const came = (c: LeadContact) => !!c.cameAt || c.shown === 'came'

/** "2026-10-01" … "2026-10-30": every day of a range, both ends included. */
export function daysOf(from: string, to: string): string[] {
  const out: string[] = []
  for (let d = from; d <= to && out.length < 400; d = addDays(d, 1)) out.push(d)
  return out
}

/** The trend: chats started and phones got per office day — or, for one day, per hour (0–23). */
export function trendOf(rows: Pick<LeadContact, 'createdAt' | 'phoneAt'>[], from: string, to: string): { unit: 'day' | 'hour'; keys: string[]; chats: number[]; phones: number[] } {
  const local = (iso: string) => new Date(Date.parse(iso) + 8 * 3600e3).toISOString()
  const hourly = from === to
  const keys = hourly ? Array.from({ length: 24 }, (_, h) => String(h)) : daysOf(from, to)
  const at = (iso: string | null | undefined) => {
    if (!iso) return -1
    const l = local(iso)
    if (hourly) return l.slice(0, 10) === from ? Number(l.slice(11, 13)) : -1
    return keys.indexOf(l.slice(0, 10))
  }
  const chats = keys.map(() => 0), phones = keys.map(() => 0)
  for (const c of rows) {
    const i = at(c.createdAt), j = at(c.phoneAt)
    if (i >= 0) chats[i]++
    if (j >= 0) phones[j]++
  }
  return { unit: hourly ? 'hour' : 'day', keys, chats, phones }
}

/** "1 Oct" for a day key, "10am" for an hour. */
export function trendLabel(key: string, unit: 'day' | 'hour'): string {
  if (unit === 'day') return dayLabel(key)
  const h = Number(key)
  return h === 0 ? '12am' : h < 12 ? `${h}am` : h === 12 ? '12pm' : `${h - 12}pm`
}

/** From message to sale: each step with its share of the step before. */
export function funnelOf(rows: LeadContact[]): Array<{ label: string; n: number; rate: string }> {
  const steps: Array<[string, number]> = [
    ['Chats', rows.length],
    ['Got phone', rows.filter(c => c.phone).length],
    ['Handed to sales', rows.filter(c => c.handedAt).length],
    ['Came to showroom', rows.filter(came).length],
    ['Closed', rows.filter(c => c.closedAt).length],
  ]
  return steps.map(([label, n], i) => {
    const prev = i ? steps[i - 1][1] : 0
    return { label, n, rate: i === 0 ? 'Started a chat' : prev ? `${rate(n, prev)}% of previous` : '— of previous' }
  })
}

export interface AdRow { key: string; name: string; brandId: string; channel: 'messenger' | 'instagram'; organic: boolean; chats: number; phones: number; came: number; bought: number }

/** By ad: one row per ad, and one "Organic · <brand>" row per brand for the chats no ad brought. */
export function adRowsOf(rows: LeadContact[], brands: Pick<LeadBrand, 'id' | 'name'>[]): AdRow[] {
  const out = new Map<string, AdRow>()
  for (const c of rows) {
    const organic = !c.adId && !c.sourceAd
    const key = organic ? `organic:${c.brandId}` : c.adId || c.sourceAd
    let r = out.get(key)
    if (!r) {
      r = { key, organic, brandId: c.brandId, channel: c.channel === 'instagram' ? 'instagram' : 'messenger', chats: 0, phones: 0, came: 0, bought: 0,
        name: organic ? `Organic · ${brands.find(b => b.id === c.brandId)?.name ?? '—'}` : adLabel(c) }
      out.set(key, r)
    }
    r.chats++
    if (c.phone) r.phones++
    if (came(c)) r.came++
    if (c.closedAt) r.bought++
  }
  return [...out.values()]
}

const BY: ReadonlyArray<['cs' | 'template' | 'ai', string]> = [['cs', 'Person'], ['template', 'Template'], ['ai', 'AI Agent']]

/** "6 min", "instant" (under 10 seconds), "1.5 h" — the middle reply time. */
export function speedOf(secs: number[]): string {
  if (!secs.length) return '—'
  const s = [...secs].sort((a, b) => a - b)[Math.floor((secs.length - 1) / 2)]
  if (s < 10) return 'instant'
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))} min`
  return `${(s / 3600).toFixed(1)} h`
}

/** Who replied first: chats each answered first, how often they got a phone, and how fast (the middle time). */
export function byReplyOf(replies: InsightMore['replies']): Array<{ key: string; label: string; chats: number; rate: number | null; speed: string }> {
  return BY.map(([key, label]) => {
    const mine = replies.filter(r => r.by === key)
    return { key, label, chats: mine.length, rate: rate(mine.filter(r => r.phone).length, mine.length), speed: speedOf(mine.map(r => r.secs ?? 0)) }
  })
}

/** Where customers drop off in one template: each step its message reached, as a share of the first step's. */
export function dropOf(flow: Pick<LeadFlow, 'id' | 'steps'>, steps: InsightMore['steps']): Array<{ id: string; label: string; n: number; pct: number }> {
  const mine = steps.filter(s => s.flowId === flow.id)
  const reached = flow.steps.map((st, i) => ({
    id: st.id,
    label: (st as { name?: string }).name || st.text.slice(0, 30) || `Step ${i + 1}`,
    n: mine.filter(s => s.stepId === st.id).reduce((t, s) => t + s.n, 0),
  })).filter(x => x.n > 0)
  const first = reached[0]?.n ?? 0
  return reached.map(x => ({ ...x, pct: first ? Math.round((x.n / first) * 100) : 0 }))
}

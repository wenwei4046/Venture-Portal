import type { LeadBrand } from './types'
import type { Reply, ReplyRules } from './template'
import type { SpecialDate } from './info'
import { HALF_HOURS } from './info'

/**
 * Lead View v2 › Settings' Pages, Reply rules' rows and Working hours' cards (2026-11-02, the v2 handoff §7.5, §7.12,
 * §7.14; mig 20261102110000). Pure: the screens and their tests share it.
 */

export type PageChannel = 'messenger' | 'instagram'

/** A connected page (lead_pages): a Facebook Page (Messenger) or an Instagram account. */
export interface LeadPage {
  id: string
  brandId: string
  channel: PageChannel
  /** The Page's id, or the Instagram account's. */
  externalId: string
  /** Instagram: the Facebook Page it is linked to. */
  pageId: string | null
  name: string
  paused: boolean
  connectedByName: string
  connectedAt: string
}

/** One of the system user's Pages (Graph `me/accounts`), with its linked Instagram account. */
export interface ManagedPage {
  id: string
  name: string
  followers: number | null
  ig: { id: string; username: string; followers: number | null } | null
}

/** Who is away (lead_staff_leave). */
export interface StaffLeave {
  id: string
  userId: string | null
  name: string
  from: string
  to: string
}

export type PageState = 'receiving' | 'paused' | 'reconnect'

/**
 * Receiving, Paused, or Reconnect — the system user can no longer reach it (its Page left the business, or the
 * token lost it). `managed` null = Meta not asked (no token): nothing is said to be lost.
 */
export function pageState(p: Pick<LeadPage, 'channel' | 'externalId' | 'paused'>, managed: ManagedPage[] | null): PageState {
  if (managed && !managed.some(m => (p.channel === 'messenger' ? m.id : m.ig?.id) === p.externalId)) return 'reconnect'
  return p.paused ? 'paused' : 'receiving'
}

export const STATE_LABEL: Record<PageState, string> = { receiving: 'Receiving', paused: 'Paused', reconnect: 'Reconnect' }

/** A page's name as Meta has it now, else as kept, else its kind. */
export function pageName(p: Pick<LeadPage, 'channel' | 'externalId' | 'name'>, managed: ManagedPage[] | null): string {
  const m = managed?.find(x => (p.channel === 'messenger' ? x.id : x.ig?.id) === p.externalId)
  const live = p.channel === 'messenger' ? m?.name : m?.ig ? `@${m.ig.username}` : undefined
  return live || p.name || (p.channel === 'messenger' ? `Facebook Page ${p.externalId}` : `Instagram ${p.externalId}`)
}

/** The Connect page window's list for a platform: each Page (or Page's Instagram), and whether it is connected. */
export function connectable(managed: ManagedPage[], channel: PageChannel, pages: Pick<LeadPage, 'channel' | 'externalId'>[]) {
  const rows = channel === 'messenger'
    ? managed.map(m => ({ externalId: m.id, pageId: null as string | null, name: m.name, followers: m.followers }))
    : managed.filter(m => m.ig).map(m => ({ externalId: m.ig!.id, pageId: m.id, name: `@${m.ig!.username}`, followers: m.ig!.followers }))
  return rows.map(r => ({ ...r, connected: pages.some(p => p.channel === channel && p.externalId === r.externalId) }))
}

export const followersLabel = (n: number | null) => (n == null ? '' : `${n >= 1000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k` : n} followers`)

/**
 * Reply rules' page rows (§7.14: "only pages that are not paused and not expired produce rows"), by brand in the
 * brands' order. A brand with no page of its own that rides on another's ("2990s mini" on the 2990s Page —
 * lead_ingest_messenger routes its customers) gets that page's rows too, so its replies can be set.
 */
export function routeRows(brands: Pick<LeadBrand, 'id' | 'name'>[], pages: LeadPage[], managed: ManagedPage[] | null): Array<{ brandId: string; brand: string; channels: PageChannel[] }> {
  const live = pages.filter(p => pageState(p, managed) === 'receiving')
  const own = (id: string) => (['messenger', 'instagram'] as const).filter(ch => live.some(p => p.brandId === id && p.channel === ch))
  return brands.flatMap(b => {
    let channels: PageChannel[] = own(b.id)
    if (!channels.length && !pages.some(p => p.brandId === b.id)) {
      const parent = brands.find(x => x.id !== b.id && `${x.name} mini`.toLowerCase() === b.name.toLowerCase())
      if (parent) channels = own(parent.id)
    }
    return channels.length ? [{ brandId: b.id, brand: b.name, channels }] : []
  })
}

/** An ad's or a time window's reply, or "Follows page" (no ad rule for that window). */
export type Slot = Reply | 'follow'

/**
 * An ad's two windows from its rules (lead_reply_rules: any / open / closed) — the runner takes the hours' rule
 * before an any-time one.
 */
export function adSlots(rules: ReplyRules['ads'], adId: string): { w: Slot; a: Slot } {
  const of = (when: 'open' | 'closed') => rules.find(r => r.adId === adId && r.when === when)?.reply
    ?? rules.find(r => r.adId === adId && r.when === 'any')?.reply ?? 'follow'
  return { w: of('open'), a: of('closed') }
}

/** The ad rules with this ad's two windows put in: one any-time rule when they agree, else one per window set. */
export function withAdSlots(rules: ReplyRules['ads'], adId: string, w: Slot, a: Slot, newId: () => string): ReplyRules['ads'] {
  const rest = rules.filter(r => r.adId !== adId)
  const mine = rules.filter(r => r.adId === adId)
  const reuse = (when: 'any' | 'open' | 'closed', reply: Reply) => ({ id: mine.find(r => r.when === when)?.id ?? newId(), adId, when, reply })
  if (w !== 'follow' && w === a) return [...rest, reuse('any', w)]
  const out: ReplyRules['ads'] = []
  if (w !== 'follow') out.push(reuse('open', w))
  if (a !== 'follow') out.push(reuse('closed', a))
  return [...rest, ...out]
}

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const parts = (iso: string) => { const d = new Date(`${iso}T00:00:00Z`); return { dow: DOW[d.getUTCDay()], day: d.getUTCDate(), mon: MON[d.getUTCMonth()], year: d.getUTCFullYear() } }

/** "Sun 8 Nov", "Mon 2 – Wed 4 Nov", "Mon 30 Nov – Tue 1 Dec"; the year only when it is not `thisYear`. */
export function dayRange(from: string, to: string, thisYear: number): string {
  const a = parts(from), b = parts(to)
  const yr = (p: ReturnType<typeof parts>) => (p.year === thisYear ? '' : ` ${p.year}`)
  if (from === to) return `${a.dow} ${a.day} ${a.mon}${yr(a)}`
  if (a.mon === b.mon && a.year === b.year) return `${a.dow} ${a.day} – ${b.dow} ${b.day} ${b.mon}${yr(b)}`
  return `${a.dow} ${a.day} ${a.mon}${a.year === b.year ? '' : ` ${a.year}`} – ${b.dow} ${b.day} ${b.mon}${yr(b)}`
}

export const timeLabel = (v: string) => HALF_HOURS.find(h => h.v === v)?.l ?? v

/** A holiday's mode as the card says it. */
export const holidayMode = (s: Pick<SpecialDate, 'mode' | 'open' | 'close'>) =>
  (s.mode === 'closed' ? 'Closed all day' : `${timeLabel(s.open)} – ${timeLabel(s.close)}`)

/** A reply as Reply rules and Settings name it: A person, AI Agent, or the template's name. */
export function replyLabel(v: string | undefined, templates: ReadonlyArray<{ id: string; name: string }>): string {
  if (v === 'ai') return 'AI Agent'
  if (!v || v === 'cs') return 'A person'
  return templates.find(t => t.id === v)?.name ?? 'A person'
}

export interface RuleLogLine { id: string; what: string; by: string; at: string }

interface RuleChange {
  id: number
  occurred_at: string
  actor_name: string | null
  table_name: string
  op: 'INSERT' | 'UPDATE' | 'DELETE'
  old_row: Record<string, unknown> | null
  new_row: Record<string, unknown> | null
  changed: string[] | null
}

/**
 * Reply rules' Audit log (the rail's second tab): the portal's own history of lead_reply_pages and lead_reply_rules
 * (audit_changes), one line per window changed, as the reference words it — "Carress Instagram · working hours → A
 * person", "Removed rule for Oct Sofa Week". Newest first.
 */
export function ruleLog(changes: RuleChange[], names: {
  brand: (id: string) => string
  ad: (id: string) => string
  templates: ReadonlyArray<{ id: string; name: string }>
}): RuleLogLine[] {
  const out: RuleLogLine[] = []
  const WIN: Record<string, string> = { open: 'working hours', closed: 'after hours', any: 'any time' }
  for (const c of [...changes].sort((a, b) => b.occurred_at.localeCompare(a.occurred_at) || b.id - a.id)) {
    const row = (c.new_row ?? c.old_row ?? {}) as Record<string, string>
    const by = c.actor_name || 'Someone'
    const push = (what: string, k = '') => out.push({ id: `${c.id}${k}`, what, by, at: c.occurred_at })
    if (c.table_name === 'lead_reply_pages') {
      const page = `${names.brand(row.brand_id)} ${row.channel === 'instagram' ? 'Instagram' : 'Messenger'}`
      for (const [col, win] of [['work_reply', 'working hours'], ['after_reply', 'after hours']] as const) {
        if (c.op === 'UPDATE' && !c.changed?.includes(col)) continue
        if (c.op === 'DELETE') continue
        push(`${page} · ${win} → ${replyLabel(row[col], names.templates)}`, col)
      }
    } else if (c.table_name === 'lead_reply_rules') {
      const ad = names.ad(row.ad_id)
      if (c.op === 'DELETE') push(`Removed rule for ${ad}`)
      else if (c.op === 'INSERT' || c.changed?.some(k => k === 'reply' || k === 'at_when' || k === 'ad_id')) push(`${ad} · ${WIN[row.at_when] ?? row.at_when} → ${replyLabel(row.reply, names.templates)}`)
    }
  }
  return out
}

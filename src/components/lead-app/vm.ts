// Lead View on a phone (2026-11-28, the Claude Design handoff `docs/design_handoff_lead_view_phone` — LeadPhone.dc.html's
// renderVals): what each screen shows, worked out from Lead View's own data and rules (lib/leads). Pure, tested in
// vm.test.ts; the screens only draw.

import { adLabel } from '@/lib/leads/ads'
import { handedTo, inboxState } from '@/lib/leads/handoff'
import { inMessengerOrder, isMediaPlaceholder, mediaFileName, mediaKind, noteOf, phoneStage, receiptOf, unreadLabel, visitShown, type Receipt } from '@/lib/leads/inbox'
import { outletName, type LeadOutlet } from '@/lib/leads/outlets'
import { formatPhone } from '@/lib/leads/phone'
import { STAGE_LABEL, lastUpdate, stageOf, type LeadStage } from '@/lib/leads/stage'
import { dayLabel, officeDayOf, timeOf } from '@/lib/leads/time'
import type { LabelTone, LeadBrand, LeadContact, LeadLabel, LeadMessage } from '@/lib/leads/types'

export type Tab = 'inbox' | 'leads' | 'insight' | 'campaigns' | 'profile'
export type StatusFilter = 'waiting' | 'answered' | 'handed' | 'all'

// ── Names, days, waits ──────────────────────────────────────────────────────

/** The 1–2 letters an avatar shows (the desktop Inbox's rule). */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  return (parts.length === 1 ? Array.from(parts[0]).slice(0, 2).join('') : Array.from(parts[0])[0] + Array.from(parts[1])[0]).toUpperCase()
}

/** A customer's first name, as the reply box says it: "Reply to Nurul…". */
export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || 'the customer'
}

const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const daysApart = (from: string, to: string) => Math.round((Date.parse(to + 'T00:00:00Z') - Date.parse(from + 'T00:00:00Z')) / 864e5)

/**
 * When, as a chat list says it (the prototype's `when`: "08:48", "Yesterday", "Wed"): today's time, Yesterday, the
 * weekday within the week, else the date — "16 Oct", "10 Dec 2025" in another year. The office's days.
 */
export function rowWhen(iso: string, now: Date): string {
  const day = officeDayOf(iso)
  const gap = daysApart(day, officeDayOf(now.toISOString()))
  if (gap <= 0) return timeOf(iso)
  if (gap === 1) return 'Yesterday'
  if (gap < 7) return WEEKDAY[new Date(day + 'T00:00:00Z').getUTCDay()]
  return dayLabel(iso, now)
}

/** A day's pill in the chat: Today, Yesterday, the weekday within the week, else the date. */
export function dayPill(iso: string, now: Date): string {
  const gap = daysApart(officeDayOf(iso), officeDayOf(now.toISOString()))
  return gap <= 0 ? 'Today' : rowWhen(iso, now)
}

/** "First contact today" / "First contact yesterday" / "First contact 26 Nov". */
export function firstContact(iso: string, now: Date): string {
  const gap = daysApart(officeDayOf(iso), officeDayOf(now.toISOString()))
  return `First contact ${gap <= 0 ? 'today' : gap === 1 ? 'yesterday' : dayLabel(iso, now)}`
}

/** How long a chat has waited, as the row says it: "17 m", "1 h 05 m", "1 d 3 h". */
export function waitText(minutes: number): string {
  const m = Math.max(0, Math.floor(minutes))
  if (m < 60) return `${m} m`
  if (m < 1440) return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} m`
  return `${Math.floor(m / 1440)} d ${Math.floor((m % 1440) / 60)} h`
}

/** A message's words for a one-line preview: a file's label as its kind ("Photo"), a file by its name. */
export function previewText(text: string): string {
  const t = text.trim()
  const m = /^\[(Photo|Video|Voice message|Sticker|File)\](?: (.*))?$/.exec(t)
  if (m) return m[1] === 'File' ? m[2]?.trim() || 'File' : m[1]
  return t.replace(/\s+/g, ' ')
}

// ── The Inbox ───────────────────────────────────────────────────────────────

/** What this screen knows on top of the list: chats read here since their last message, and chats marked unread. */
export interface SeenState {
  readAt: Readonly<Record<string, string>>
  marks: ReadonlySet<string>
}

/** The unread count the row shows (the desktop Inbox's rule): a mark is at least 1; read here since its last message, 0. */
export function unreadOf(c: Pick<LeadContact, 'id' | 'lastAt' | 'unread'>, seen: SeenState): number {
  if (seen.marks.has(c.id)) return Math.max(1, c.unread ?? 0)
  if (seen.readAt[c.id] === c.lastAt) return 0
  return c.unread ?? 0
}

/** Waiting · Answered · Handed, from the person's own unread count (lib/leads/handoff.ts › inboxState). */
export function stateOf(c: LeadContact, seen: SeenState): Exclude<StatusFilter, 'all'> {
  return inboxState({ ...c, unread: unreadOf(c, seen) })
}

export const STATUS_CHIPS: ReadonlyArray<{ id: StatusFilter; label: string }> = [
  { id: 'waiting', label: 'Waiting' }, { id: 'answered', label: 'Answered' }, { id: 'handed', label: 'Handed' }, { id: 'all', label: 'All' },
]

/** A chip the list filters by: a status, or one of Customer Service's labels. */
export type InboxFilter = StatusFilter | `label:${string}`

export function passes(c: LeadContact, f: InboxFilter, seen: SeenState): boolean {
  if (f === 'all') return true
  if (f.startsWith('label:')) return (c.labels ?? []).some(l => `label:${l.id}` === f)
  return stateOf(c, seen) === f
}

export interface Chip {
  id: InboxFilter
  label: string
  n: number
  on: boolean
  /** The count in rust while not picked (Waiting's). */
  hot: boolean
}

/** The chip row: the four statuses, then the labels customers carry, in Customer Service's order. */
export function inboxChips(pool: LeadContact[], labels: LeadLabel[], picked: InboxFilter, seen: SeenState): Chip[] {
  const used = new Set(pool.flatMap(c => (c.labels ?? []).map(l => l.id)))
  const ids: Array<{ id: InboxFilter; label: string }> = [
    ...STATUS_CHIPS,
    ...labels.filter(l => used.has(l.id)).map(l => ({ id: `label:${l.id}` as InboxFilter, label: l.name })),
  ]
  return ids.map(({ id, label }) => ({ id, label, n: pool.filter(c => passes(c, id, seen)).length, on: picked === id, hot: id === 'waiting' }))
}

/** Does a chat match what was typed: its name, phone, last words or ad (the desktop's search). */
export function matchesQuery(c: LeadContact, q: string): boolean {
  const t = q.trim().toLowerCase()
  if (!t) return true
  const hay = `${c.name} ${c.phone ?? ''} ${c.phone ? formatPhone(c.phone) : ''} ${c.lastText} ${adLabel(c)}`.toLowerCase()
  const digits = t.replace(/[\s-]/g, '')
  return hay.includes(t) || (digits.length >= 3 && /^\d+$/.test(digits) && (c.phone ?? '').includes(digits))
}

export interface RowVM {
  id: string
  ini: string
  name: string
  nameW: 500 | 600
  channel: LeadContact['channel']
  tag: { name: string; tone: LabelTone } | null
  /** While the chat waits: how long, and whether past an hour (rust, the warning sign). */
  wait: { text: string; long: boolean } | null
  when: string
  /** The time in rust while unread. */
  whenHot: boolean
  /** "2990s · Raya sofa promo" (Organic without an ad). */
  ad: string
  /** The phone when one is on file, formatted. */
  phone: string | null
  preview: string
  /** The badge, "99+" past 99; null with nothing unread. */
  unread: string | null
}

export function rowOf(c: LeadContact, brand: string, seen: SeenState, now: Date): RowVM {
  const unread = unreadOf(c, seen)
  const waiting = stateOf(c, seen) === 'waiting'
  const minutes = Math.floor((now.getTime() - Date.parse(c.lastAt)) / 60000)
  const tag = c.labels?.[0]
  return {
    id: c.id,
    ini: initials(c.name || '?'),
    name: c.name || 'Customer',
    nameW: unread ? 600 : 500,
    channel: c.channel,
    tag: tag ? { name: tag.name, tone: tag.tone } : null,
    wait: waiting && minutes >= 1 ? { text: waitText(minutes), long: minutes >= 60 } : null,
    when: rowWhen(c.lastAt, now),
    whenHot: unread > 0,
    ad: `${brand} · ${adLabel(c) || 'Organic'}`,
    phone: phoneStage(c) !== 'none' && c.phone ? formatPhone(c.phone) : null,
    preview: (c.lastDir === 'out' ? 'You: ' : '') + previewText(c.lastText),
    unread: unread > 0 ? unreadLabel(unread) : null,
  }
}

/** The Inbox tab's badge: every unread message waiting, as the prototype counts it. */
export function inboxBadge(contacts: LeadContact[], seen: SeenState): string | null {
  const n = contacts.filter(c => !c.blockedAt).reduce((sum, c) => sum + unreadOf(c, seen), 0)
  return n > 0 ? unreadLabel(n) : null
}

/** The Brands sheet: All brands, then each brand, with its chats. */
export function brandPills(contacts: LeadContact[], brands: LeadBrand[]): Array<{ id: string; label: string; n: number }> {
  const live = contacts.filter(c => !c.blockedAt)
  return [
    { id: 'all', label: 'All brands', n: live.length },
    ...brands.map(b => ({ id: b.id, label: b.name, n: live.filter(c => c.brandId === b.id).length })),
  ]
}

// ── A chat ──────────────────────────────────────────────────────────────────

export type StripTone = 'rust' | 'green' | 'grey'

export interface StripVM {
  tone: StripTone
  text: string
  /** Not a phone + Confirm (a number found in the chat, for whoever may edit). */
  confirm: boolean
  /** Hand over (a confirmed number, not handed yet, for whoever may edit). */
  hand: boolean
}

/** The phone strip under the chat's head (the prototype's four states). */
export function stripOf(c: LeadContact, brand: string, canEdit: boolean): StripVM {
  const stage = phoneStage(c)
  if (stage === 'handed') return { tone: 'grey', text: `Handed to ${brand} sales · ${STAGE_LABEL[stageOf(c)]}`, confirm: false, hand: false }
  if (stage === 'detected') return { tone: 'rust', text: `Phone found · ${formatPhone(c.phone)}`, confirm: canEdit, hand: false }
  if (stage === 'confirmed') return { tone: 'green', text: `Phone confirmed · ${formatPhone(c.phone)}`, confirm: false, hand: canEdit }
  return { tone: 'grey', text: 'No phone yet · ask for the number', confirm: false, hand: false }
}

/** The chat head's second line: "2990s · Raya sofa promo · Messenger". */
export function chatSub(c: LeadContact, brand: string): string {
  return [brand, adLabel(c) || 'Organic', c.channel === 'instagram' ? 'Instagram' : 'Messenger'].join(' · ')
}

/** Who sent an automatic reply, before its time: "Sent by Welcome ·". Customer Service's own replies say nothing. */
export function sentBy(m: Pick<LeadMessage, 'sender' | 'byName'>): string {
  const by = m.byName?.trim()
  if (m.sender === 'flow') return `Sent by ${by || 'a template'} ·`
  if (m.sender === 'ai') return 'Sent by AI Agent ·'
  if (m.sender === 'campaign') return `Sent by ${by || 'a campaign'} ·`
  if (m.sender === 'page') return `Sent by ${by || 'Business Suite'} ·`
  return ''
}

export interface MediaVM {
  kind: 'image' | 'video' | 'audio' | 'file'
  /** Ours (lead-media, read through a signed link) or Meta's own address. */
  path: string | null
  url: string | null
  name: string
}

export interface BubbleVM {
  type: 'bubble'
  id: number
  mine: boolean
  /** The words, without a file's placeholder label ("[Photo]"). */
  text: string
  at: string
  by: string
  media: MediaVM | null
  buttons: string[]
  quote: { who: string; text: string } | null
  reaction: string | null
  receipt: Receipt | null
  /** Being sent (shown at once, before the server answers). */
  pending: boolean
}
export interface NoteVM { type: 'note'; key: string; text: string; at: string }
export interface DayVM { type: 'day'; key: string; label: string }
export type WallItem = BubbleVM | NoteVM | DayVM

/** A message waiting for the server: shown at once with its words, then replaced by the chat read again. */
export type PendingMessage = Pick<LeadMessage, 'body' | 'at'> & { id: number }

/** The chat's wall in Messenger's order: a day's pill where the day changes, Meta's notes as grey lines, the bubbles. */
export function wallOf(messages: LeadMessage[], contact: LeadContact | null, now: Date, pending: PendingMessage[] = []): WallItem[] {
  const out: WallItem[] = []
  const byMid = new Map(messages.filter(m => m.mid).map(m => [m.mid as string, m]))
  let day = ''
  const dayOf = (iso: string) => {
    const d = officeDayOf(iso)
    if (d !== day) {
      day = d
      out.push({ type: 'day', key: `d${d}`, label: dayPill(iso, now) })
    }
  }
  for (const m of inMessengerOrder(messages)) {
    dayOf(m.at)
    const note = noteOf(m)
    if (note) { out.push({ type: 'note', key: `n${m.id}`, text: note, at: timeOf(m.at) }); continue }
    const hasFile = !!(m.mediaPath || m.mediaUrl)
    const kind = hasFile ? mediaKind(m.mediaMime, m.body) : null
    const quoted = m.replyToMid ? byMid.get(m.replyToMid) : undefined
    out.push({
      type: 'bubble',
      id: m.id,
      mine: m.direction === 'out',
      text: hasFile && isMediaPlaceholder(m.body) ? '' : m.body,
      at: timeOf(m.at),
      by: sentBy(m),
      media: kind ? { kind, path: m.mediaPath ?? null, url: m.mediaUrl ?? null, name: mediaFileName(m) } : null,
      buttons: m.buttons?.filter(Boolean) ?? [],
      quote: m.replyToMid ? { who: quoted ? (quoted.direction === 'in' ? 'Customer' : 'You') : 'A message', text: quoted ? previewText(quoted.body) : '' } : null,
      reaction: m.reaction ?? null,
      receipt: receiptOf(m, contact),
      pending: false,
    })
  }
  for (const p of pending) {
    dayOf(p.at)
    out.push({ type: 'bubble', id: p.id, mine: true, text: p.body, at: timeOf(p.at), by: '', media: null, buttons: [], quote: null, reaction: null, receipt: null, pending: true })
  }
  return out
}

/** The ⋮ menu's second Hand over line: "2990s sales group". */
export function salesGroup(brand: string): string {
  return `${brand} sales group`
}

// ── Customer info ───────────────────────────────────────────────────────────

export interface InfoRow { k: string; v: string; empty: boolean; sub: string }

/**
 * The sheet's field card (the prototype's Phone · Outlet · Interest · Showroom · Visit · Language · Note), with the two
 * the desktop keeps for the salesperson and the prototype leaves out — Budget and Special request — in their places.
 */
export function infoRows(c: LeadContact, outlets: LeadOutlet[]): InfoRow[] {
  const stage = phoneStage(c)
  const phone = stage !== 'none' && c.phone ? formatPhone(c.phone) : ''
  const phoneSub = !phone ? '' : c.phoneTyped ? 'added by you' : stage === 'detected' ? 'found in the chat' : 'confirmed'
  const outlet = outletName(outlets, c.outletId ?? null)
  const outletSub = !outlet ? '' : c.outletBy === 'cs' ? 'set by you' : 'from the ad'
  const rows: Array<[string, string, string?]> = [
    ['Phone', phone, phoneSub],
    ['Outlet', outlet, outletSub],
    ['Interest', c.interest],
    ['Budget', c.budget],
    ['Showroom', c.showroom],
    ['Visit', visitShown(c.preferredTime ?? '')],
    ['Language', c.language ?? ''],
    ['Special request', c.specialRequest ?? ''],
    ['Note', c.note],
  ]
  return rows.map(([k, v, sub]) => ({ k, v: v?.trim() || '—', empty: !v?.trim(), sub: sub ?? '' }))
}

// ── Leads ───────────────────────────────────────────────────────────────────

/** The stage chips: the whole pipeline (lib/leads/stage.ts), as the README asks of production. */
export const STAGE_CHIPS: ReadonlyArray<LeadStage | 'all'> = ['all', 'nophone', 'new', 'handed', 'contacted', 'appt', 'came', 'closed', 'lost']

/** Each stage's square dot (the handoff's Stage dots), as `--lv-*` tokens. */
export const STAGE_DOT: Readonly<Record<LeadStage, string>> = {
  nophone: 'disabled', new: 'accent', handed: 'warn', contacted: 'slate', appt: 'plum', came: 'pos', closed: 'fg', lost: 'disabled',
}

export interface LeadRowVM { id: string; ini: string; name: string; stage: LeadStage; stageLabel: string; phone: string; noPhone: boolean; src: string }

export function leadRowOf(c: LeadContact, brand: string, outlets: LeadOutlet[]): LeadRowVM {
  const stage = stageOf(c)
  const has = !!c.phone && c.phoneState !== 'none'
  return {
    id: c.id,
    ini: initials(c.name || '?'),
    name: c.name || 'Customer',
    stage,
    stageLabel: STAGE_LABEL[stage],
    phone: has ? formatPhone(c.phone) : 'No phone yet',
    noPhone: !has,
    src: [brand, outletName(outlets, c.outletId ?? null), adLabel(c) || 'Organic'].filter(Boolean).join(' · '),
  }
}

/** The stage chips with their counts; Not handed yet's count in rust while not picked. */
export function stageChips(contacts: LeadContact[], picked: LeadStage | 'all'): Array<{ id: LeadStage | 'all'; label: string; n: number; on: boolean; hot: boolean }> {
  return STAGE_CHIPS.map(id => ({
    id,
    label: id === 'all' ? 'All' : STAGE_LABEL[id],
    n: id === 'all' ? contacts.length : contacts.filter(c => stageOf(c) === id).length,
    on: picked === id,
    hot: id === 'new',
  }))
}

/** Leads in the order they last moved, newest first. */
export function byLastUpdate(contacts: LeadContact[]): LeadContact[] {
  return [...contacts].sort((a, b) => lastUpdate(b).localeCompare(lastUpdate(a)))
}

/** Leads' search: a name or a phone. */
export function matchesLead(c: LeadContact, q: string): boolean {
  const t = q.trim().toLowerCase()
  if (!t) return true
  const digits = t.replace(/[\s-]/g, '')
  return `${c.name} ${c.phone ?? ''} ${c.phone ? formatPhone(c.phone) : ''}`.toLowerCase().includes(t) || (/^\d{3,}$/.test(digits) && (c.phone ?? '').includes(digits))
}

/** Who a handed lead went to, for the hand-over toast and the strip. */
export { handedTo }

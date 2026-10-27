// Lead View › Leads v2 (2026-10-22, the redesign v2 handoff `Leads.dc.html`): where a lead stands on the pipeline,
// whether it needs following up, the list's time ranges and its CSV. Pure, tested in stage.test.ts; the database
// keeps the steps' days (mig 20261022220000).

import { adLabel } from './ads'
import { handedTo } from './handoff'
import { formatPhone } from './phone'
import type { LeadContact } from './types'

export type LeadStage = 'nophone' | 'new' | 'handed' | 'contacted' | 'appt' | 'came' | 'closed' | 'lost'
/** The steps CS sets on the drawer, after the hand-over. */
export type SetStage = 'handed' | 'contacted' | 'appt' | 'came' | 'closed'

export const STAGE_ORDER: readonly LeadStage[] = ['nophone', 'new', 'handed', 'contacted', 'appt', 'came', 'closed', 'lost']

export const STAGE_LABEL: Readonly<Record<LeadStage, string>> = {
  nophone: 'No phone yet', new: 'Not handed yet', handed: 'Handed', contacted: 'Contacted',
  appt: 'Appointment', came: 'Came', closed: 'Closed', lost: 'Lost',
}

/** The tabs over the list. */
export const STAGE_TABS: ReadonlyArray<{ id: LeadStage | 'all'; label: string }> = [
  { id: 'all', label: 'All' }, { id: 'nophone', label: 'No phone' }, { id: 'new', label: 'Not handed' },
  { id: 'handed', label: 'Handed' }, { id: 'contacted', label: 'Contacted' }, { id: 'appt', label: 'Appointment' },
  { id: 'came', label: 'Came' }, { id: 'closed', label: 'Closed' }, { id: 'lost', label: 'Lost' },
]

/** The drawer's PROGRESS, first message to a sale. */
export const PROGRESS: ReadonlyArray<{ id: LeadStage; label: string }> = [
  { id: 'nophone', label: 'First message' }, { id: 'new', label: 'Phone confirmed' }, { id: 'handed', label: 'Handed to sales' },
  { id: 'contacted', label: 'Contacted by sales' }, { id: 'appt', label: 'Appointment booked' }, { id: 'came', label: 'Came to showroom' },
  { id: 'closed', label: 'Closed · bought' },
]

type Stageable = Pick<LeadContact, 'phone' | 'handedAt' | 'appt' | 'shown'> &
  Partial<Pick<LeadContact, 'contactedAt' | 'apptAt' | 'cameAt' | 'closedAt' | 'lostAt'>>

/** The furthest step reached, a loss aside. The Inbox's Appointment / Came count as reached. */
export function stageReached(c: Stageable): Exclude<LeadStage, 'lost'> {
  if (c.closedAt) return 'closed'
  if (c.handedAt && (c.cameAt || c.shown === 'came')) return 'came'
  if (c.handedAt && (c.apptAt || c.appt === 'booked')) return 'appt'
  if (c.handedAt && c.contactedAt) return 'contacted'
  if (c.handedAt) return 'handed'
  return c.phone ? 'new' : 'nophone'
}

/** Where a lead stands: lost, else the furthest step reached. */
export function stageOf(c: Stageable): LeadStage {
  return c.lostAt ? 'lost' : stageReached(c)
}

/** The day each step of PROGRESS was reached, where the card knows it. */
export function stageDays(c: LeadContact): Partial<Record<LeadStage, string>> {
  const confirmed = c.phoneState === 'confirmed' || c.handedAt ? c.phoneAt : null
  const out: Partial<Record<LeadStage, string | null | undefined>> = {
    nophone: c.createdAt, new: confirmed, handed: c.handedAt, contacted: c.contactedAt, appt: c.apptAt, came: c.cameAt, closed: c.closedAt,
  }
  return Object.fromEntries(Object.entries(out).filter(([, v]) => !!v)) as Partial<Record<LeadStage, string>>
}

/** When the lead last moved: a message, or a change to its card. */
export function lastUpdate(c: Pick<LeadContact, 'lastAt'> & Partial<Pick<LeadContact, 'updatedAt'>>): string {
  return c.updatedAt && c.updatedAt > c.lastAt ? c.updatedAt : c.lastAt
}

/** "Not contacted · 26 h" — handed over a day ago or more and nobody has said the salesperson called. */
export function followUp(c: Stageable & Pick<LeadContact, 'handedAt'>, now: number): string | null {
  if (stageOf(c) !== 'handed' || !c.handedAt) return null
  const hours = Math.floor((now - Date.parse(c.handedAt)) / 3_600_000)
  if (!(hours >= 24)) return null
  return `Not contacted · ${hours < 48 ? `${hours} h` : `${Math.floor(hours / 24)} days`}`
}

export type RangeId = 'today' | 'yest' | 'week' | 'month' | 'last' | 'all' | 'custom'
export const RANGES: ReadonlyArray<{ id: RangeId; label: string }> = [
  { id: 'today', label: 'Today' }, { id: 'yest', label: 'Yesterday' }, { id: 'week', label: 'This week' },
  { id: 'month', label: 'This month' }, { id: 'last', label: 'Last month' }, { id: 'all', label: 'All time' }, { id: 'custom', label: 'Custom' },
]

const day = (iso: string, plus: number) => new Date(Date.parse(iso + 'T00:00:00Z') + plus * 864e5).toISOString().slice(0, 10)
const isDay = (v: string | undefined): v is string => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v + 'T00:00:00Z'))

/**
 * The office days [from, to) a range reads; null for all time. The week starts on Monday; a custom range is
 * inclusive, never past today, and a year long at most (the database's limit).
 */
export function rangeDays(id: RangeId, today: string, from?: string, to?: string): { from: string; to: string } | null {
  const dow = new Date(today + 'T00:00:00Z').getUTCDay()
  const first = today.slice(0, 8) + '01'
  switch (id) {
    case 'today': return { from: today, to: day(today, 1) }
    case 'yest': return { from: day(today, -1), to: today }
    case 'week': return { from: day(today, -((dow + 6) % 7)), to: day(today, 1) }
    case 'last': {
      const d = new Date(first + 'T00:00:00Z')
      d.setUTCMonth(d.getUTCMonth() - 1)
      return { from: d.toISOString().slice(0, 10), to: first }
    }
    case 'all': return null
    case 'custom': {
      const end = isDay(to) && to <= today ? to : today
      let start = isDay(from) && from <= end ? from : first <= end ? first : end
      if (Date.parse(end) - Date.parse(start) > 399 * 864e5) start = day(end, -399)
      return { from: start, to: day(end, 1) }
    }
    default: return { from: first, to: day(today, 1) }
  }
}

export function isRangeId(v: string | undefined): v is RangeId {
  return RANGES.some(r => r.id === v)
}

/** A sale value as typed ("RM 2,690", "2690.50") → ringgit, or null; anything else is not a value. */
export function readSaleValue(text: string): number | null | 'bad' {
  const t = text.replace(/rm/i, '').replace(/[\s,]/g, '')
  if (!t) return null
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return 'bad'
  const n = Number(t)
  return n < 1_000_000_000 ? n : 'bad'
}

/** The CSV of the filtered list (every row, not the page), with a BOM so Excel reads the Chinese. */
export function leadsCsv(rows: LeadContact[], brandName: (id: string) => string, when: (iso: string) => string): string {
  const head = ['Name', 'Phone', 'Brand', 'Channel', 'Source', 'Interest', 'Budget', 'Showroom', 'Salesperson', 'Status', 'Sale value', 'Last update']
  const body = rows.map(c => {
    const ad = adLabel(c)
    return [
      c.name, c.phone ? formatPhone(c.phone) : '', brandName(c.brandId), c.channel === 'instagram' ? 'Instagram' : 'Messenger',
      ad || 'Organic', c.interest, c.budget, c.showroom, handedTo(c) ?? '', STAGE_LABEL[stageOf(c)],
      c.saleValue == null || c.saleValue === '' ? '' : String(c.saleValue), when(lastUpdate(c)),
    ]
  })
  const cell = (v: string) => `"${String(v).replace(/"/g, '""')}"`
  return '﻿' + [head, ...body].map(r => r.map(cell).join(',')).join('\n')
}

// Lead View › Insight › Overview (2026-11-17, mig 20261117200000): the outlets' "Performance Overview" sheet worked out
// from Lead View — online inquiries (the chats), visits and sales (Showroom visits), ad spend (Meta, by ad account →
// outlet). Pure parts, tested in overview.test.ts.

import { VISIT_SOURCES, type VisitSource } from './visits'

/** What lead_overview(from, to) answers; outletId null = no outlet. */
export interface OverviewData {
  inquiries: Array<{ outletId: string | null; n: number }>
  visits: Array<{ outletId: string; source: VisitSource; n: number }>
  sales: Array<{ outletId: string; source: VisitSource; orders: number; amount: number }>
  spend: Array<{ outletId: string | null; funnel: number; branding: number }>
  /** Lead View · Manage's only (empty for an Outlet staff): each account's outlet, and the range's days read. */
  accounts: Array<{ accountId: string; name: string; outletId: string | null; fetchedAt: string | null; days?: number }>
}

/**
 * Malaysia's 8% service tax on Meta's digital services: Meta's insights give spend before it, the sheet's figures carry
 * it ("CPL (Included 8% SST)"). Every spend figure on Overview is Meta's × this.
 */
export const SST = 0.08

export interface OverviewFigures {
  /** Spend with SST: all, lead funnel, branding; Meta's own before SST. */
  spend: number
  funnel: number
  branding: number
  metaSpend: number
  avgDaily: number
  inquiries: number
  /** Lead funnel spend ÷ inquiries. */
  cpl: number | null
  visits: number
  visitRate: number | null
  visitsBy: Record<VisitSource, number>
  orders: number
  /** Orders ÷ visits. */
  conversion: number | null
  salesBy: Record<VisitSource, number>
  sales: number
  /** Sales ÷ spend, and spend ÷ sales. */
  roas: number | null
  spendShare: number | null
  /** Spend ÷ orders. */
  cpa: number | null
  /** Sales ÷ orders. */
  aov: number | null
}

const per = (a: number, b: number): number | null => (b > 0 ? a / b : null)
const bySource = (): Record<VisitSource, number> => Object.fromEntries(VISIT_SOURCES.map(([k]) => [k, 0])) as Record<VisitSource, number>

/** The days of [from, to], both included. */
export function daysIn(from: string, to: string): number {
  return Math.max(1, Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 864e5) + 1)
}

/**
 * The figures for the outlets `keep` lets in (`keep(null)` asks about the chats and spend with no outlet). `days` divides
 * the daily average.
 */
export function figuresOf(d: OverviewData, keep: (outletId: string | null) => boolean, days: number): OverviewFigures {
  let funnel = 0, branding = 0, inquiries = 0, visits = 0, orders = 0, sales = 0
  const visitsBy = bySource(), salesBy = bySource()
  for (const s of d.spend) if (keep(s.outletId)) { funnel += Number(s.funnel) || 0; branding += Number(s.branding) || 0 }
  for (const i of d.inquiries) if (keep(i.outletId)) inquiries += i.n
  for (const v of d.visits) if (keep(v.outletId)) { visits += v.n; if (v.source in visitsBy) visitsBy[v.source] += v.n }
  for (const s of d.sales) if (keep(s.outletId)) {
    orders += s.orders
    sales += Number(s.amount) || 0
    if (s.source in salesBy) salesBy[s.source] += Number(s.amount) || 0
  }
  const metaSpend = funnel + branding
  const tax = 1 + SST
  const spend = metaSpend * tax
  return {
    spend, funnel: funnel * tax, branding: branding * tax, metaSpend,
    avgDaily: spend / Math.max(1, days),
    inquiries, cpl: per(funnel * tax, inquiries),
    visits, visitRate: per(visits, inquiries), visitsBy,
    orders, conversion: per(orders, visits),
    salesBy, sales,
    roas: per(sales, spend), spendShare: per(spend, sales),
    cpa: per(spend, orders), aov: per(sales, orders),
  }
}

export type OverviewRangeId = 'month' | 'last' | '7' | '30' | 'custom'
export const OVERVIEW_RANGES: ReadonlyArray<[OverviewRangeId, string]> = [['month', 'This month'], ['last', 'Last month'], ['7', '7 days'], ['30', '30 days'], ['custom', 'Custom']]

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const shortDay = (d: string) => `${Number(d.slice(8))} ${MON[Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)}`
const plus = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10)

/** ?r= (This month by default) → its days, both included, never past today; Custom a year at most. */
export function overviewRange(raw: string | undefined, today: string, cFrom?: string, cTo?: string): { key: OverviewRangeId; from: string; to: string; label: string } {
  const iso = (v?: string) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)) ? v : null)
  const monthStart = `${today.slice(0, 7)}-01`
  if (raw === 'last') {
    const to = plus(monthStart, -1)
    return { key: 'last', from: `${to.slice(0, 7)}-01`, to, label: `${MON[Number(to.slice(5, 7)) - 1]} ${to.slice(0, 4)}` }
  }
  if (raw === '7' || raw === '30') {
    const n = Number(raw)
    return { key: raw, from: plus(today, -(n - 1)), to: today, label: `Last ${n} days` }
  }
  if (raw === 'custom') {
    const to = iso(cTo) && iso(cTo)! <= today ? iso(cTo)! : today
    const lo = plus(to, -365)
    const from = iso(cFrom) && iso(cFrom)! <= to ? (iso(cFrom)! < lo ? lo : iso(cFrom)!) : `${to.slice(0, 7)}-01`
    return { key: 'custom', from, to, label: `${shortDay(from)} – ${shortDay(to)}` }
  }
  return { key: 'month', from: monthStart, to: today, label: `${MON[Number(today.slice(5, 7)) - 1]} ${today.slice(0, 4)}` }
}

/** Does an outlet have anything in the range? (An empty outlet's panel is folded.) */
export function hasFigures(f: OverviewFigures): boolean {
  return f.spend > 0 || f.inquiries > 0 || f.visits > 0 || f.orders > 0
}

export const rm = (n: number | null): string => (n == null ? '—' : `RM${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`)
export const pct = (n: number | null): string => (n == null ? '—' : `${(n * 100).toFixed(2)}%`)
export const times = (n: number | null): string => (n == null ? '—' : n.toFixed(2))

/** An ad campaign's objective → Lead funnel or Branding: awareness, reach and video views are branding; the rest funnel. */
export function isBranding(objective: string | null | undefined): boolean {
  return ['OUTCOME_AWARENESS', 'BRAND_AWARENESS', 'REACH', 'VIDEO_VIEWS'].includes(String(objective ?? '').toUpperCase())
}

/**
 * Should Overview ask Meta again for [from, to]? When no account is known yet, when an account has a day of the range not
 * read, or when the range reaches the last three days (Meta still moves them) and was read over an hour ago.
 */
export function spendStale(accounts: OverviewData['accounts'], from: string, to: string, today: string, now: number): boolean {
  if (accounts.length === 0) return true
  const want = daysIn(from, to)
  const recent = Date.parse(`${to}T00:00:00Z`) >= Date.parse(`${today}T00:00:00Z`) - 2 * 864e5
  return accounts.some(a => (a.days ?? 0) < want || !a.fetchedAt || (recent && now - Date.parse(a.fetchedAt) > 3600e3))
}

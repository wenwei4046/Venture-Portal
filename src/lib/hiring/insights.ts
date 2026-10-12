import type { HiringRequest, HiringStatus } from './types'
import { answerOf, budgetText, dayKey, dayLabel, requestTitle } from './view'

// Hiring › Insights (2026-10-11, README §12; the handoff's insVals): how long
// each request takes, from submitted to acknowledged to filled, what it cost
// and through which source — for this month, a month of the last twelve, or
// all time. Pure: the page hands in the board's requests and the office's today.

/** 'this' (the office's month), 'all', or a month 'm:2026-09'. */
export type InsightsPeriod = 'this' | 'all' | `m:${string}`

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const DAY = 86400000
const utc = (key: string) => Date.parse(`${key}T00:00:00Z`)
const monthStart = (y: number, m: number) => Date.UTC(y, m, 1)
const days = (from: string, to: string) => Math.round((utc(to) - utc(from)) / DAY)
const money = (n: number) => 'RM ' + Math.round(n).toLocaleString('en-US')
const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((s, v) => s + v, 0) / xs.length) : null)

/** The twelve months up to the office's, newest first: { value 'm:2026-10', short 'Oct', year '2026' }. */
export function lastTwelveMonths(today: string): Array<{ value: InsightsPeriod; label: string; short: string; year: string }> {
  const [y, m] = today.split('-').map(Number)
  return Array.from({ length: 12 }, (_, i) => {
    const d = new Date(Date.UTC(y, m - 1 - i, 1))
    const yy = d.getUTCFullYear(), mm = d.getUTCMonth()
    return { value: `m:${yy}-${String(mm + 1).padStart(2, '0')}` as InsightsPeriod, label: `${MONTHS[mm]} ${yy}`, short: MONTHS[mm], year: String(yy) }
  })
}

/** [start, end) of a period in UTC days; all time is unbounded. */
function rangeOf(period: InsightsPeriod, today: string): [number, number] {
  if (period === 'all') return [-Infinity, Infinity]
  const [y, m] = (period === 'this' ? today.slice(0, 7) : period.slice(2)).split('-').map(Number)
  return [monthStart(y, m - 1), monthStart(y, m)]
}

/** The month before a month's period, for "▲ 12% vs Sep"; none for all time. */
function previousOf(period: InsightsPeriod, today: string): [number, number] | null {
  if (period === 'all') return null
  const [start] = rangeOf(period, today)
  const d = new Date(start)
  return [monthStart(d.getUTCFullYear(), d.getUTCMonth() - 1), start]
}

/** "1 Oct 2026 – 31 Oct 2026"; empty for all time. */
export function periodRange(period: InsightsPeriod, today: string): string {
  if (period === 'all') return ''
  const [a, b] = rangeOf(period, today)
  const d = (t: number) => { const x = new Date(t); return `${x.getUTCDate()} ${MONTHS[x.getUTCMonth()]} ${x.getUTCFullYear()}` }
  return `${d(a)} – ${d(b - DAY)}`
}

interface Fact {
  r: HiringRequest
  sub: string
  ack: string | null
  fill: string | null
  end: string | null
  pax: number
  cost: number
  toAck: number | null
  toFill: number | null
  open: boolean
  soFar: number
}

const OPEN_NOW: ReadonlySet<HiringStatus> = new Set(['submitted', 'needs_info', 'acknowledged'])

function factOf(r: HiringRequest, today: string): Fact {
  const sub = dayKey(r.submittedAt)
  const ack = r.acknowledgedAt ? dayKey(r.acknowledgedAt) : null
  const fill = r.status === 'filled' && r.filledAt ? dayKey(r.filledAt) : null
  const closed = (r.status === 'cancelled' || r.status === 'declined') && r.closedAt ? dayKey(r.closedAt) : null
  const pax = r.status === 'filled' ? Math.max(1, r.hiredNames.length) : 0
  return {
    r, sub, ack, fill, end: fill ?? closed, pax, cost: r.hiringCost ?? 0,
    toAck: ack ? days(sub, ack) : null,
    toFill: fill ? days(sub, fill) : null,
    open: OPEN_NOW.has(r.status),
    soFar: days(sub, today),
  }
}

export type CardIcon = 'receipt' | 'people' | 'calendar' | 'percent'
export interface InsightCard {
  label: string
  value: string
  /** The 23px bar over the label. */
  bar: 'plain' | 'ledger' | 'alert'
  icon: CardIcon
  /** "▲ 12% vs Sep" — empty when there is nothing to compare. */
  delta: string
  deltaTone: 'quiet' | 'flat' | 'good' | 'bad'
}

export interface InsightRow {
  id: string
  position: string
  hired: string
  /** A guest's company, else HOUZS Venture. */
  company: string
  department: string
  owner: string
  ownerSet: boolean
  pax: string
  source: string
  budget: string
  cost: string
  perHire: string
  submitted: string
  acknowledged: string
  ended: string
  toAck: string
  toFill: string
  /** Still open: its days so far are counted in alert. */
  waiting: boolean
  status: HiringStatus
}

export interface Insights {
  range: string
  cards: InsightCard[]
  bars: Array<{ id: string; label: string; days: string; ackShare: number; restShare: number }>
  sources: Array<{ name: string; pax: string; share: number; cost: string }>
  departments: Array<{ name: string; mix: string; share: number; avg: string }>
  rows: InsightRow[]
}

/** The Insights page for a period: cards with their change, the days bars, by source, by department, every request. */
export function insightsOf(
  requests: readonly HiringRequest[],
  period: InsightsPeriod,
  today: string,
  ownerName: (id: string | null) => string,
  departments: readonly string[],
): Insights {
  const range = rangeOf(period, today)
  const inR = (key: string | null) => !!key && utc(key) >= range[0] && utc(key) < range[1]
  const all = requests.map(r => factOf(r, today))
  const rows = all.filter(x => period === 'all' || inR(x.sub) || inR(x.fill))
  const filled = rows.filter(x => x.toFill !== null && (period === 'all' || inR(x.fill)))
  const acked = rows.filter(x => x.toAck !== null)
  const submitted = rows.filter(x => period === 'all' || inR(x.sub))
  const pax = filled.reduce((s, x) => s + x.pax, 0)
  const cost = filled.reduce((s, x) => s + x.cost, 0)
  const avgAck = avg(acked.map(x => x.toAck as number))
  const avgFill = avg(filled.map(x => x.toFill as number))

  // The same six figures for a month, to say how this one moved.
  const metrics = (rg: [number, number]): Array<number | null> => {
    const inG = (key: string | null) => !!key && utc(key) >= rg[0] && utc(key) < rg[1]
    const f = all.filter(x => x.toFill !== null && inG(x.fill))
    const a = all.filter(x => x.toAck !== null && inG(x.ack))
    const px = f.reduce((s, x) => s + x.pax, 0), c = f.reduce((s, x) => s + x.cost, 0)
    return [all.filter(x => inG(x.sub)).length, px, avg(a.map(x => x.toAck as number)), avg(f.map(x => x.toFill as number)), c, px && c ? c / px : null]
  }
  const prev = previousOf(period, today)
  const now = metrics(range), before = prev ? metrics(prev) : null
  const prevLabel = prev ? MONTHS[new Date(prev[0]).getUTCMonth()] : ''
  const UP_GOOD = [true, true, false, false, false, false]

  const base: Array<Omit<InsightCard, 'delta' | 'deltaTone'>> = [
    { label: 'Requests submitted', value: String(submitted.length), bar: 'plain', icon: 'receipt' },
    { label: 'People hired', value: String(pax), bar: 'ledger', icon: 'people' },
    { label: 'Avg days to acknowledge', value: avgAck === null ? '—' : String(avgAck), bar: 'plain', icon: 'calendar' },
    { label: 'Avg days to fill', value: avgFill === null ? '—' : String(avgFill), bar: 'plain', icon: 'calendar' },
    { label: 'Hiring cost', value: cost ? money(cost) : '—', bar: 'alert', icon: 'percent' },
    { label: 'Cost per hire', value: pax && cost ? money(cost / pax) : '—', bar: 'alert', icon: 'percent' },
  ]
  const cards: InsightCard[] = base.map((c, i) => {
    if (!before) return { ...c, delta: '', deltaTone: 'quiet' }
    const cv = now[i], pv = before[i]
    if (cv === null || pv === null || pv === 0 || (!UP_GOOD[i] && !cv)) return { ...c, delta: '', deltaTone: 'quiet' }
    const pct = Math.round(((cv || 0) - pv) / pv * 100)
    if (!pct) return { ...c, delta: `0% vs ${prevLabel}`, deltaTone: 'flat' }
    const good = (pct > 0) === UP_GOOD[i]
    return { ...c, delta: `${pct > 0 ? '▲' : '▼'} ${Math.abs(pct)}% vs ${prevLabel}`, deltaTone: good ? 'good' : 'bad' }
  })

  const longest = Math.max(1, ...filled.map(x => x.toFill as number))
  const bars = [...filled]
    .sort((a, b) => (b.toFill as number) - (a.toFill as number))
    .map(x => ({
      id: x.r.id,
      label: answerOf(x.r, 'position'),
      days: `${x.toFill} d`,
      ackShare: ((x.toAck ?? 0) / longest) * 100,
      restShare: (((x.toFill as number) - (x.toAck ?? 0)) / longest) * 100,
    }))

  const sourceNames = [...new Set(filled.map(x => x.r.hiredThrough || 'Not recorded'))]
  const sources = sourceNames
    .map(name => {
      const f = filled.filter(x => (x.r.hiredThrough || 'Not recorded') === name)
      const p = f.reduce((s, x) => s + x.pax, 0), c = f.reduce((s, x) => s + x.cost, 0)
      return { name, paxN: p, pax: `${p} pax`, share: Math.round((p / Math.max(1, pax)) * 100), cost: c ? money(c) : '—' }
    })
    .sort((a, b) => b.paxN - a.paxN)
    .map(s => ({ name: s.name, pax: s.pax, share: s.share, cost: s.cost }))

  const deptOf = (r: HiringRequest) => answerOf(r, 'dept').split(' · ')[0]
  const deptNames = [...departments, ...rows.map(x => deptOf(x.r)).filter(d => d && !departments.includes(d))]
  const departmentsOut = [...new Set(deptNames)].map(name => {
    const mine = rows.filter(x => deptOf(x.r) === name)
    const f = filled.filter(x => deptOf(x.r) === name)
    const a = avg(f.map(x => x.toFill as number))
    return {
      name,
      mix: `${mine.filter(x => x.open).length} open · ${f.reduce((s, x) => s + x.pax, 0)} hired`,
      share: Math.round((mine.length / Math.max(1, rows.length)) * 100),
      avg: a === null ? 'No fills' : `${a} days to fill`,
    }
  })

  return {
    range: periodRange(period, today),
    cards,
    bars,
    sources,
    departments: departmentsOut,
    rows: rows.map(x => ({
      id: x.r.id,
      position: requestTitle(x.r),
      hired: x.r.status === 'filled' && x.r.hiredNames.length ? 'Hired: ' + x.r.hiredNames.join(', ') : '',
      // Whose request it is (2026-10-12, the user): a guest's Department is its own company's
      // (Carres's Sales), HQ's is HQ's — so the table says the company too.
      company: x.r.requesterCompany || 'HOUZS Venture',
      department: answerOf(x.r, 'dept'),
      owner: x.r.ownerId ? ownerName(x.r.ownerId) || '—' : 'Unassigned',
      ownerSet: !!x.r.ownerId,
      pax: x.pax ? String(x.pax) : '—',
      source: x.r.hiredThrough || '—',
      budget: budgetText(answerOf(x.r, 'budget')),
      cost: x.cost ? money(x.cost) : '—',
      perHire: x.cost && x.pax ? money(x.cost / x.pax) : '—',
      submitted: dayLabel(x.r.submittedAt),
      acknowledged: x.ack ? dayLabel(x.ack) : '—',
      ended: x.end ? dayLabel(x.end) : '—',
      toAck: x.toAck === null ? '—' : `${x.toAck} d`,
      toFill: x.toFill !== null ? `${x.toFill} d` : x.open ? `${x.soFar} d so far` : '—',
      waiting: x.toFill === null && x.open,
      status: x.r.status,
    })),
  }
}

/** The side panel's facts for one request (the handoff's `is.tiles`). */
export function insightFacts(r: HiringRequest, today: string): Array<{ label: string; value: string; strong: boolean }> {
  const x = factOf(r, today)
  const T = (label: string, value: string, strong = false) => ({ label, value, strong })
  const n = (stages: string[]) => String(r.candidates.filter(c => stages.includes(c.stage)).length)
  return [
    T('Budget / month', budgetText(answerOf(r, 'budget')), true),
    ...(r.status === 'filled'
      ? [T('Hiring cost', x.cost ? money(x.cost) : '—', true), T('Pax hired', String(x.pax)), T('Hired through', r.hiredThrough || '—')]
      : [T('Expected start', answerOf(r, 'start') || '—', true)]),
    T('Candidates', String(r.candidates.length)),
    T('Done appointment', n(['appointment', 'offered', 'hired'])),
    T('Not selected', n(['rejected'])),
    T('Submitted', dayLabel(r.submittedAt)),
    T('Acknowledged', x.ack ? dayLabel(x.ack) : '—'),
    T('Filled / closed', x.end ? dayLabel(x.end) : '—'),
    T('Days to fill', x.toFill !== null ? `${x.toFill} days` : x.open ? `${x.soFar} days so far` : '—'),
  ]
}


/**
 * Why a paper number on two bills looks like one sale paid twice — and what
 * each of those bills has been through (user 2026-09-30: 我要你全部都写原因 …
 * 比如它像哪一张单，你就要写清楚那张单曾经出过什么，把过去的 history 拿出来).
 *
 * `revenue_possible_double_claims` flags a group on ONE fact: the same paper
 * number on more than one bill a run could pay or already paid. On its own
 * that decides nothing — a customer's two deliveries share a paper as honestly
 * as a bill keyed twice does — and the page used to list the bills and leave
 * the reader to guess why they were there. So every group is read against
 * everything else the portal knows about its bills (`ClaimBillEvidence`) and
 * says, in words:
 *
 *  - which of its bills is already claimed — on a claim form, in a month paid
 *    outside the portal, by a run, or locked in a salesperson's close — and
 *    which one a run would still pay;
 *  - what the bills share and what they do not: salesperson, customer, fair,
 *    the venue written on them, items, sales value, the part that earns, the
 *    deposit, when the ERP opened each document;
 *  - the verdict those add up to, and what to do about it;
 *  - each bill's own history, from the claim form it came in on or the ERP's
 *    first save, to where it stands now.
 *
 * Pure: `_lib/double-claims.ts` reads the evidence, this decides and words it.
 */
import { formatMoney } from '@/lib/utils'
import type { DoubleClaimBill, DoubleClaimGroup } from './double-claims'

/** One line of a bill, as the comparison reads it. */
export interface ClaimLine {
  code: string
  name: string
  qty: number
  amount: number
  /** In an item group the scheme pays on — goods, not transport or other charges. */
  earns: boolean
}

/** One delivery of an ERP document to the portal (`erp_sync_events`). */
export interface ClaimDelivery {
  at: string
  /** `applied`, `skipped`, `held`, … */
  status: string
  /** `created`, `updated`, `draft — not a sale yet`, … */
  message: string | null
  /** The month the delivery was logged under. */
  month: string | null
}

/** A drop or upsell the ERP found on the bill's paper (`comm_upsales`, source erp). */
export interface ClaimAdjustment {
  kind: 'drop' | 'upsale'
  status: 'pending' | 'confirmed' | 'dismissed'
  amount: number
  /** The month it was paid in, once confirmed. */
  paidIn: string | null
  foundAt: string
}

export interface ClaimFair {
  place: string
  start: string | null
  end: string | null
  organiser: string | null
}

/** Everything the page knows about one bill of a group beyond the group's own row. */
export interface ClaimBillEvidence {
  orderId: string
  customer: string | null
  fair: ClaimFair | null
  /** Who put the bill at its fair: 'erp', 'manual' (a person), 'venue_match', 'calendar' … */
  fairSource: string | null
  /** The venue as written on the bill. */
  venue: string | null
  /** The date on the ERP document (`header.so_date`). */
  soDate: string | null
  /** When the ERP opened the document. */
  erpOpenedAt: string | null
  /** The file a hand-worked bill came in on, and when. */
  importFile: string | null
  importedAt: string | null
  paidAmount: number | null
  lines: ClaimLine[]
  deliveries: ClaimDelivery[]
  adjustments: ClaimAdjustment[]
  /** Released by an applied run: that run's month, and when. */
  paidByRun: { month: string; at: string } | null
  /** Inside a salesperson's close that still stands. */
  closed: { month: string; at: string; by: string | null } | null
}

export interface ClaimContext {
  /** The first month the portal pays (`comm_cutovers`); every month before it was settled by hand. */
  firstPaidMonth: string | null
  /** Why — "June–August paid from the claim forms". */
  cutoverNote: string | null
}

/** Where a bill stands: already claimed one way or another, or still to be paid. */
export type ClaimStanding =
  | { kind: 'claim_form'; month: string; file: string | null }
  | { kind: 'settled'; month: string }
  | { kind: 'run'; month: string; at: string | null }
  | { kind: 'closed'; month: string; at: string; by: string | null }
  | { kind: 'open'; month: string }

export type ClaimVerdict = 'paid_again' | 'copy' | 'split' | 'second_sale' | 'settled' | 'number_only'
export type ClaimPattern = 'copy' | 'split' | 'second_sale' | 'number_only'
export type Sameness = 'same' | 'differs' | 'unknown'

/** One row of the side-by-side comparison: a fact, per bill, and whether it matches. */
export interface ClaimFact {
  label: string
  values: string[]
  /** Small print under a value, per bill. */
  notes: (string | null)[]
  /** Null: a row that describes rather than compares (the month, where it came from). */
  same: Sameness | null
  /** "RM 995.00 more on the later", "3 minutes apart". */
  gap: string | null
}

export interface ClaimEvent {
  /** "28 Sep 2026, 16:48", "28 Sep 2026", or null for a fact with no moment. */
  when: string | null
  text: string
  tone?: 'paid' | 'alert'
}

export interface ClaimExplanation {
  billRef: string
  verdict: ClaimVerdict
  pattern: ClaimPattern
  /** The chip — a word or three. */
  label: string
  headline: string
  /** Why, one finding each. */
  reasons: string[]
  action: string
  facts: ClaimFact[]
  /** Each bill's history, by order id. */
  history: Record<string, ClaimEvent[]>
  standings: Record<string, ClaimStanding>
  /** Sales value a run would pay a second time if nothing is done. */
  atRisk: number
  /** The bills that would pay the sale again. */
  copies: string[]
}

// ─── Words for dates and money ───────────────────────────────────────────────

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const MYT_OFFSET_MS = 8 * 60 * 60 * 1000

function parts(iso: string): [number, number, number] {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return [y, m, d]
}

/** A moment as Malaysia's wall clock sees it (UTC+8, no daylight saving). */
function myt(timestamp: string): Date {
  return new Date(new Date(timestamp).getTime() + MYT_OFFSET_MS)
}

/** The Malaysian calendar day of a moment, YYYY-MM-DD. */
function mytDay(timestamp: string): string {
  return myt(timestamp).toISOString().slice(0, 10)
}

/** "28 Sep 2026". */
export function claimDay(date: string): string {
  const [y, m, d] = parts(date)
  return `${d} ${MONTHS[m - 1]} ${y}`
}

/** "September 2026". */
export function claimMonth(period: string): string {
  const [y, m] = parts(period)
  return `${LONG[m - 1]} ${y}`
}

/** "28 Sep 2026, 16:48" in Malaysian time. */
export function claimMoment(timestamp: string): string {
  const t = myt(timestamp)
  const hh = String(t.getUTCHours()).padStart(2, '0')
  const mm = String(t.getUTCMinutes()).padStart(2, '0')
  return `${t.getUTCDate()} ${MONTHS[t.getUTCMonth()]} ${t.getUTCFullYear()}, ${hh}:${mm}`
}

function monthOf(date: string): string {
  return `${date.slice(0, 7)}-01`
}

function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = parts(a)
  const [by, bm, bd] = parts(b)
  return Math.round(Math.abs(Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000)
}

/** "28–31 Aug", "31 Jul–2 Aug". */
function span(start: string, end: string | null): string {
  const [, sm, sd] = parts(start)
  if (!end || end.slice(0, 10) === start.slice(0, 10)) return `${sd} ${MONTHS[sm - 1]}`
  const [, em, ed] = parts(end)
  return sm === em ? `${sd}–${ed} ${MONTHS[sm - 1]}` : `${sd} ${MONTHS[sm - 1]}–${ed} ${MONTHS[em - 1]}`
}

function fairText(fair: ClaimFair): string {
  return fair.start ? `${fair.place}, ${span(fair.start, fair.end)}` : fair.place
}

function gapText(minutes: number): string {
  const rounded = Math.round(minutes)
  if (rounded < 1) return 'at the same moment'
  if (rounded < 90) return `${plural(rounded, 'minute')} apart`
  const hours = Math.round(minutes / 60)
  if (hours < 36) return `${plural(hours, 'hour')} apart`
  return `${plural(Math.round(minutes / 1440), 'day')} apart`
}

const money = formatMoney
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`
/** "an August 2026 fair", "a September 2026 fair". */
const article = (word: string) => (/^[aeiou]/i.test(word) ? 'an' : 'a')

function list(words: string[]): string {
  return words.length <= 1 ? words.join('') : `${words.slice(0, -1).join(', ')} and ${words.at(-1)}`
}

const cents = (n: number) => Math.round(n * 100)
const sameMoney = (a: number, b: number) => cents(a) === cents(b)
const normName = (s: string) => s.trim().replace(/\s+/g, ' ').toUpperCase()
const salesperson = (bill: DoubleClaimBill) => bill.employeeName ?? bill.agentName

// ─── What each bill is ───────────────────────────────────────────────────────

/**
 * A claim form keeps no items — its import writes one summary line per bill
 * ("CLAIM FORM", "August claim form — sales amount"). Such a line says how
 * much, never what, so items and customers cannot be compared against it.
 */
function isSummaryLine(line: ClaimLine): boolean {
  return /claim\s*form/i.test(line.code) || /claim\s*form/i.test(line.name)
}

function fromClaimForm(bill: DoubleClaimBill, ev: ClaimBillEvidence | undefined): boolean {
  if (bill.source === 'erp_sync') return false
  if (/claim\s*form/i.test(ev?.importFile ?? '')) return true
  return (ev?.lines.length ?? 0) > 0 && (ev?.lines ?? []).every(isSummaryLine)
}

function goodsLines(ev: ClaimBillEvidence | undefined): ClaimLine[] {
  return (ev?.lines ?? []).filter(line => line.earns && !isSummaryLine(line))
}

function itemsKnown(ev: ClaimBillEvidence | undefined): boolean {
  return goodsLines(ev).length > 0
}

/** The goods on a bill, code → quantity. Transport and other charges are not goods. */
function goods(ev: ClaimBillEvidence | undefined): Map<string, number> {
  const out = new Map<string, number>()
  for (const line of goodsLines(ev)) {
    const code = line.code.trim().toUpperCase()
    out.set(code, (out.get(code) ?? 0) + line.qty)
  }
  return out
}

function earning(ev: ClaimBillEvidence | undefined): number | null {
  if (!ev || ev.lines.length === 0) return null
  return ev.lines.reduce((a, line) => a + (line.earns ? line.amount : 0), 0)
}

/** What on a bill never earns: transport, disposal and other charges. */
function charges(ev: ClaimBillEvidence | undefined): { names: string[]; amount: number } {
  const lines = (ev?.lines ?? []).filter(line => !line.earns && line.amount !== 0)
  return {
    names: [...new Set(lines.map(line => (line.name || line.code).trim()))],
    amount: lines.reduce((a, line) => a + line.amount, 0),
  }
}

/** "AKEMI ARMOUR MATT (K) + 6 more" — a bill's goods in a phrase, the priced ones first. */
function goodsPhrase(ev: ClaimBillEvidence | undefined): string {
  const lines = goodsLines(ev)
  if (lines.length === 0) return 'No items'
  const priced = lines.filter(line => line.amount > 0)
  const lead = (priced.length ? priced : lines).slice(0, 2).map(line => line.code.trim())
  const more = lines.length - lead.length
  return `${lead.join(' + ')}${more > 0 ? ` + ${more} more` : ''}`
}

/** Every item, with its quantity: "HAPPI SLEEP SOLITUDE MATT (Q) ×1 · JAGER-(Q) ×1". */
function goodsList(ev: ClaimBillEvidence | undefined): string {
  return goodsLines(ev).map(line => `${line.code.trim()} ×${Number(line.qty)}`).join(' · ')
}

function firstCreated(ev: ClaimBillEvidence | undefined): ClaimDelivery | undefined {
  return ev?.deliveries.find(d => d.status === 'applied' && d.message === 'created')
}

export function standingOf(bill: DoubleClaimBill, ev: ClaimBillEvidence | undefined, ctx: ClaimContext): ClaimStanding {
  if (ev?.paidByRun) return { kind: 'run', month: ev.paidByRun.month, at: ev.paidByRun.at }
  if (bill.paidByRun) return { kind: 'run', month: bill.periodMonth, at: null }
  if (ctx.firstPaidMonth && bill.periodMonth < ctx.firstPaidMonth) {
    return fromClaimForm(bill, ev)
      ? { kind: 'claim_form', month: bill.periodMonth, file: ev?.importFile ?? null }
      : { kind: 'settled', month: bill.periodMonth }
  }
  if (ev?.closed) return { kind: 'closed', month: ev.closed.month, at: ev.closed.at, by: ev.closed.by }
  return { kind: 'open', month: bill.periodMonth }
}

const claimed = (s: ClaimStanding) => s.kind !== 'open'

function standingText(bill: DoubleClaimBill, standing: ClaimStanding): string {
  switch (standing.kind) {
    case 'claim_form': return `Paid on the ${claimMonth(standing.month)} claim form`
    case 'settled': return `Paid outside the portal — ${claimMonth(standing.month)} is settled`
    case 'run': return `Paid by the ${claimMonth(standing.month)} run${standing.at ? ` on ${claimDay(mytDay(standing.at))}` : ''}`
    case 'closed': return `Locked in ${salesperson(bill)}’s ${claimMonth(standing.month)} close`
    case 'open': return `Not paid yet — ${claimMonth(standing.month)} pays it`
  }
}

function cameFrom(bill: DoubleClaimBill, ev: ClaimBillEvidence | undefined): string {
  if (bill.source === 'erp_sync') return 'ERP document'
  return fromClaimForm(bill, ev) ? 'Claim form' : 'File import'
}

// ─── Comparing the bills ─────────────────────────────────────────────────────

function sameness<T>(values: (T | null)[], equal: (a: T, b: T) => boolean): Sameness {
  if (values.some(v => v === null)) return 'unknown'
  const [first, ...rest] = values as T[]
  return rest.every(v => equal(first, v)) ? 'same' : 'differs'
}

interface Comparison {
  salesperson: Sameness
  customer: Sameness
  fair: Sameness
  /** The venue as written on the bill — the same place can sit at two fairs' dates. */
  venue: Sameness
  sales: Sameness
  earning: Sameness
  paid: Sameness
  items: Sameness
  /** Codes on every bill, when every bill knows its items. */
  commonItems: string[]
  itemsKnownAll: boolean
  /** Between the first and last ERP document's opening, in minutes; null with fewer than two. */
  openedGapMinutes: number | null
  /** Adjacent document numbers (HC-SO-2609-067 / -068). */
  consecutive: boolean
  /** Days between the earliest and latest date on the bills. */
  daysApart: number
}

function consecutiveNumbers(orderNos: string[]): boolean {
  const parsed = orderNos.map(no => /^(.*?)(\d+)$/.exec(no)).filter((m): m is RegExpExecArray => m !== null)
  if (parsed.length !== orderNos.length || parsed.length < 2) return false
  if (new Set(parsed.map(m => m[1])).size !== 1) return false
  const numbers = parsed.map(m => Number(m[2])).sort((a, b) => a - b)
  return numbers.every((n, i) => i === 0 || n - numbers[i - 1] === 1)
}

function compare(bills: DoubleClaimBill[], evs: (ClaimBillEvidence | undefined)[]): Comparison {
  const known = evs.map(itemsKnown)
  const itemSets = evs.map((ev, i) => (known[i] ? goods(ev) : null))
  const sets = itemSets.filter((set): set is Map<string, number> => set !== null)
  const commonItems = known.every(Boolean) && sets.length > 1
    ? [...sets[0].keys()].filter(code => sets.every(set => set.has(code)))
    : []
  const sameItems = (a: Map<string, number>, b: Map<string, number>) =>
    a.size === b.size && [...a].every(([code, qty]) => b.get(code) === qty)
  const opened = bills
    .map((b, i) => (b.source === 'erp_sync' ? evs[i]?.erpOpenedAt ?? null : null))
    .filter((at): at is string => at !== null)
    .map(at => new Date(at).getTime())
  const dates = bills.map(b => b.orderDate).sort()
  const paid = evs.map(ev => ev?.paidAmount ?? null)
  return {
    salesperson: sameness(bills.map(b => b.staffId ?? normName(b.agentName)), (a, b) => a === b),
    customer: sameness(evs.map(ev => (ev?.customer?.trim() ? normName(ev.customer) : null)), (a, b) => a === b),
    fair: sameness(evs.map(ev => (ev?.fair ? `${normName(ev.fair.place)}|${ev.fair.start ?? ''}` : null)), (a, b) => a === b),
    venue: sameness(evs.map(ev => (ev?.venue?.trim() ? normName(ev.venue) : null)), (a, b) => a === b),
    sales: sameness(bills.map(b => b.orderTotal), sameMoney),
    earning: sameness(evs.map(earning), sameMoney),
    // Nothing paid on any of them says nothing about whether they are one sale.
    paid: paid.every(p => p === 0) ? 'unknown' : sameness(paid, sameMoney),
    items: known.every(Boolean) ? sameness(itemSets, sameItems) : 'unknown',
    commonItems,
    itemsKnownAll: known.every(Boolean),
    openedGapMinutes: opened.length > 1 ? (Math.max(...opened) - Math.min(...opened)) / 60_000 : null,
    consecutive: bills.every(b => b.source === 'erp_sync') && consecutiveNumbers(bills.map(b => b.orderNo)),
    daysApart: daysBetween(dates[0], dates.at(-1)!),
  }
}

/**
 * What the bills look like to each other, whatever has been paid:
 *  - copy: the same sale twice — identical goods and value, or, under one
 *    salesperson, at least two of customer / fair / what earns / deposit /
 *    items alike and nothing that says otherwise;
 *  - split: documents opened together (within the hour, or numbered one after
 *    the other) with no goods in common — one sale written as two, each
 *    earning on its own lines;
 *  - second_sale: days apart for the same customer (or one nobody can tell) —
 *    an add-on, or a new sale written on an old paper;
 *  - number_only: nothing else to go on.
 */
function patternOf(c: Comparison): ClaimPattern {
  if (c.items === 'same' && c.sales === 'same') return 'copy'
  const alike = [c.customer, c.fair, c.earning, c.paid, c.items].filter(s => s === 'same').length
  if (c.salesperson === 'same' && alike >= 2 && c.items !== 'differs') return 'copy'
  const together = (c.openedGapMinutes !== null && c.openedGapMinutes <= 60) || c.consecutive
  if (together && c.itemsKnownAll && c.commonItems.length === 0) return 'split'
  if (c.customer !== 'differs' && c.daysApart >= 3) return 'second_sale'
  return 'number_only'
}

// ─── The explanation ─────────────────────────────────────────────────────────

const LABELS: Record<ClaimVerdict, string> = {
  paid_again: 'Would pay twice',
  copy: 'Same sale twice',
  split: 'One sale, two documents',
  second_sale: 'Second bill on the paper',
  settled: 'Settled — nothing to pay',
  number_only: 'Same number only',
}

function arrivalSentence(bill: DoubleClaimBill, ev: ClaimBillEvidence | undefined): string {
  const pays = ` Nothing has paid it yet — it is in ${claimMonth(bill.periodMonth)}’s commission.`
  if (bill.source === 'erp_sync') {
    const opened = ev?.erpOpenedAt ? mytDay(ev.erpOpenedAt) : ev?.soDate ?? bill.orderDate
    const closedOn = ev?.fair?.start ? (ev.fair.end ?? ev.fair.start).slice(0, 10) : null
    const late = closedOn && opened > closedOn && daysBetween(closedOn, opened) > 7
      ? `, for a sale at ${fairText(ev!.fair!)} — ${plural(daysBetween(closedOn, opened), 'day')} after that fair closed`
      : ''
    return `${bill.orderNo} is an ERP document opened on ${claimDay(opened)}${late}.${pays}`
  }
  return `${bill.orderNo} came in on ${ev?.importFile ?? 'a file'}.${pays}`
}

/** One sentence per claimed bill — bills settled in the same month together. */
function claimedSentences(bills: DoubleClaimBill[], evs: (ClaimBillEvidence | undefined)[], standings: ClaimStanding[], ctx: ClaimContext): string[] {
  const out: string[] = []
  const settled = bills.map((b, i) => ({ b, ev: evs[i], s: standings[i] })).filter(x => x.s.kind === 'settled')
  const settledMonths = new Set(settled.map(x => x.s.month))
  if (settled.length > 1 && settledMonths.size === 1) {
    const month = claimMonth(settled[0].s.month)
    const fairs = new Set(settled.map(x => (x.ev?.fairSource === 'manual' && x.ev.fair ? fairText(x.ev.fair) : '')))
    const placed = fairs.size === 1 && [...fairs][0] ? ` Somebody placed them there by hand, at ${[...fairs][0]}.` : ''
    out.push(`${list(settled.map(x => x.b.orderNo))} count in ${month}, a month paid outside the portal${ctx.cutoverNote ? ` (${ctx.cutoverNote})` : ''}.${placed}`)
  }
  const together = settled.length > 1 && settledMonths.size === 1
  for (const [i, bill] of bills.entries()) {
    const standing = standings[i]
    const ev = evs[i]
    switch (standing.kind) {
      case 'claim_form':
        out.push(`${bill.orderNo} was already paid on the ${claimMonth(standing.month)} claim form${standing.file ? ` (${standing.file})` : ''} — ${money(bill.orderTotal)} under ${salesperson(bill)}.`)
        break
      case 'settled': {
        if (together) break
        const placed = ev?.fairSource === 'manual' && ev.fair ? ` Somebody placed it there by hand, at ${fairText(ev.fair)}.` : ''
        out.push(`${bill.orderNo} counts in ${claimMonth(standing.month)}, a month paid outside the portal${ctx.cutoverNote ? ` (${ctx.cutoverNote})` : ''}.${placed}`)
        break
      }
      case 'run':
        out.push(`${bill.orderNo} was already paid by the ${claimMonth(standing.month)} run${standing.at ? ` on ${claimDay(mytDay(standing.at))}` : ''}.`)
        break
      case 'closed':
        out.push(`${bill.orderNo} is locked in ${salesperson(bill)}’s ${claimMonth(standing.month)} close (${claimDay(mytDay(standing.at))}${standing.by ? `, by ${standing.by}` : ''}).`)
        break
      case 'open':
        break
    }
  }
  return out
}

function matchSentence(bills: DoubleClaimBill[], evs: (ClaimBillEvidence | undefined)[], c: Comparison): string | null {
  const first = evs[0]
  const same: string[] = []
  if (c.salesperson === 'same') same.push(`salesperson (${salesperson(bills[0])})`)
  if (c.customer === 'same' && first?.customer) same.push(`customer (${first.customer.trim()})`)
  if (c.fair === 'same' && first?.fair) same.push(`fair (${fairText(first.fair)})`)
  else if (c.venue === 'same' && first?.venue) same.push(`venue written on the bill (${first.venue.trim()})`)
  if (c.items === 'same') same.push(`${plural(goods(first).size, 'item')} (${goodsList(first)})`)
  if (c.sales === 'same') same.push(`sales value (${money(bills[0].orderTotal)})`)
  else if (c.earning === 'same') same.push(`${money(earning(first) ?? 0)} that earns commission`)
  if (c.paid === 'same' && first?.paidAmount) {
    same.push(c.sales === 'same' && sameMoney(first.paidAmount, bills[0].orderTotal)
      ? 'payment (paid in full)'
      : `deposit (${money(first.paidAmount)} paid)`)
  }
  if (same.length === 0) return null
  return `${bills.length === 2 ? 'Both have' : `All ${bills.length} have`} the same ${list(same)}.`
}

function differenceSentences(bills: DoubleClaimBill[], evs: (ClaimBillEvidence | undefined)[], c: Comparison, pattern: ClaimPattern): string[] {
  const out: string[] = []
  const each = (value: (b: DoubleClaimBill, ev: ClaimBillEvidence | undefined) => string) =>
    list(bills.map((b, i) => `${value(b, evs[i])} on ${b.orderNo}`))
  if (c.salesperson === 'differs') out.push(`Different salespeople: ${each(b => salesperson(b))}.`)
  if (c.customer === 'differs') out.push(`Different customers: ${each((_, ev) => ev?.customer?.trim() ?? '—')}.`)
  // A split's parts and a second sale's add-on differ by nature; their own
  // sentence says how, so the money is not listed as a difference again.
  if (pattern === 'split' || pattern === 'second_sale') return out
  if (c.fair === 'differs') out.push(`Different fairs: ${each((_, ev) => (ev?.fair ? fairText(ev.fair) : '—'))}.`)
  if (c.sales === 'differs') {
    const extra = bills.length === 2 ? bills[1].orderTotal - bills[0].orderTotal : null
    let text = `Sales value differs: ${each(b => money(b.orderTotal))}`
    if (extra !== null) text += ` — ${money(Math.abs(extra))} ${extra > 0 ? 'more' : 'less'} on the later one`
    if (c.earning === 'same') {
      const extras = [...new Set(evs.flatMap(ev => charges(ev).names))]
      text += extras.length ? `, all of it ${list(extras)}, which never earns` : ', none of it earning'
    }
    out.push(`${text}.`)
  }
  if (c.paid === 'differs') out.push(`Paid so far differs: ${each((_, ev) => money(ev?.paidAmount ?? 0))}.`)
  return out
}

function unknownSentence(bills: DoubleClaimBill[], evs: (ClaimBillEvidence | undefined)[], c: Comparison): string | null {
  const blind = bills.filter((b, i) => fromClaimForm(b, evs[i])).map(b => b.orderNo)
  if (blind.length === 0 || (c.customer !== 'unknown' && c.items !== 'unknown')) return null
  return `A claim form names no customer and lists no items, so those cannot be compared for ${list(blind)}.`
}

function patternSentence(pattern: ClaimPattern, bills: DoubleClaimBill[], evs: (ClaimBillEvidence | undefined)[], c: Comparison): string | null {
  if (pattern === 'split') {
    const together = [
      c.openedGapMinutes !== null ? `opened in the ERP ${gapText(c.openedGapMinutes)}` : null,
      c.consecutive ? 'numbered one after the other' : null,
    ].filter(Boolean).join(' and ')
    const pieces = bills.map((b, i) => `${b.orderNo}: ${goodsPhrase(evs[i])}, ${money(b.orderTotal)}`)
    const total = bills.reduce((a, b) => a + b.orderTotal, 0)
    return `The documents were ${together}, and no item is on more than one of them (${pieces.join('; ')}) — one sale written as ${bills.length}, each earning only on its own lines, ${money(total)} together.`
  }
  if (pattern === 'second_sale') {
    const [a, b] = [bills[0], bills.at(-1)!]
    const [evA, evB] = [evs[0], evs.at(-1)]
    const where = c.fair === 'differs' && evB?.fair ? ` at another fair (${fairText(evB.fair)}${evA?.fair ? ` — ${a.orderNo} was at ${fairText(evA.fair)}` : ''})` : ''
    const repeats = c.commonItems.length
      ? ` It repeats ${list(c.commonItems)} from ${a.orderNo}.`
      : c.itemsKnownAll ? ` No item on it is on ${a.orderNo}.` : ''
    return `${b.orderNo} is dated ${plural(c.daysApart, 'day')} after ${a.orderNo}${where}, for ${money(b.orderTotal)} against ${a.orderNo}’s ${money(a.orderTotal)}.${repeats}`
  }
  return null
}

function headlineOf(verdict: ClaimVerdict, pattern: ClaimPattern, bills: DoubleClaimBill[], standings: ClaimStanding[], copies: DoubleClaimBill[], c: Comparison): string {
  const firstClaimed = standings.find(claimed)
  const claimedMonth = firstClaimed ? claimMonth(firstClaimed.month) : ''
  const copyNos = list(copies.map(b => b.orderNo))
  switch (verdict) {
    case 'paid_again':
      return pattern === 'copy'
        ? `Already claimed in ${claimedMonth} — ${copyNos} would pay the same sale again`
        : `${copyNos} ${copies.length === 1 ? 'carries' : 'carry'} the paper of a bill already claimed in ${claimedMonth}`
    case 'copy':
      return `The same sale twice — ${list(bills.map(b => b.orderNo))} would both pay`
    case 'split':
      return `One sale written as ${bills.length} documents — nothing is paid twice`
    case 'second_sale':
      return `A second bill on the same paper, ${plural(c.daysApart, 'day')} later`
    case 'settled':
      return pattern === 'split'
        ? `One sale written as ${bills.length} documents, in a month already settled — nothing is paid again`
        : 'Every bill is in a month already settled — nothing is paid again'
    case 'number_only':
      return 'Only the paper number is the same'
  }
}

function actionOf(verdict: ClaimVerdict, pattern: ClaimPattern, bills: DoubleClaimBill[], copies: DoubleClaimBill[], c: Comparison): string {
  switch (verdict) {
    case 'paid_again': {
      const copy = copies[0]
      const original = bills.find(b => !copies.includes(b))
      const extra = original && copies.length === 1 ? copy.orderTotal - original.orderTotal : 0
      const more = c.sales === 'differs' && c.earning !== 'same' && extra > 0 && original
        ? ` If the customer really did add to the order, only the ${money(extra)} above ${original.orderNo} is new.`
        : ''
      return `If it is the same sale, take ${list(copies.map(b => b.orderNo))} out of ${claimMonth(copy.periodMonth)}: right-click it on All bills or on ${salesperson(copy)}’s ledger › Don’t count this bill.${more} If it is a different sale, its paper number is wrong in the ERP — correct it there, then mark this checked.`
    }
    case 'copy':
      return `Unless the customer really bought the same thing twice, take ${list(copies.map(b => b.orderNo))} out (right-click it › Don’t count this bill). If they are two sales, mark this checked.`
    case 'split':
      return `If ${bills[0].billRef} is one sale written as ${bills.length} documents, mark this checked — each document earns only on its own lines.`
    case 'second_sale': {
      const [a, b] = [bills[0], bills.at(-1)!]
      return `If ${b.orderNo} adds to ${a.orderNo}’s sale, only what was added should earn — correct it in the ERP. If it is a separate purchase, mark this checked.`
    }
    case 'settled':
      return pattern === 'copy'
        ? 'Nothing is paid again from here. Correct the copy where it came from so the record is right, then mark this checked.'
        : 'Nothing to pay or take back. Mark it checked to clear it.'
    case 'number_only':
      return 'Open each bill; if they are different sales, mark this checked.'
  }
}

// ─── Each bill's history ─────────────────────────────────────────────────────

interface TimedEvent extends ClaimEvent { at: string }

function historyOf(bill: DoubleClaimBill, ev: ClaimBillEvidence | undefined, standing: ClaimStanding, ctx: ClaimContext): ClaimEvent[] {
  const timed: TimedEvent[] = []
  const facts: ClaimEvent[] = []
  const created = firstCreated(ev)
  const moved = Boolean(created?.month && created.month !== bill.periodMonth)
  if (bill.source === 'erp_sync') {
    if (ev?.erpOpenedAt) {
      timed.push({
        at: ev.erpOpenedAt, when: claimMoment(ev.erpOpenedAt),
        text: `Opened in the ERP${ev.soDate ? `, dated ${claimDay(ev.soDate)}` : ''}, on paper ${bill.billRef}.`,
      })
    }
    const deliveries = ev?.deliveries ?? []
    const drafts = deliveries.filter(d => d.status === 'skipped' && /draft/i.test(d.message ?? ''))
    const saves = deliveries.filter(d => d.status === 'applied' && d.message !== 'created')
    const held = deliveries.filter(d => d.status === 'held')
    if (drafts.length) {
      timed.push({
        at: drafts[0].at, when: claimMoment(drafts[0].at),
        text: `Saved as a draft ${drafts.length === 1 ? 'once' : `${drafts.length} times`} — a draft is not a sale yet, so nothing was counted.`,
      })
    }
    if (created) {
      timed.push({
        at: created.at, when: claimMoment(created.at),
        text: `Became a sale in the portal, counted in ${claimMonth(created.month ?? bill.periodMonth)}.`,
      })
    } else if (deliveries.length === 0) {
      facts.push({ when: null, text: 'No delivery of it from the ERP is logged.' })
    }
    if (saves.length) {
      const last = saves.at(-1)!
      timed.push({
        at: last.at, when: claimMoment(last.at),
        text: `Saved again in the ERP ${saves.length === 1 ? 'once' : `${saves.length} times`} since — the latest.`,
      })
    }
    if (held.length) {
      const last = held.at(-1)!
      timed.push({
        at: last.at, when: claimMoment(last.at), tone: 'alert',
        text: `${plural(held.length, 'save')} held back — its month was closed to the ERP.`,
      })
    }
    if (moved && created?.month) {
      const why = ev?.fairSource === 'manual' && ev.fair ? `: somebody placed it by hand at ${fairText(ev.fair)}`
        : ev?.fairSource === 'erp' && ev.fair ? `: the ERP names ${fairText(ev.fair)}`
        : ev?.fair ? `: the fair calendar put it at ${fairText(ev.fair)}` : ''
      facts.push({ when: null, text: `Moved from ${claimMonth(created.month)} to ${claimMonth(bill.periodMonth)}${why}.` })
    } else if (ev?.fair?.start && monthOf(ev.fair.start) !== bill.periodMonth) {
      // A fair of another month than the bill's own: the fair says when the
      // sale happened, the month says when it is paid.
      const fairMonth = monthOf(ev.fair.start)
      const settledFair = ctx.firstPaidMonth !== null && fairMonth < ctx.firstPaidMonth
      facts.push({
        when: null,
        text: `${ev.fairSource === 'erp' ? 'The ERP names' : 'It sits at'} ${fairText(ev.fair)} — ${article(claimMonth(fairMonth))} ${claimMonth(fairMonth)} fair${settledFair
          ? `; ${claimMonth(fairMonth)} is settled, so the bill stays in ${claimMonth(bill.periodMonth)}`
          : ''}.`,
      })
    }
  } else {
    const where = ev?.fair ? fairText(ev.fair) : ev?.venue?.trim() || null
    timed.push({ at: bill.orderDate, when: claimDay(bill.orderDate), text: `Sold${where ? ` at ${where}` : ''}.` })
    if (ev?.importedAt) {
      timed.push({
        at: ev.importedAt, when: claimMoment(ev.importedAt),
        text: `Entered from ${ev.importFile ?? 'a file'} into ${claimMonth(bill.periodMonth)}.`,
      })
    }
  }

  for (const change of ev?.adjustments ?? []) {
    const answer = change.status === 'pending' ? 'waiting for an answer'
      : change.status === 'confirmed' ? `paid${change.paidIn ? ` in ${claimMonth(change.paidIn)}` : ''}`
      : 'answered: not a change'
    timed.push({
      at: change.foundAt, when: claimMoment(change.foundAt), tone: change.status === 'pending' ? 'alert' : undefined,
      text: `The ERP changed it after it was settled: a ${change.kind === 'drop' ? 'drop' : 'upsell'} of ${money(Math.abs(change.amount))} — ${answer}.`,
    })
  }

  const where: ClaimEvent = (() => {
    switch (standing.kind) {
      case 'claim_form':
        return { when: null, tone: 'paid', text: `Paid: ${claimMonth(standing.month)} was paid from the claim form${ctx.firstPaidMonth ? ` — the portal pays from ${claimMonth(ctx.firstPaidMonth)}` : ''}.` }
      case 'settled':
        return { when: null, tone: 'paid', text: `Paid outside the portal: ${claimMonth(standing.month)} is settled${ctx.cutoverNote ? ` (${ctx.cutoverNote})` : ''}, and no run pays it.` }
      case 'run':
        return { when: standing.at ? claimMoment(standing.at) : null, tone: 'paid', text: `Paid by the ${claimMonth(standing.month)} run.` }
      case 'closed':
        return { when: claimMoment(standing.at), tone: 'paid', text: `Locked in ${salesperson(bill)}’s ${claimMonth(standing.month)} close${standing.by ? ` by ${standing.by}` : ''}.` }
      case 'open':
        return { when: null, tone: 'alert', text: `Not paid yet — ${claimMonth(standing.month)}’s commission counts it.` }
    }
  })()

  timed.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime())
  return [...timed.map(({ when, text, tone }) => ({ when, text, ...(tone ? { tone } : {}) })), ...facts, where]
}

// ─── The side-by-side facts ──────────────────────────────────────────────────

function fairNote(ev: ClaimBillEvidence | undefined): string | null {
  if (!ev?.fair) return null
  const who = ev.fairSource === 'erp' ? 'Named by the ERP'
    : ev.fairSource === 'manual' ? 'Placed by hand'
    : ev.fairSource === 'venue_match' ? 'Matched by the venue'
    : 'Placed by the fair calendar'
  const typed = ev.venue?.trim() && normName(ev.venue) !== normName(ev.fair.place) ? ` · written on the bill: ${ev.venue.trim()}` : ''
  return `${who}${typed}`
}

function factsOf(bills: DoubleClaimBill[], evs: (ClaimBillEvidence | undefined)[], standings: ClaimStanding[], c: Comparison): ClaimFact[] {
  const row = (label: string, values: string[], same: Sameness | null, gap: string | null = null,
    notes: (string | null)[] = values.map(() => null)): ClaimFact => ({ label, values, notes, same, gap })
  const sales = bills.map(b => b.orderTotal)
  const facts: ClaimFact[] = [
    row('Counted in', bills.map(b => claimMonth(b.periodMonth)), null),
    row('Came from', bills.map((b, i) => cameFrom(b, evs[i])), null, null,
      bills.map((b, i) => (b.source === 'erp_sync' ? null : evs[i]?.importFile ?? null))),
    row('Salesperson', bills.map(salesperson), c.salesperson),
    row('Customer', evs.map(ev => ev?.customer?.trim() || '—'), c.customer, null,
      bills.map((b, i) => (!evs[i]?.customer?.trim() && fromClaimForm(b, evs[i]) ? 'Not on the claim form' : null))),
    row('Fair', evs.map(ev => (ev?.fair ? fairText(ev.fair) : ev?.venue?.trim() || '—')), c.fair, null, evs.map(fairNote)),
    row('Date on the bill', bills.map(b => claimDay(b.orderDate)), c.daysApart === 0 ? 'same' : 'differs',
      c.daysApart === 0 ? null : `${plural(c.daysApart, 'day')} apart`),
  ]
  if (bills.some(b => b.source === 'erp_sync')) {
    facts.push(row('Opened in the ERP',
      bills.map((b, i) => (b.source === 'erp_sync' && evs[i]?.erpOpenedAt ? claimMoment(evs[i]!.erpOpenedAt!) : '—')),
      null, c.openedGapMinutes !== null ? gapText(c.openedGapMinutes) : null,
      bills.map(b => (b.source === 'erp_sync' ? null : 'Not an ERP document'))))
  }
  const salesGap = bills.length === 2 && c.sales === 'differs'
    ? `${money(Math.abs(sales[1] - sales[0]))} ${sales[1] > sales[0] ? 'more' : 'less'} on the later`
    : null
  facts.push(
    row('Sales value', sales.map(money), c.sales, salesGap),
    row('Earns commission on', evs.map(ev => { const e = earning(ev); return e === null ? '—' : money(e) }), c.earning, null,
      evs.map(ev => { const x = charges(ev); return x.amount ? `${money(x.amount)} ${list(x.names)} never earns` : null })),
    row('Paid so far', evs.map(ev => (ev?.paidAmount == null ? '—' : money(ev.paidAmount))), c.paid, null,
      bills.map((b, i) => {
        const paid = evs[i]?.paidAmount
        return paid != null && b.orderTotal > 0 ? `${Math.round((paid / b.orderTotal) * 100)}% of the bill` : null
      })),
    row('Items', evs.map((ev, i) => (itemsKnown(ev) ? goodsPhrase(ev) : fromClaimForm(bills[i], ev) ? '—' : 'No items')), c.items,
      c.itemsKnownAll && c.items === 'differs'
        ? (c.commonItems.length ? `${plural(c.commonItems.length, 'item')} in common` : 'None in common')
        : null,
      bills.map((b, i) => (fromClaimForm(b, evs[i]) ? 'Not on the claim form' : goodsList(evs[i]) || null))),
    row('Where it stands', bills.map((b, i) => standingText(b, standings[i])), null),
  )
  return facts
}

// ─── Putting it together ─────────────────────────────────────────────────────

export function explainDoubleClaim(
  group: DoubleClaimGroup,
  evidence: ReadonlyMap<string, ClaimBillEvidence>,
  ctx: ClaimContext,
): ClaimExplanation {
  const bills = group.bills
  const evs = bills.map(b => evidence.get(b.orderId))
  const standings = bills.map((b, i) => standingOf(b, evs[i], ctx))
  const c = compare(bills, evs)
  const pattern = patternOf(c)
  const anyClaimed = standings.some(claimed)
  const anyOpen = standings.some(s => !claimed(s))
  const verdict: ClaimVerdict = anyClaimed && anyOpen ? 'paid_again' : !anyOpen ? 'settled' : pattern
  const copies = verdict === 'paid_again' ? bills.filter((_, i) => !claimed(standings[i]))
    : verdict === 'copy' ? bills.slice(1)
    : []

  // What is already claimed first — the thing the others would pay again —
  // then how the rest arrived, what they share, where they part, and what
  // the pattern of the two says.
  const reasons: string[] = [
    `Paper ${group.billRef} is on ${plural(bills.length, 'bill')}: ${list(bills.map(b => `${b.orderNo} (${claimMonth(b.periodMonth)})`))}.`,
    ...claimedSentences(bills, evs, standings, ctx),
    ...bills.flatMap((b, i) => (standings[i].kind === 'open' ? [arrivalSentence(b, evs[i])] : [])),
  ]
  const match = matchSentence(bills, evs, c)
  if (match) reasons.push(match)
  reasons.push(...differenceSentences(bills, evs, c, pattern))
  const patternLine = patternSentence(pattern, bills, evs, c)
  if (patternLine) reasons.push(patternLine)
  const blind = unknownSentence(bills, evs, c)
  if (blind) reasons.push(blind)
  for (const [i, b] of bills.entries()) {
    if (standings[i].kind === 'open' && evs[i]?.paidAmount === 0 && b.orderTotal > 0) {
      reasons.push(`Nothing is paid on ${b.orderNo} yet, so the deposit gate holds its commission for now.`)
    }
  }

  return {
    billRef: group.billRef,
    verdict,
    pattern,
    label: LABELS[verdict],
    headline: headlineOf(verdict, pattern, bills, standings, copies, c),
    reasons,
    action: actionOf(verdict, pattern, bills, copies, c),
    facts: factsOf(bills, evs, standings, c),
    history: Object.fromEntries(bills.map((b, i) => [b.orderId, historyOf(b, evs[i], standings[i], ctx)])),
    standings: Object.fromEntries(bills.map((b, i) => [b.orderId, standings[i]])),
    atRisk: Math.round(copies.reduce((a, b) => a + b.orderTotal, 0) * 100) / 100,
    copies: copies.map(b => b.orderId),
  }
}

import { formatDate, formatMoney, formatMonth } from '@/lib/utils'

/**
 * The ERP's audit trail, as the portal keeps it (`sales_order_erp_changes`,
 * mig 20261013010000).
 *
 * The user, 2026-10-12: the Houzs ERP writes no audit trail for a sales order
 * changed before its processing date, yet commission is paid from the day the
 * order is opened — "只要他开了单，任何改动只要一按 save 他的 sales order，我
 * 这边都要能 track 到，记录在我们自己的 audit trail 里 … 判断是 upsell 还是
 * drop sales or cancelation". The ERP sends the whole document on every save;
 * the receiver now keeps each delivery that changed something as a row — the
 * document before and after, the kind of change measured on what EARNS, and
 * whether its commission had already been given.
 *
 * Pure: what a row is called, which tone it wears, and what changed, in words.
 */

/**
 * The day the record began for every save (mig 20261013010000 went in on
 * 2026-10-12, 23:15 office time); held deliveries go back to 2026-09-26.
 */
export const TRAIL_SINCE = '2026-10-12'

export type ErpChangeKind = 'opened' | 'upsell' | 'drop' | 'cancelled' | 'deleted' | 'on_hold' | 'reinstated' | 'changed'

/** What gave the commission on a bill (comm_upsales.settled_by / the trail's settled_by). */
export type SettledBy = 'run' | 'close' | 'hand' | 'frozen'

/** Why the ERP's figure moved, on a drop or an upsell it found (comm_upsales.erp_reason). */
export type AdjustmentReason = 'amount' | 'cancelled' | 'deleted' | 'on_hold' | 'not_counted' | 'reinstated'

export interface ErpDocLine {
  lineNo: number
  itemGroup: string
  itemCode: string
  description: string | null
  variant: string | null
  qty: number
  unitPrice: number
  amount: number
}

/** A document as one delivery left it (erp_order_state's shape). */
export interface ErpDocState {
  status: string
  onHold: boolean
  deleted: boolean
  total: number
  balance: number | null
  /** What earns: its lines in groups the scheme pays on — 0 while the ERP does not count it. */
  commissionable: number
  salespersonId: string | null
  salesperson: string | null
  customer: string | null
  orderDate: string | null
  venue: string | null
  fairDate: string | null
  lines: ErpDocLine[]
}

/** One row of the trail. */
export interface ErpChange {
  id: string
  orderNo: string
  orderId: string | null
  /** When the ERP built the delivery — the Save. */
  savedAt: string | null
  receivedAt: string
  /** applied: written over the bill; held: its month is settled, the bill kept as it was. */
  outcome: 'applied' | 'held'
  periodMonth: string | null
  kind: ErpChangeKind
  totalBefore: number | null
  totalAfter: number | null
  commissionableBefore: number | null
  commissionableAfter: number | null
  statusBefore: string | null
  statusAfter: string | null
  before: ErpDocState | null
  after: ErpDocState | null
  /** What the commission had been given on when it came; null: nothing given yet. */
  settledAmount: number | null
  settledPeriod: string | null
  settledBy: SettledBy | null
  /** The drop or upsell it opened or moved (comm_upsales). */
  adjustmentId: string | null
}

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : null
}
const str = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null)

/** A state as stored (JSON): read defensively — a field added later reads as nothing. */
export function parseState(raw: unknown): ErpDocState | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const lines = Array.isArray(o.lines) ? o.lines : []
  return {
    status: str(o.status) ?? 'CONFIRMED',
    onHold: o.onHold === true,
    deleted: o.deleted === true,
    total: num(o.total) ?? 0,
    balance: num(o.balance),
    commissionable: num(o.commissionable) ?? 0,
    salespersonId: str(o.salespersonId),
    salesperson: str(o.salesperson),
    customer: str(o.customer),
    orderDate: str(o.orderDate),
    venue: str(o.venue),
    fairDate: str(o.fairDate),
    lines: lines.flatMap(l => {
      if (!l || typeof l !== 'object') return []
      const x = l as Record<string, unknown>
      return [{
        lineNo: num(x.lineNo) ?? 0,
        itemGroup: str(x.itemGroup) ?? 'UNGROUPED',
        itemCode: str(x.itemCode) ?? '(none)',
        description: str(x.description),
        variant: str(x.variant),
        qty: num(x.qty) ?? 0,
        unitPrice: num(x.unitPrice) ?? 0,
        amount: num(x.amount) ?? 0,
      }]
    }),
  }
}

/** A trail row as PostgREST returns it. */
export interface ErpChangeRow {
  id: string
  order_no: string
  order_id: string | null
  saved_at: string | null
  received_at: string
  outcome: string
  period_month: string | null
  kind: string
  total_before: number | string | null
  total_after: number | string | null
  commissionable_before: number | string | null
  commissionable_after: number | string | null
  status_before: string | null
  status_after: string | null
  state_before: unknown
  state_after: unknown
  settled_amount: number | string | null
  settled_period: string | null
  settled_by: string | null
  adjustment_id: string | null
}

export const ERP_CHANGE_SELECT =
  'id, order_no, order_id, saved_at, received_at, outcome, period_month, kind, total_before, total_after, ' +
  'commissionable_before, commissionable_after, status_before, status_after, state_before, state_after, ' +
  'settled_amount, settled_period, settled_by, adjustment_id'

const KINDS: readonly ErpChangeKind[] = ['opened', 'upsell', 'drop', 'cancelled', 'deleted', 'on_hold', 'reinstated', 'changed']
const SETTLED_BY: readonly SettledBy[] = ['run', 'close', 'hand', 'frozen']

export function toErpChange(r: ErpChangeRow): ErpChange {
  return {
    id: r.id,
    orderNo: r.order_no,
    orderId: r.order_id,
    savedAt: r.saved_at,
    receivedAt: r.received_at,
    outcome: r.outcome === 'held' ? 'held' : 'applied',
    periodMonth: r.period_month,
    kind: KINDS.find(k => k === r.kind) ?? 'changed',
    totalBefore: num(r.total_before),
    totalAfter: num(r.total_after),
    commissionableBefore: num(r.commissionable_before),
    commissionableAfter: num(r.commissionable_after),
    statusBefore: r.status_before,
    statusAfter: r.status_after,
    before: parseState(r.state_before),
    after: parseState(r.state_after),
    settledAmount: num(r.settled_amount),
    settledPeriod: r.settled_period,
    settledBy: SETTLED_BY.find(s => s === r.settled_by) ?? null,
    adjustmentId: r.adjustment_id,
  }
}

/** A change to what earns, or to the bill's total — what the month's list shows. */
export function movesMoney(c: Pick<ErpChange, 'kind' | 'totalBefore' | 'totalAfter'>): boolean {
  if (c.kind === 'opened') return false
  if (c.kind !== 'changed') return true
  return c.totalBefore !== c.totalAfter
}

/** What a change is called — the user's words: upsell, drop sales, cancellation. */
export function kindLabel(kind: ErpChangeKind, statusAfter?: string | null): string {
  switch (kind) {
    case 'opened': return 'Opened'
    case 'upsell': return 'Upsell'
    case 'drop': return 'Drop sales'
    case 'cancelled': return 'Cancelled'
    case 'deleted': return 'Deleted in the ERP'
    case 'on_hold': return (statusAfter ?? '').toUpperCase() === 'DRAFT' ? 'Back to draft' : 'On hold'
    case 'reinstated': return 'Reinstated'
    case 'changed': return 'Changed'
  }
}

/** The chip's tone (`.chip <tone>`): green earns more, red earns less, grey earns the same. */
export function kindTone(kind: ErpChangeKind): 'ledger' | 'danger' | 'alert' | 'info' {
  switch (kind) {
    case 'upsell':
    case 'reinstated':
    case 'opened':
      return 'ledger'
    case 'drop':
    case 'cancelled':
    case 'deleted':
      return 'danger'
    case 'on_hold':
      return 'alert'
    case 'changed':
      return 'info'
  }
}

/** A drop or an upsell the ERP found, by why its figure moved. */
export function adjustmentLabel(kind: 'upsale' | 'drop', reason: AdjustmentReason | null | undefined): string {
  switch (reason) {
    case 'cancelled': return 'Cancelled'
    case 'deleted': return 'Deleted in the ERP'
    case 'on_hold': return 'On hold'
    case 'not_counted': return 'Not counted'
    case 'reinstated': return 'Reinstated'
    default: return kind === 'drop' ? 'Drop sales' : 'Upsell'
  }
}

/** Where the commission on a bill was given: "Closed · Sep 2026", "Claim form · Aug 2026". */
export function settledWord(by: SettledBy | null | undefined, period: string | null | undefined): string {
  const month = period ? formatMonth(period) : null
  const what = by === 'close' ? 'Closed' : by === 'run' ? 'Paid by run' : by === 'hand' ? 'Claim form' : by === 'frozen' ? 'Settled by hand' : null
  return [what, month].filter(Boolean).join(' · ') || '—'
}

/** The first month a change on a bill whose commission was given in `settledPeriod` may be paid in. */
export function firstPayableMonth(settledPeriod: string | null | undefined): string | null {
  if (!settledPeriod) return null
  const [y, m] = settledPeriod.slice(0, 7).split('-').map(Number)
  const next = new Date(Date.UTC(y, m, 1))
  return next.toISOString().slice(0, 10)
}

/** May a change be paid in `period`: only in a month after the one that gave the commission. */
export function payableIn(period: string, settledPeriod: string | null | undefined): boolean {
  const first = firstPayableMonth(settledPeriod)
  return first === null || period >= first
}

/** `IN_PRODUCTION` → "In production". */
export function statusWord(status: string | null | undefined): string {
  if (!status) return '—'
  const s = status.replace(/_/g, ' ').toLowerCase()
  return s.charAt(0).toUpperCase() + s.slice(1)
}

// ─── What changed, in words ─────────────────────────────────────────────────

export type LineChange =
  | { kind: 'added'; after: ErpDocLine }
  | { kind: 'removed'; before: ErpDocLine }
  | { kind: 'changed'; before: ErpDocLine; after: ErpDocLine }

const sameLine = (a: ErpDocLine, b: ErpDocLine) =>
  a.qty === b.qty && a.amount === b.amount && a.unitPrice === b.unitPrice && a.variant === b.variant && a.itemGroup === b.itemGroup

/**
 * The lines one save added, removed or changed. A line is matched to the same
 * product (its code, then its description and variant) — a swap of product is
 * a line removed and a line added, as the ERP's form does it.
 */
export function lineChanges(before: readonly ErpDocLine[], after: readonly ErpDocLine[]): LineChange[] {
  const left = [...before]
  const right = [...after]
  const pairs: Array<[ErpDocLine, ErpDocLine]> = []
  const passes: Array<(a: ErpDocLine, b: ErpDocLine) => boolean> = [
    (a, b) => a.itemCode === b.itemCode && a.description === b.description && a.variant === b.variant && sameLine(a, b),
    (a, b) => a.itemCode === b.itemCode && a.description === b.description && a.variant === b.variant,
    (a, b) => a.itemCode === b.itemCode && a.description === b.description,
    (a, b) => a.itemCode === b.itemCode,
  ]
  for (const match of passes) {
    for (let i = 0; i < left.length;) {
      const j = right.findIndex(b => match(left[i], b))
      if (j >= 0) {
        pairs.push([left[i], right[j]])
        left.splice(i, 1)
        right.splice(j, 1)
      } else {
        i++
      }
    }
  }
  const out: LineChange[] = []
  for (const [a, b] of pairs) if (!sameLine(a, b)) out.push({ kind: 'changed', before: a, after: b })
  for (const a of left) out.push({ kind: 'removed', before: a })
  for (const b of right) out.push({ kind: 'added', after: b })
  return out.sort((x, y) => lineNoOf(x) - lineNoOf(y))
}

const lineNoOf = (c: LineChange) => (c.kind === 'added' ? c.after.lineNo : c.before.lineNo)

const qtyTimes = (l: ErpDocLine) => (l.qty === 1 ? '' : `${l.qty} × `)

function lineSentence(c: LineChange): string {
  if (c.kind === 'added') return `Added ${c.after.itemCode} · ${qtyTimes(c.after)}${formatMoney(c.after.amount)}`
  if (c.kind === 'removed') return `Removed ${c.before.itemCode} · ${formatMoney(c.before.amount)}`
  const parts: string[] = []
  if (c.before.amount !== c.after.amount) parts.push(`${formatMoney(c.before.amount)} → ${formatMoney(c.after.amount)}`)
  if (c.before.qty !== c.after.qty) parts.push(`qty ${c.before.qty} → ${c.after.qty}`)
  else if (c.before.unitPrice !== c.after.unitPrice && c.before.amount === c.after.amount) {
    parts.push(`unit ${formatMoney(c.before.unitPrice)} → ${formatMoney(c.after.unitPrice)}`)
  }
  if (c.before.variant !== c.after.variant) parts.push(`${c.before.variant ?? '—'} → ${c.after.variant ?? '—'}`)
  if (c.before.itemGroup !== c.after.itemGroup) parts.push(`group ${c.before.itemGroup} → ${c.after.itemGroup}`)
  return `${c.after.itemCode}: ${parts.join(' · ')}`
}

const day = (d: string | null) => (d ? formatDate(d) : '—')

/**
 * What one save changed, in words, the lines first: the products and their
 * money, then the status, a hold, the salesperson, the customer, the dates,
 * the venue and the balance. Nothing before: the document as it was opened.
 */
export function describeChange(before: ErpDocState | null, after: ErpDocState | null): string[] {
  if (!after) return []
  if (!before) {
    const earns = formatMoney(after.commissionable)
    return [`Opened at ${formatMoney(after.total)}${after.total !== after.commissionable ? ` (${earns} earns)` : ''} · ${after.lines.length} ${after.lines.length === 1 ? 'line' : 'lines'}`]
  }
  if (after.deleted && !before.deleted) return ['Deleted in the ERP']
  const out = lineChanges(before.lines, after.lines).map(lineSentence)
  if (out.length === 0 && before.total !== after.total) out.push(`Bill total ${formatMoney(before.total)} → ${formatMoney(after.total)}`)
  if (before.status !== after.status) out.push(`Status ${statusWord(before.status)} → ${statusWord(after.status)}`)
  if (before.onHold !== after.onHold) out.push(after.onHold ? 'Put on hold' : 'Released from hold')
  if (before.salespersonId !== after.salespersonId || before.salesperson !== after.salesperson) {
    out.push(`Salesperson ${before.salesperson ?? '—'} → ${after.salesperson ?? '—'}`)
  }
  if (before.customer !== after.customer) out.push(`Customer ${before.customer ?? '—'} → ${after.customer ?? '—'}`)
  if (before.orderDate !== after.orderDate) out.push(`Order date ${day(before.orderDate)} → ${day(after.orderDate)}`)
  if (before.fairDate !== after.fairDate) out.push(`Fair day ${day(before.fairDate)} → ${day(after.fairDate)}`)
  if (before.venue !== after.venue) out.push(`Venue ${before.venue ?? '—'} → ${after.venue ?? '—'}`)
  const balance = paymentSentence(before, after)
  if (balance) out.push(balance)
  return out
}

/**
 * What the customer's payments did: paid is the bill's total less its
 * balance, so a balance that moves only because the total did is no payment
 * and says nothing (the lines already said it).
 */
function paymentSentence(before: ErpDocState, after: ErpDocState): string | null {
  if (before.balance === after.balance) return null
  const range = `balance ${before.balance === null ? '—' : formatMoney(before.balance)} → ${after.balance === null ? '—' : formatMoney(after.balance)}`
  if (before.balance === null || after.balance === null) return `Balance ${range.slice('balance '.length)}`
  const paid = Math.round(((after.total - after.balance) - (before.total - before.balance)) * 100) / 100
  if (paid > 0) return `Paid ${formatMoney(paid)} · ${range}`
  if (paid < 0) return `${formatMoney(-paid)} of payments taken off · ${range}`
  return null
}

/**
 * The save a drop or an upsell is about: the one that opened or last moved it,
 * else the document's latest save that moved money, else its latest. `changes`
 * newest first.
 */
export function changeFor(adjustmentId: string, changes: readonly ErpChange[]): ErpChange | null {
  return changes.find(c => c.adjustmentId === adjustmentId && movesMoney(c))
    ?? changes.find(c => movesMoney(c))
    ?? changes[0]
    ?? null
}

/** What earns moved by: after − before (0 for an opening). */
export function earnsDelta(c: Pick<ErpChange, 'commissionableBefore' | 'commissionableAfter'>): number {
  if (c.commissionableBefore === null || c.commissionableAfter === null) return 0
  return Math.round((c.commissionableAfter - c.commissionableBefore) * 100) / 100
}

/** The answer a change's drop or upsell got, as the trail reads it. */
export interface AdjustmentAnswer {
  id: string
  status: 'pending' | 'confirmed' | 'dismissed'
  periodMonth: string
  amount: number
}

/**
 * What a change meant for commission, in words: nothing given yet — its own
 * month counts the bill as it is now; given — the drop or upsell it opened and
 * where that stands; given, and back to what was given — nothing to pay.
 */
export function commissionNote(c: Pick<ErpChange, 'kind' | 'settledAmount' | 'settledBy' | 'settledPeriod' | 'periodMonth' | 'adjustmentId'>,
  answer: AdjustmentAnswer | null | undefined): string {
  if (c.kind === 'opened') return c.periodMonth ? `Counts in ${formatMonth(c.periodMonth)}` : '—'
  if (c.settledAmount === null) {
    return c.periodMonth ? `Not given yet — ${formatMonth(c.periodMonth)} counts it as it is now` : 'Not given yet'
  }
  const given = `Given (${settledWord(c.settledBy, c.settledPeriod)})`
  if (c.kind === 'changed') return `${given} — earns the same`
  if (!answer) return `${given} — nothing to pay now`
  if (answer.status === 'pending') return `${given} — ${formatMoney(answer.amount)} waiting for an answer`
  if (answer.status === 'confirmed') return `${given} — ${formatMoney(answer.amount)} paid in ${formatMonth(answer.periodMonth)}`
  return `${given} — let stand (Not a change)`
}

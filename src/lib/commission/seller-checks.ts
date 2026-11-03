/**
 * Whose sale? (2026-10-31 — the user, on SHAWN keying the orders of salespeople who had left as new orders of his own:
 * "要能够分开哪些是真正他自己开的单，哪些是他只是帮人家处理的单，要不然会变成 double claim 的问题"; and on the word share: a Share
 * order request — two salespeople, half each — is a normal sale, while the ERP's *Shared with* is somebody else's order
 * looked after, never a part of its sale.)
 *
 * The rule is the database's (mig 20261031030000): a bill the ERP feed OPENS whose paper number is already on another
 * salesperson's order — a bill of the portal's (the ERP's, or a claim form's row) or an older order of the ERP's own the
 * portal never had — is held out of the month (as *Don't count this bill*) until HR answers on Comm Cal › the month ›
 * Whose sale: their own sale counts it, not theirs keeps it out in HR's name. This file reads what
 * `revenue_seller_checks` and `revenue_answer_seller_check` answer.
 */

export type SellerCheckStatus = 'waiting' | 'theirs' | 'not_theirs'
/**
 * What was asked: `paper` — a bill the feed opened on a paper another salesperson's order carries (held until HR
 * answers); `erp_moved` (2026-10-31, mig 20261031040000) — a bill the ERP gave to another salesperson after the portal had
 * it (stopped: it stays with whom it was until HR answers — the user: "我要先拦住 然后hr take action 才continue"). For a
 * move, `theirs` = it goes to the salesperson the ERP gave it to, `not_theirs` = it stays whose it was.
 */
export type SellerCheckKind = 'paper' | 'erp_moved'
/** A move's two salespeople and when the portal saw it. */
export interface SellerMove {
  from: { staffId: string | null; name: string }
  to: { staffId: string | null; name: string }
  movedAt: string | null
}
/** Where the other order was found: a bill the ERP fed, a claim form's row, an order of the ERP's the portal never had. */
export type SellerEvidenceSource = 'bill' | 'claim_form' | 'erp'

export interface SellerEvidenceOrder {
  source: SellerEvidenceSource
  docNo: string
  /** The paper numbers it shares with the bill. */
  papers: string[]
  soldOn: string | null
  /** A portal bill's month, `YYYY-MM-01`; null for an order of the ERP's own. */
  month: string | null
  seller: string
  /** Its salesperson has left. */
  sellerLeft: boolean
  /**
   * The ERP's Shared with on it names the bill's salesperson: they look after that order. Never a part of its sale —
   * a share of a sale is a Share order request (Comm Cal › Requests).
   */
  handledBySeller: boolean
  total: number
  cancelled: boolean
}

export interface SellerCheck {
  orderId: string
  orderNo: string
  /** The bill's Ref No. as the ERP has it. */
  refNo: string | null
  orderDate: string
  periodMonth: string
  customer: string | null
  total: number
  staffId: string | null
  staffName: string
  kind: SellerCheckKind
  /** A move's salespeople (kind `erp_moved`); null for a paper question. */
  move: SellerMove | null
  status: SellerCheckStatus
  /** Whose order the paper was found on first. */
  sellerName: string | null
  /** What was found when the question was asked, the earliest first. */
  orders: SellerEvidenceOrder[]
  /** The fair's booth that listed others and not this salesperson — said beside the orders, never a reason alone. */
  booth: { fair: string; staff: string[] } | null
  askedAt: string
  decidedByName: string | null
  decidedAt: string | null
  note: string | null
  /** Whether the bill counts now. */
  counts: boolean
  /** Out by hand — by the check, or by HR. */
  held: boolean
}

/** What answering did. */
export interface SellerAnswer {
  orderNo: string
  status: Exclude<SellerCheckStatus, 'waiting'>
  counts: boolean
}

type Raw = Record<string, unknown>
const isObj = (v: unknown): v is Raw => !!v && typeof v === 'object' && !Array.isArray(v)
const str = (v: unknown): string | null => (typeof v === 'string' ? v : null)
const num = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN
  return Number.isFinite(n) ? n : null
}
const STATUSES: readonly SellerCheckStatus[] = ['waiting', 'theirs', 'not_theirs']
const SOURCES: readonly SellerEvidenceSource[] = ['bill', 'claim_form', 'erp']

function evidenceOrder(v: unknown): SellerEvidenceOrder | null {
  if (!isObj(v)) return null
  const source = str(v.source) as SellerEvidenceSource | null, docNo = str(v.docNo)
  if (!source || !SOURCES.includes(source) || !docNo) return null
  return {
    source, docNo,
    papers: (Array.isArray(v.papers) ? v.papers : []).filter((p): p is string => typeof p === 'string'),
    soldOn: str(v.soldOn), month: str(v.month), seller: str(v.seller) ?? '',
    sellerLeft: v.sellerLeft === true, handledBySeller: v.handledBySeller === true,
    total: num(v.total) ?? 0, cancelled: v.cancelled === true,
  }
}

/** One question as `revenue_seller_checks` writes it; null when it is not one. */
export function sellerCheckFromRow(v: unknown): SellerCheck | null {
  if (!isObj(v)) return null
  const orderId = str(v.orderId), orderNo = str(v.orderNo), status = str(v.status) as SellerCheckStatus | null
  if (!orderId || !orderNo || !status || !STATUSES.includes(status)) return null
  const evidence = isObj(v.evidence) ? v.evidence : {}
  const kind: SellerCheckKind = v.kind === 'erp_moved' ? 'erp_moved' : 'paper'
  const person = (p: unknown) => (isObj(p) ? { staffId: str(p.staffId), name: str(p.name) ?? '—' } : { staffId: null, name: '—' })
  const move = kind === 'erp_moved' ? { from: person(evidence.from), to: person(evidence.to), movedAt: str(evidence.movedAt) } : null
  const booth = isObj(evidence.booth) && str(evidence.booth.fair)
    ? {
        fair: str(evidence.booth.fair) ?? '',
        staff: (Array.isArray(evidence.booth.staff) ? evidence.booth.staff : []).filter((s): s is string => typeof s === 'string'),
      }
    : null
  return {
    orderId, orderNo, refNo: str(v.refNo), orderDate: str(v.orderDate) ?? '', periodMonth: str(v.periodMonth) ?? '',
    customer: str(v.customer), total: num(v.total) ?? 0, staffId: str(v.staffId), staffName: str(v.staffName) ?? '—',
    kind, move, status, sellerName: str(v.sellerName),
    orders: (Array.isArray(evidence.orders) ? evidence.orders : []).map(evidenceOrder).filter((o): o is SellerEvidenceOrder => !!o),
    booth, askedAt: str(v.askedAt) ?? '', decidedByName: str(v.decidedByName), decidedAt: str(v.decidedAt), note: str(v.note),
    counts: v.counts !== false, held: v.held === true,
  }
}

export function sellerChecksFromRow(v: unknown): SellerCheck[] {
  return (Array.isArray(v) ? v : []).map(sellerCheckFromRow).filter((c): c is SellerCheck => !!c)
}

/** `revenue_answer_seller_check`'s answer; null when it is not one. */
export function sellerAnswerFromRow(v: unknown): SellerAnswer | null {
  if (!isObj(v)) return null
  const orderNo = str(v.orderNo), status = str(v.status)
  return orderNo && (status === 'theirs' || status === 'not_theirs') ? { orderNo, status, counts: v.counts === true } : null
}

/** What waits on HR: a question not answered yet. */
export const isWaiting = (c: Pick<SellerCheck, 'status'>): boolean => c.status === 'waiting'

const SOURCE_LABEL: Record<SellerEvidenceSource, string> = { bill: 'ERP bill', claim_form: 'Claim form', erp: 'ERP order' }
export const sourceLabel = (s: SellerEvidenceSource): string => SOURCE_LABEL[s]

/** Every paper the bill shares with the orders found, in their order, once each. */
export function sharedPapers(c: Pick<SellerCheck, 'orders'>): string[] {
  return [...new Set(c.orders.flatMap(o => o.papers))]
}

/** The question as it stands after an answer, until the page is read again. */
export function answered(c: SellerCheck, a: SellerAnswer): SellerCheck {
  if (c.kind === 'erp_moved' && c.move) {
    // A move takes no bill out: it counts either way, under whoever keeps it.
    const holder = a.status === 'not_theirs' ? c.move.from : c.move.to
    return { ...c, status: a.status, counts: a.counts, staffId: holder.staffId, staffName: holder.name }
  }
  return { ...c, status: a.status, counts: a.counts, held: !a.counts }
}

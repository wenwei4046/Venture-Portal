// Fund OUT's and Fund IN's hubs (2026-10-15, the Finance revamp v2 — D12 of
// `.design/fin-r2/handoff`, the prototype's `bankFund`): a deal — a loan out,
// or a fund source in — as the hub lists it, and the figures of its cards.
// The design's cards are its sample transfer types; the user's call
// (2026-10-14): the design's style, the system's own categories — Fund OUT by
// the loans' status (All, Active, Overdue, Pending approval, Repaid,
// Cancelled), Fund IN by the source's type (Subsidiary, Director saving,
// Director loan, Dept pool, Outsource) and Pending approval. Pure, so the
// figures are tested without a database.

export type FundSide = 'out' | 'in'

export type FundStatus = 'pending_approval' | 'active' | 'matured' | 'repaid' | 'cancelled'

export interface FundRecord {
  id: string
  side: FundSide
  /** Who: the borrower (out) or the source (in) — "Carres (CAR)", a director, a department. */
  party: string
  /** Fund IN's source type (subsidiary, director_loan, …); `loan` on Fund OUT. */
  type: string
  typeLabel: string
  /** The principal lent, or the amount taken in. */
  amount: number
  /** What is still owed on it — an active (or matured) deal only. */
  outstanding: number | null
  /** The monthly rate, a decimal (a loan's effective rate, a source's cost). */
  rate: number
  status: FundStatus
  /** An active loan with an instalment past its day unpaid (OVERDUE IS READ LIVE, 2026-10-12). */
  overdue: { amount: number; since: string; days: number } | null
  /** When the money moved: a loan's disbursement, a source's effective date (YYYY-MM-DD). */
  date: string | null
  createdAt: string
  createdBy: string | null
  approvedAt: string | null
  approvedBy: string | null
  /** Its maturity, when it has one (YYYY-MM-DD). */
  maturity: string | null
  /** Months of the plan; null = no fixed term. */
  months: number | null
  compound: boolean
  minPayInterest: boolean
  /** Fund OUT: the funding-source remark (SC …). */
  fundingSource: string | null
  /** Fund IN: its notes; Fund OUT: its repayment terms. */
  notes: string | null
  /** Fund IN: the bank it came into. */
  bank: { name: string; number: string } | null
  /** Fund IN: the GL account it is booked to. */
  account: { code: string; name: string } | null
  /** A pending deal's approval request, when this reader may see it. */
  approvalId: string | null
  /** A loan's repayments so far (principal), when there are any. */
  repaid: number
}

export type FundCardKey =
  | 'all'
  | 'active'
  | 'overdue'
  | 'pending_approval'
  | 'repaid'
  | 'cancelled'
  | 'subsidiary'
  | 'director_saving'
  | 'director_loan'
  | 'department_pool'
  | 'outsource'

/** The cards, in the user's order. */
export const OUT_CARDS: ReadonlyArray<FundCardKey> = ['all', 'active', 'overdue', 'pending_approval', 'repaid', 'cancelled']
export const IN_CARDS: ReadonlyArray<FundCardKey> = ['all', 'subsidiary', 'director_saving', 'director_loan', 'department_pool', 'outsource', 'pending_approval']

export const SOURCE_TYPE_LABELS: Record<string, string> = {
  subsidiary: 'Subsidiary',
  director_saving: 'Director saving',
  director_loan: 'Director loan',
  department_pool: 'Dept pool',
  outsource: 'Outsource',
}

/** The card's own name (the design's *All fund out* / *All fund in*). */
export function cardLabel(side: FundSide, key: FundCardKey): string {
  if (key === 'all') return side === 'out' ? 'All fund out' : 'All fund in'
  if (key === 'pending_approval') return 'Pending approval'
  if (key === 'active') return 'Active'
  if (key === 'overdue') return 'Overdue'
  if (key === 'repaid') return 'Repaid'
  if (key === 'cancelled') return 'Cancelled'
  return SOURCE_TYPE_LABELS[key] ?? key
}

/** Whether a deal stands on a card's list. A type's list leaves the cancelled out (the design's `live`); All holds every one. */
export function onFundCard(r: FundRecord, key: FundCardKey): boolean {
  switch (key) {
    case 'all':
      return true
    case 'active':
      return r.status === 'active'
    case 'overdue':
      return r.status === 'active' && r.overdue !== null
    case 'pending_approval':
      return r.status === 'pending_approval'
    case 'repaid':
      return r.status === 'repaid'
    case 'cancelled':
      return r.status === 'cancelled'
    default:
      return r.type === key && r.status !== 'cancelled'
  }
}

/** What a row adds to its list's sum: a cancelled deal moved no money. */
export const fundAmountOf = (r: FundRecord) => (r.status === 'cancelled' ? 0 : r.amount)

const r2 = (n: number) => Math.round(n * 100) / 100

export interface FundCardFigure {
  count: number
  amount: number
  /** What the card says beside its count, when the system has more to say: *RM … owed*, *RM … due*, *N pending*. */
  extra: number
  pending: number
}

/** A card's figures — exactly what its list counts and sums (a cancelled deal counted, summed at nothing). */
export function fundCard(records: ReadonlyArray<FundRecord>, key: FundCardKey): FundCardFigure {
  const rows = records.filter((r) => onFundCard(r, key))
  return {
    count: rows.length,
    amount: r2(rows.reduce((s, r) => s + fundAmountOf(r), 0)),
    extra: r2(
      key === 'overdue'
        ? rows.reduce((s, r) => s + (r.overdue?.amount ?? 0), 0)
        : key === 'active'
          ? rows.reduce((s, r) => s + (r.outstanding ?? 0), 0)
          : 0,
    ),
    pending: rows.filter((r) => r.status === 'pending_approval').length,
  }
}

/** The hero: what moved in the office's month (the design's *Fund out · October 2026*) — deals that went through, by the day the money moved. */
export function movedInMonth(records: ReadonlyArray<FundRecord>, month: string): number {
  return r2(records.filter((r) => r.status !== 'pending_approval' && r.status !== 'cancelled' && (r.date ?? '').slice(0, 7) === month).reduce((s, r) => s + r.amount, 0))
}

/** "0.850%" — a monthly rate as the portal writes it. */
export const ratePct = (rate: number) => `${(rate * 100).toFixed(3)}%`

/** The row's Description: how it is lent or taken — its rate, its term, a loan's funding source. */
export function fundLine(r: FundRecord): string {
  const term = r.months == null ? 'no fixed term' : `${r.months} ${r.months === 1 ? 'month' : 'months'}`
  const parts = [r.side === 'in' ? r.typeLabel : null, `${ratePct(r.rate)} /mo`, term, r.fundingSource ? `SC ${r.fundingSource}` : null]
  return parts.filter(Boolean).join(' · ')
}

export type FundTone = 'def' | 'wait' | 'ledger' | 'danger' | 'info' | 'alert'

/** The status in the list's words and tone: pending blue, active green, overdue red, matured gold, repaid and cancelled quiet. */
export function fundStatus(r: Pick<FundRecord, 'status' | 'overdue'>): { text: string; tone: FundTone } {
  if (r.status === 'active') return r.overdue ? { text: 'overdue', tone: 'danger' } : { text: 'active', tone: 'ledger' }
  if (r.status === 'pending_approval') return { text: 'pending approval', tone: 'wait' }
  if (r.status === 'matured') return { text: 'matured', tone: 'alert' }
  if (r.status === 'repaid') return { text: 'repaid', tone: 'info' }
  return { text: 'cancelled', tone: 'def' }
}

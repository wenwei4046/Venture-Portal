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
  approval: { id: string; submittedBy: string | null } | null
  /** Whether this reader may decide that request (its domain's Approve, and not their own unless they are the Principal) — the page's. */
  decidable: boolean
  /** A cancellation filed and waiting for the Principal (where this reader may see it). */
  cancelPending: boolean
  /** The principal repaid so far. */
  repaid: number
  /** Fund IN: when it was marked repaid, and by whom. */
  repaidAt: string | null
  repaidBy: string | null
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
export const fundAmountOf = (r: Pick<FundRecord, 'status' | 'amount'>) => (r.status === 'cancelled' ? 0 : r.amount)

/** What a row adds to a card's sum: the Cancelled card sums what was cancelled; every other card what went through (the design's `live`). */
export const cardAmountOf = (key: FundCardKey) => (r: Pick<FundRecord, 'status' | 'amount'>) => (key === 'cancelled' ? r.amount : fundAmountOf(r))

const r2 = (n: number) => Math.round(n * 100) / 100

export interface FundCardFigure {
  count: number
  amount: number
  /** Of them, how many wait for approval — All's *· N pending*. */
  pending: number
}

/** A card's figures — exactly what its list counts and sums (on All a cancelled deal is counted, summed at nothing). */
export function fundCard(records: ReadonlyArray<FundRecord>, key: FundCardKey): FundCardFigure {
  const rows = records.filter((r) => onFundCard(r, key))
  const amountOf = cardAmountOf(key)
  return {
    count: rows.length,
    amount: r2(rows.reduce((s, r) => s + amountOf(r), 0)),
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

/** "Carres (CAR)" — a party with its code, once: a company called by its code ("2990") is just "2990". */
export const withCode = (name: string, code: string | null | undefined) => (code && code.trim().toLowerCase() !== name.trim().toLowerCase() ? `${name} (${code})` : name)

/** What the search box looks through: who, how, the notes, the status. */
export const fundHaystack = (r: FundRecord) => [r.party, r.typeLabel, fundLine(r), r.notes ?? '', fundStatus(r).text].join(' ').toLowerCase()

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const dayText = (iso: string) => `${String(Number(iso.slice(8, 10))).padStart(2, '0')} ${MON[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`
const rmText = (n: number) => `RM ${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

/** The drawer hero's sentence — the design's words where the system does the same thing. */
export function fundNote(r: Pick<FundRecord, 'side' | 'status' | 'overdue' | 'cancelPending'>): string {
  const out = r.side === 'out'
  if (r.status === 'pending_approval') return out ? 'Waiting for Principal approval before the money leaves.' : 'Waiting for Principal approval before it is booked.'
  if (r.status === 'cancelled') return 'Cancelled.'
  if (r.status === 'repaid') return 'Repaid in full.'
  if (r.cancelPending) return 'Cancellation requested — waiting for Principal approval.'
  if (r.status === 'matured') return 'Matured — still owed until it is repaid.'
  if (r.overdue) return `Overdue — ${rmText(r.overdue.amount)} past its day since ${dayText(r.overdue.since)}.`
  return out ? 'Disbursed — bank and loan ledger are updated.' : 'Received — bank and ledger are updated.'
}

export interface FundStep {
  label: string
  by: string | null
  /** When it happened (a timestamp), or only the day the money moved. */
  at: string | null
  on: string | null
  state: 'done' | 'todo' | 'bad'
}

/** The trail: Created → Disbursed / Received (its approval) → Repaid or Cancelled where it went there. */
export function fundTrail(r: FundRecord): FundStep[] {
  const moved = r.side === 'out' ? 'Disbursed' : 'Received'
  const steps: FundStep[] = [{ label: 'Created', by: r.createdBy, at: r.createdAt, on: null, state: 'done' }]
  const wentThrough = !!r.approvedAt || r.status === 'active' || r.status === 'matured' || r.status === 'repaid'
  if (wentThrough) steps.push({ label: moved, by: r.approvedBy, at: r.approvedAt, on: r.approvedAt ? null : r.date, state: 'done' })
  else if (r.status !== 'cancelled') steps.push({ label: moved, by: null, at: null, on: null, state: 'todo' })
  if (r.status === 'repaid') steps.push({ label: 'Repaid', by: r.repaidBy, at: r.repaidAt, on: null, state: 'done' })
  if (r.status === 'cancelled') steps.push({ label: 'Cancelled', by: null, at: null, on: null, state: 'bad' })
  return steps
}

export type FundTone = 'def' | 'wait' | 'ledger' | 'danger' | 'info' | 'alert'

const daysBetween = (from: string, to: string) => Math.round((Date.UTC(+to.slice(0, 4), +to.slice(5, 7) - 1, +to.slice(8, 10)) - Date.UTC(+from.slice(0, 4), +from.slice(5, 7) - 1, +from.slice(8, 10))) / 86_400_000)

/**
 * The status in the list's words and tone: pending blue, active green, overdue red, matured gold, repaid and
 * cancelled quiet. Given today, an active fund source says what its maturity is about to do, as Fund IN's
 * list always has: *matures in 12d* within 30 days, *past maturity* after it.
 */
export function fundStatus(r: Pick<FundRecord, 'status' | 'overdue'> & Partial<Pick<FundRecord, 'side' | 'maturity'>>, today?: string): { text: string; tone: FundTone } {
  if (r.status === 'active' && r.side === 'in' && r.maturity && today) {
    const days = daysBetween(today, r.maturity)
    if (days < 0) return { text: 'past maturity', tone: 'alert' }
    if (days <= 30) return { text: `matures in ${days}d`, tone: 'wait' }
  }
  if (r.status === 'active') return r.overdue ? { text: 'overdue', tone: 'danger' } : { text: 'active', tone: 'ledger' }
  if (r.status === 'pending_approval') return { text: 'pending approval', tone: 'wait' }
  if (r.status === 'matured') return { text: 'matured', tone: 'alert' }
  if (r.status === 'repaid') return { text: 'repaid', tone: 'info' }
  return { text: 'cancelled', tone: 'def' }
}

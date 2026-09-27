import { round2 } from './engine'
import { toRunPayload, type ReleasedOrderDto, type StatementDto } from './run-payload'
import type { DeferredOrder, EngineInput, PenalisedOrder } from './types'
import type { CommissionOrderStatus, CommissionWorkbench, WorkbenchPerson } from './workbench'

/**
 * Closing a salesperson's month (2026-09-27, user: 我 15 号按 complete close 时，
 * 他们全部人的 commission 就会被 lock 住).
 *
 * HR works the month person by person — or ticks a few, or all of them — and
 * closes each one when their bills are right. A close LOCKS that person's
 * commission for the month at the figure on screen: whatever moves afterwards
 * (an ERP re-save, a cost typed on the Product List, a downline's late bill)
 * moves the live calculation, never the closed figure. The page then says the
 * two differ, and reopening is how the new figure is taken.
 *
 * The lock keeps what a payroll run would need from that person — the engine
 * statement in `save_commission_run`'s own shape, the bills it releases, holds
 * and cuts — so the payroll step (the user's next piece) can be built from the
 * closes rather than from a fresh calculation. It also keeps the table row as
 * it stood, which is what the page shows for a closed person, and the bill ids,
 * which is how an edit to one of their bills is refused while they are closed.
 *
 * Pure: the server action computes, the page renders, both through here.
 */

// ─── The figures a row of the salesperson table shows ──────────────────────

/** What one row of Total Sales Orders shows for a person, live or as closed. */
export interface SalespersonFigures {
  name: string
  titleLabel: string | null
  rankLabel: string | null
  productRate: number
  /** Bills — upsales and drops are not bills, so they are not counted. */
  orders: number
  /** Everything on those bills, transport and service included. */
  salesValue: number
  /** The part of those bills that earns. */
  commissionable: number
  /** Own + downline revenue (promotion measure); null without a statement. */
  groupRevenue: number | null
  /** Recorded upsales (positive). */
  upsell: number
  /** Drops (negative). */
  dropped: number
  marginPct: number | null
  marginRevenue: number | null
  marginCost: number | null
  personal: number
  overriding: number
  /** A fixed group reward, paid as a month line of its own. */
  groupIncentive: number
  total: number
}

const sum = <T,>(rows: readonly T[], get: (row: T) => number) => round2(rows.reduce((a, r) => a + get(r), 0))

/**
 * The row of the salesperson table, from the live board. The same arithmetic
 * the table always did, moved here so a close stores exactly what was shown.
 */
export function salespersonFigures(person: WorkbenchPerson): SalespersonFigures {
  const counted = person.personalRows.filter(r => r.status !== 'excluded')
  const bills = counted.filter(r => !r.upsale)
  return {
    name: person.name,
    titleLabel: person.titleLabel,
    rankLabel: person.rankLabel,
    productRate: person.productRate,
    orders: bills.length,
    salesValue: sum(bills, r => r.orderTotal),
    commissionable: sum(bills, r => r.commissionableValue),
    groupRevenue: person.statement ? person.statement.groupRevenue : null,
    upsell: sum(counted.filter(r => r.upsale && r.orderTotal > 0), r => r.orderTotal),
    dropped: sum(counted.filter(r => r.upsale && r.orderTotal < 0), r => r.orderTotal),
    marginPct: person.statement?.marginPct ?? null,
    marginRevenue: person.statement ? person.statement.marginRevenue : null,
    marginCost: person.statement ? person.statement.marginCost : null,
    personal: person.personalTotal,
    overriding: person.overrideTotal,
    groupIncentive: person.monthlyGroupIncentive,
    total: person.totalCommission,
  }
}

// ─── What a close keeps ─────────────────────────────────────────────────────

/** One of their bills as it was paid at close — how a later change is found. */
export interface ClosedBill {
  /** The sales order (or, for an upsale or drop, the comm_upsales row). */
  id: string
  no: string
  status: CommissionOrderStatus
  total: number
}

/** An override line as it stood at close: who it came from, and how much. */
export interface ClosedOverride {
  staffId: string
  name: string
  amount: number
}

/** The row as it stood, and the evidence behind it. Stored as JSON: versioned. */
export interface CloseSummary extends SalespersonFigures {
  version: 1
  bills: ClosedBill[]
  overrides: ClosedOverride[]
}

/** Everything one close writes — `comm_close_salespeople`'s element shape. */
export interface CloseSnapshot {
  staff_id: string
  total_commission: number
  personal_commission: number
  override_commission: number
  group_incentive: number
  summary: CloseSummary
  /** `save_commission_run`'s statement, or null for a person the run would skip. */
  statement: StatementDto | null
  released_orders: ReleasedOrderDto[]
  deferred_orders: DeferredOrder[]
  penalised_orders: PenalisedOrder[]
  /** Their own bills (shared parts included) — edits to these are refused while closed. */
  order_ids: string[]
}

export function closeSummary(person: WorkbenchPerson, nameOf: (staffId: string) => string): CloseSummary {
  const overrides = new Map<string, number>()
  for (const row of person.overridingRows) {
    overrides.set(row.downlineStaffId, round2((overrides.get(row.downlineStaffId) ?? 0) + row.overrideAmount))
  }
  return {
    version: 1,
    ...salespersonFigures(person),
    bills: person.personalRows.map(r => ({ id: r.orderId, no: r.orderNo, status: r.status, total: r.totalCommission })),
    overrides: [...overrides].map(([staffId, amount]) => ({ staffId, name: nameOf(staffId), amount })),
  }
}

/**
 * The closes for `staffIds`, from the month as saved. `board` must be built
 * from `input` with no draft (no exclusions, no unsaved picks): a close locks
 * what payroll would be paid, not a what-if.
 */
export function closeSnapshots(input: EngineInput, board: CommissionWorkbench, staffIds: readonly string[]): CloseSnapshot[] {
  const payload = toRunPayload(input, board.result)
  const nameOf = (staffId: string) => board.people.find(p => p.staffId === staffId)?.name ?? staffId
  return staffIds.map(staffId => {
    const person = board.people.find(p => p.staffId === staffId)
    if (!person) throw new Error(`${staffId} is not on this month's list of salespeople.`)
    const upsaleIds = new Set(input.orders.filter(o => o.upsale).map(o => o.id))
    return {
      staff_id: staffId,
      total_commission: person.totalCommission,
      personal_commission: person.personalTotal,
      override_commission: person.overrideTotal,
      group_incentive: person.monthlyGroupIncentive,
      summary: closeSummary(person, nameOf),
      statement: payload.p_statements.find(s => s.staff_id === staffId) ?? null,
      released_orders: payload.p_released_orders.filter(r => r.staff_id === staffId),
      deferred_orders: payload.p_deferred_orders.filter(d => d.staffId === staffId),
      penalised_orders: payload.p_penalised_orders.filter(p => p.staffId === staffId),
      order_ids: [...new Set(person.personalRows.filter(r => !upsaleIds.has(r.originalOrderId)).map(r => r.originalOrderId))],
    }
  })
}

// ─── What the page reads back ───────────────────────────────────────────────

/** A person's close as the page reads it. */
export interface SalespersonClose {
  staffId: string
  closedAt: string
  closedByName: string | null
  total: number
  summary: CloseSummary
}

const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN
  return Number.isFinite(n) ? n : 0
}
const numOrNull = (v: unknown): number | null => (v === null || v === undefined || v === '' ? null : num(v))
const str = (v: unknown): string | null => (typeof v === 'string' ? v : null)
const STATUSES: readonly CommissionOrderStatus[] = ['eligible', 'excluded', 'deposit_pending', 'already_released']

/**
 * The stored summary, read defensively: it is JSON written by an earlier
 * version of this file, and a close must still render if a field was added
 * since. Money the row cannot find reads as zero rather than failing the page.
 */
export function parseCloseSummary(raw: unknown, fallbackName: string): CloseSummary {
  const o = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {}
  const bills = Array.isArray(o.bills) ? o.bills : []
  const overrides = Array.isArray(o.overrides) ? o.overrides : []
  return {
    version: 1,
    name: str(o.name) ?? fallbackName,
    titleLabel: str(o.titleLabel),
    rankLabel: str(o.rankLabel),
    productRate: num(o.productRate),
    orders: num(o.orders),
    salesValue: num(o.salesValue),
    commissionable: num(o.commissionable),
    groupRevenue: numOrNull(o.groupRevenue),
    upsell: num(o.upsell),
    dropped: num(o.dropped),
    marginPct: numOrNull(o.marginPct),
    marginRevenue: numOrNull(o.marginRevenue),
    marginCost: numOrNull(o.marginCost),
    personal: num(o.personal),
    overriding: num(o.overriding),
    groupIncentive: num(o.groupIncentive),
    total: num(o.total),
    bills: bills.flatMap(b => {
      const r = b && typeof b === 'object' ? b as Record<string, unknown> : null
      const id = r ? str(r.id) : null
      if (!r || !id) return []
      const status = STATUSES.find(s => s === r.status) ?? 'eligible'
      return [{ id, no: str(r.no) ?? id, status, total: num(r.total) }]
    }),
    overrides: overrides.flatMap(v => {
      const r = v && typeof v === 'object' ? v as Record<string, unknown> : null
      const staffId = r ? str(r.staffId) : null
      if (!r || !staffId) return []
      return [{ staffId, name: str(r.name) ?? staffId, amount: num(r.amount) }]
    }),
  }
}

// ─── Has it moved since? ────────────────────────────────────────────────────

export interface BillChange {
  id: string
  no: string
  /** null: the bill was not in the close. */
  closed: number | null
  /** null: the bill is gone from the live month. */
  live: number | null
}

export interface OverrideChange {
  staffId: string
  name: string
  closed: number
  live: number
}

export interface CloseDrift {
  closedTotal: number
  liveTotal: number
  /** live − closed. */
  delta: number
  bills: BillChange[]
  overrides: OverrideChange[]
}

const moved = (a: number, b: number) => Math.abs(round2(a - b)) >= 0.01

/**
 * What the live month says now that the close did not, or null when nothing
 * has moved. `live` is null when the person has dropped off the month.
 *
 * Only bills that EARN a different amount are listed — a held bill that is
 * still held, or one whose paid part is unchanged, is not news.
 */
export function closeDrift(close: SalespersonClose, live: WorkbenchPerson | null): CloseDrift | null {
  const liveTotal = live?.totalCommission ?? 0
  const closedBills = new Map(close.summary.bills.map(b => [b.id, b]))
  const liveBills = new Map((live?.personalRows ?? []).map(r => [r.orderId, r]))
  const bills: BillChange[] = []
  for (const [id, b] of closedBills) {
    const now = liveBills.get(id)
    if (!now) {
      if (b.total !== 0) bills.push({ id, no: b.no, closed: b.total, live: null })
    } else if (moved(now.totalCommission, b.total)) {
      bills.push({ id, no: b.no, closed: b.total, live: now.totalCommission })
    }
  }
  for (const [id, r] of liveBills) {
    if (!closedBills.has(id) && r.totalCommission !== 0) bills.push({ id, no: r.orderNo, closed: null, live: r.totalCommission })
  }

  const closedOverrides = new Map(close.summary.overrides.map(o => [o.staffId, o]))
  const liveOverrides = new Map<string, { name: string; amount: number }>()
  for (const row of live?.overridingRows ?? []) {
    const seen = liveOverrides.get(row.downlineStaffId)
    liveOverrides.set(row.downlineStaffId, { name: row.downlineName, amount: round2((seen?.amount ?? 0) + row.overrideAmount) })
  }
  const overrides: OverrideChange[] = []
  for (const staffId of new Set([...closedOverrides.keys(), ...liveOverrides.keys()])) {
    const was = closedOverrides.get(staffId)
    const now = liveOverrides.get(staffId)
    if (moved(was?.amount ?? 0, now?.amount ?? 0)) {
      overrides.push({ staffId, name: now?.name ?? was?.name ?? staffId, closed: was?.amount ?? 0, live: now?.amount ?? 0 })
    }
  }

  const delta = round2(liveTotal - close.total)
  if (!moved(liveTotal, close.total) && bills.length === 0 && overrides.length === 0) return null
  return {
    closedTotal: close.total,
    liveTotal,
    delta,
    bills: bills.sort((a, b) => a.no.localeCompare(b.no)),
    overrides: overrides.sort((a, b) => a.name.localeCompare(b.name)),
  }
}

// ─── Closing several at once ────────────────────────────────────────────────

/** What a tick selection asks for: who would close, who would reopen. */
export function splitSelection<T extends { staffId: string }>(
  rows: readonly T[],
  ticked: ReadonlySet<string>,
  closed: ReadonlySet<string>,
): { toClose: T[]; toReopen: T[] } {
  const chosen = rows.filter(r => ticked.has(r.staffId))
  return {
    toClose: chosen.filter(r => !closed.has(r.staffId)),
    toReopen: chosen.filter(r => closed.has(r.staffId)),
  }
}

/**
 * Who to open after closing `currentId` — the next person still open in the
 * table's order, else the first still open before them, else nobody.
 */
export function nextOpenPerson(order: readonly string[], currentId: string, closed: ReadonlySet<string>): string | null {
  const at = order.indexOf(currentId)
  const after = order.slice(at + 1).find(id => id !== currentId && !closed.has(id))
  if (after) return after
  return order.slice(0, Math.max(0, at)).find(id => id !== currentId && !closed.has(id)) ?? null
}

/** A close refused because its figure is not the one the page showed. */
export interface MovedTotal {
  staffId: string
  name: string
  expected: number
  /** null: they are no longer on the month at all. */
  now: number | null
}

/**
 * The expected totals the client saw, checked against what the server
 * computed. A close must lock what the person on the page was looking at:
 * anything else is a figure nobody checked.
 */
export function totalsThatMoved(
  expected: ReadonlyArray<{ staffId: string; expectedTotal: number }>,
  board: Pick<CommissionWorkbench, 'people'>,
): MovedTotal[] {
  return expected.flatMap(({ staffId, expectedTotal }): MovedTotal[] => {
    const person = board.people.find(p => p.staffId === staffId)
    if (!person) return [{ staffId, name: staffId, expected: expectedTotal, now: null }]
    return moved(person.totalCommission, expectedTotal)
      ? [{ staffId, name: person.name, expected: expectedTotal, now: person.totalCommission }]
      : []
  })
}

import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchAllRows } from '@/lib/paginate'
import { indexItemGroups, normaliseCode } from '@/lib/commission/engine'
import { groupDoubleClaims, type DoubleClaimBill, type DoubleClaimGroup } from '@/lib/commission/double-claims'
import type { ClaimAdjustment, ClaimBillEvidence, ClaimContext, ClaimDelivery, ClaimLine } from '@/lib/commission/double-claim-reasons'

/**
 * Every paper number on more than one bill a run could pay or already paid,
 * as `revenue_possible_double_claims` finds them. A read that fails leaves the
 * page standing and says so, rather than taking the month down with it.
 *
 * The RPC postdates database.types.ts — untyped-client convention.
 */

interface Row {
  bill_ref: string
  order_id: string
  order_no: string
  period_month: string
  order_date: string
  staff_id: string | null
  employee_name: string | null
  agent_name: string
  order_total: number | string
  source: string
  paid_by_run: boolean
  dismissed: boolean
}

export interface DoubleClaimsRead {
  groups: DoubleClaimGroup[]
  /** Set when the check could not run; the page says so instead of "none found". */
  unavailable: string | null
}

export async function loadDoubleClaims(supabase: SupabaseClient, subDepartmentId: string): Promise<DoubleClaimsRead> {
  const { data, error } = await supabase.rpc('revenue_possible_double_claims', { p_sub_department_id: subDepartmentId })
  if (error) return { groups: [], unavailable: error.message }
  const bills: DoubleClaimBill[] = ((data ?? []) as Row[]).map(r => ({
    billRef: r.bill_ref,
    orderId: r.order_id,
    orderNo: r.order_no,
    periodMonth: r.period_month,
    orderDate: r.order_date,
    staffId: r.staff_id,
    employeeName: r.employee_name,
    agentName: r.agent_name,
    orderTotal: Number(r.order_total),
    source: r.source,
    paidByRun: r.paid_by_run,
    dismissed: r.dismissed,
  }))
  return { groups: groupDoubleClaims(bills), unavailable: null }
}

// ─── The evidence behind each group (2026-09-30) ────────────────────────────
//
// A group is flagged on one fact, a shared paper number; the page now says WHY
// it looks like one sale paid twice and what each bill has been through
// (`lib/commission/double-claim-reasons.ts`). That needs, for the bills of the
// month's groups only — a dozen or two, never the month — what the ERP said on
// each document, its lines, every delivery of it, the drops and upsells found
// on its paper, whether a run or a close has it, and when the portal began to
// pay. Read under the viewer's own session: every table here is HR's already.

type One<T> = T | T[] | null

function one<T>(v: One<T> | undefined): T | null {
  if (!v) return null
  return Array.isArray(v) ? (v[0] ?? null) : v
}

interface OrderRow {
  id: string
  customer_name: string | null
  venue: string | null
  paid_amount: number | string | null
  erp_created_at: string | null
  fair_source: string | null
  so_date: string | null
  sales_import_batches: One<{ file_name: string | null; source: string | null; created_at: string | null }>
  comm_venue_events: One<{
    venue_key: string
    start_date: string | null
    end_date: string | null
    erp_organiser_text: string | null
    comm_venues: One<{ display_name: string | null }>
    comm_organisers: One<{ name: string | null }>
  }>
}

interface LineRow {
  id: string
  order_id: string
  line_no: number | null
  item_group: string | null
  product_code: string | null
  product_name: string | null
  qty: number | string | null
  line_amount: number | string | null
}

interface EventRow {
  id: string
  doc_no: string
  status: string
  message: string | null
  period_month: string | null
  received_at: string
}

interface AdjustmentRow {
  original_ref: string | null
  erp_doc_no: string | null
  kind: 'drop' | 'upsale'
  status: 'pending' | 'confirmed' | 'dismissed'
  amount: number | string
  period_month: string
  created_at: string
}

interface ReleaseRow {
  order_no: string
  period_month: string
  released_at: string
}

interface CloseRow {
  period_month: string
  closed_at: string
  closed_by_name: string | null
  order_ids: string[]
}

export interface DoubleClaimEvidenceRead {
  evidence: Map<string, ClaimBillEvidence>
  context: ClaimContext
  /** What could not be read; the page still explains what it can. */
  unavailable: string | null
}

/** `in.(…)` values, quoted — a document number carries dashes, a paper one could carry anything. */
function inList(values: string[]): string {
  return values.map(v => `"${v.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`).join(',')
}

export async function loadDoubleClaimEvidence(
  supabase: SupabaseClient,
  subDepartmentId: string,
  schemeId: string | null,
  groups: readonly DoubleClaimGroup[],
): Promise<DoubleClaimEvidenceRead> {
  const bills = groups.flatMap(g => g.bills)
  const ids = [...new Set(bills.map(b => b.orderId))]
  const nos = [...new Set(bills.map(b => b.orderNo))]
  const erpNos = [...new Set(bills.filter(b => b.source === 'erp_sync').map(b => b.orderNo))]
  const refs = [...new Set(groups.map(g => g.billRef))]

  const cutoverRead = supabase.from('comm_cutovers').select('first_paid_month, note')
    .eq('sub_department_id', subDepartmentId).maybeSingle()
  if (ids.length === 0) {
    const { data } = await cutoverRead
    return { evidence: new Map(), context: contextOf(data), unavailable: null }
  }

  const failures: string[] = []
  const settle = async <T,>(what: string, read: PromiseLike<T[]>): Promise<T[]> => {
    try {
      return await read
    } catch (err) {
      failures.push(`${what} (${err instanceof Error ? err.message : 'no answer'})`)
      return []
    }
  }
  const rows = <T,>(what: string, query: PromiseLike<{ data: unknown; error: { message: string } | null }>) =>
    settle<T>(what, Promise.resolve(query).then(({ data, error }) => {
      if (error) throw new Error(error.message)
      return (data ?? []) as T[]
    }))

  const [orders, lines, deliveries, adjustments, releases, closes, groupRules, cutover] = await Promise.all([
    rows<OrderRow>('the bills', supabase.from('sales_orders')
      .select('id, customer_name, venue, paid_amount, erp_created_at, fair_source, so_date:raw->header->>so_date, '
        + 'sales_import_batches (file_name, source, created_at), '
        + 'comm_venue_events (venue_key, start_date, end_date, erp_organiser_text, comm_venues (display_name), comm_organisers (name))')
      .in('id', ids)),
    settle<LineRow>('their lines', fetchAllRows<LineRow>((from, to) => supabase.from('sales_order_lines')
      .select('id, order_id, line_no, item_group, product_code, product_name, qty, line_amount')
      .in('order_id', ids).order('id').range(from, to))),
    erpNos.length
      ? settle<EventRow>('the ERP’s deliveries', fetchAllRows<EventRow>((from, to) => supabase.from('erp_sync_events')
        .select('id, doc_no, status, message, period_month, received_at')
        .in('doc_no', erpNos).order('received_at').order('id').range(from, to)))
      : Promise.resolve([] as EventRow[]),
    rows<AdjustmentRow>('the drops and upsells found on them', supabase.from('comm_upsales')
      .select('original_ref, erp_doc_no, kind, status, amount, period_month, created_at')
      .eq('sub_department_id', subDepartmentId).eq('source', 'erp')
      .or(`original_ref.in.(${inList(refs)}),erp_doc_no.in.(${inList(nos)})`)
      .order('created_at')),
    rows<ReleaseRow>('what runs paid', supabase.from('comm_order_releases')
      .select('order_no, period_month, released_at, comm_runs!inner (status)')
      .eq('sub_department_id', subDepartmentId).in('order_no', nos)
      .in('comm_runs.status', ['applied', 'locked'])),
    rows<CloseRow>('salespeople’s closes', supabase.from('comm_salesperson_closes')
      .select('period_month, closed_at, closed_by_name, order_ids')
      .eq('sub_department_id', subDepartmentId).is('reopened_at', null).overlaps('order_ids', ids)),
    schemeId
      ? rows<{ item_group: string; commissionable: boolean }>('the scheme’s item groups', supabase.from('comm_item_groups')
        .select('item_group, commissionable').eq('scheme_id', schemeId))
      : Promise.resolve([] as { item_group: string; commissionable: boolean }[]),
    Promise.resolve(cutoverRead).then(({ data, error }) => {
      if (error) failures.push(`when the portal began to pay (${error.message})`)
      return data as { first_paid_month: string | null; note: string | null } | null
    }),
  ])

  // What earns is the scheme's item groups, read the way the engine reads them.
  // A sub-department with no scheme has none: then everything but a service
  // charge reads as goods, so the bills can still be compared.
  const groupIndex = indexItemGroups(groupRules.map(g => ({ group: g.item_group, commissionable: g.commissionable })))
  const earns = (itemGroup: string | null) => groupIndex.size > 0
    ? groupIndex.get(normaliseCode(itemGroup ?? '')) === true
    : normaliseCode(itemGroup ?? '') !== 'SERVICE'

  const linesOf = new Map<string, LineRow[]>()
  for (const line of lines) linesOf.set(line.order_id, [...(linesOf.get(line.order_id) ?? []), line])
  const deliveriesOf = new Map<string, ClaimDelivery[]>()
  for (const e of deliveries) {
    deliveriesOf.set(e.doc_no, [...(deliveriesOf.get(e.doc_no) ?? []),
      { at: e.received_at, status: e.status, message: e.message, month: e.period_month }])
  }
  const releaseOf = new Map<string, ReleaseRow>()
  for (const r of releases) {
    const seen = releaseOf.get(r.order_no)
    if (!seen || r.released_at > seen.released_at) releaseOf.set(r.order_no, r)
  }
  const closeOf = new Map<string, CloseRow>()
  for (const c of closes) for (const id of c.order_ids) closeOf.set(id, c)

  // A drop or upsell belongs to the document it was found on, else to the bill
  // that carries the paper as its own number (a hand-worked row), else to the
  // group's first bill.
  const adjustmentsOf = new Map<string, ClaimAdjustment[]>()
  for (const a of adjustments) {
    const group = groups.find(g => g.billRef === a.original_ref)
    const target = bills.find(b => a.erp_doc_no && b.orderNo === a.erp_doc_no)
      ?? group?.bills.find(b => b.orderNo === a.original_ref)
      ?? group?.bills[0]
    if (!target) continue
    adjustmentsOf.set(target.orderId, [...(adjustmentsOf.get(target.orderId) ?? []), {
      kind: a.kind, status: a.status, amount: Number(a.amount),
      paidIn: a.status === 'confirmed' ? a.period_month : null, foundAt: a.created_at,
    }])
  }

  const billOf = new Map(bills.map(b => [b.orderId, b]))
  const evidence = new Map<string, ClaimBillEvidence>()
  for (const o of orders) {
    const bill = billOf.get(o.id)
    if (!bill) continue
    const batch = one(o.sales_import_batches)
    const fair = one(o.comm_venue_events)
    const release = releaseOf.get(bill.orderNo)
    const close = closeOf.get(o.id)
    const own: ClaimLine[] = (linesOf.get(o.id) ?? [])
      .sort((a, b) => (a.line_no ?? 0) - (b.line_no ?? 0))
      .map(l => ({
        code: l.product_code ?? '',
        name: l.product_name ?? '',
        qty: Number(l.qty ?? 0),
        amount: Number(l.line_amount ?? 0),
        earns: earns(l.item_group),
      }))
    evidence.set(o.id, {
      orderId: o.id,
      customer: o.customer_name,
      fair: fair ? {
        place: one(fair.comm_venues)?.display_name ?? fair.venue_key,
        start: fair.start_date,
        end: fair.end_date,
        organiser: one(fair.comm_organisers)?.name ?? fair.erp_organiser_text,
      } : null,
      fairSource: o.fair_source,
      venue: o.venue,
      soDate: o.so_date,
      erpOpenedAt: o.erp_created_at,
      importFile: bill.source === 'erp_sync' ? null : batch?.file_name ?? null,
      importedAt: bill.source === 'erp_sync' ? null : batch?.created_at ?? null,
      paidAmount: o.paid_amount === null ? null : Number(o.paid_amount),
      lines: own,
      deliveries: bill.source === 'erp_sync' ? deliveriesOf.get(bill.orderNo) ?? [] : [],
      adjustments: adjustmentsOf.get(o.id) ?? [],
      paidByRun: release ? { month: release.period_month, at: release.released_at } : null,
      closed: close ? { month: close.period_month, at: close.closed_at, by: close.closed_by_name } : null,
    })
  }

  return {
    evidence,
    context: contextOf(cutover),
    unavailable: failures.length ? `Could not read ${failures.join(', ')}.` : null,
  }
}

function contextOf(cutover: { first_paid_month: string | null; note: string | null } | null): ClaimContext {
  return { firstPaidMonth: cutover?.first_paid_month ?? null, cutoverNote: cutover?.note?.trim() || null }
}

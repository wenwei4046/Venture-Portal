import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

vi.mock('server-only', () => ({}))

import { loadTally, loadTallyMonth, loadTallyOrders } from './tally'

// Comm Cal › Tally's reads (2026-11-12): each month's bills from
// revenue_tally_orders — a month at a time, paged past PostgREST's 1,000 rows —
// and who is closed in which month, which says which month pays a bill no close
// has paid yet.

type Row = Record<string, unknown>
type RpcCall = { fn: string; args: { p_sub_department_id: string; p_from: string; p_to: string }; orders: string[]; range: [number, number] | null }
type Resolve = (value: unknown) => unknown
type Reject = (error: unknown) => unknown

const BRAND_ROWS: Row[] = [
  { code: 'AKEMI', name: 'Akemi', ref_prefixes: ['HC'], hc_bill_pct: '0.14', own_scheme: false },
  { code: '2990S', name: '2990s', ref_prefixes: null, hc_bill_pct: null, own_scheme: true },
]

/** The database as the Tally asks it: the function by month, the brands, the feed window, the closes. */
function database({ bills = {}, closes = [] }: { bills?: Record<string, Row[]>; closes?: Row[] }) {
  const rpcCalls: RpcCall[] = []
  const tableCalls: Array<{ table: string; filters: string[] }> = []
  const rpc = (fn: string, args: RpcCall['args']) => {
    const call: RpcCall = { fn, args, orders: [], range: null }
    rpcCalls.push(call)
    const q = {
      order: (col: string) => (call.orders.push(col), q),
      range: (lo: number, hi: number) => ((call.range = [lo, hi]), q),
      // A function's answer as PostgREST gives it: ranged when asked, capped at 1,000 rows.
      then: (resolve: Resolve, reject?: Reject) => {
        const [lo, hi] = call.range ?? [0, 999]
        const rows = bills[args.p_from] ?? []
        return Promise.resolve({ data: rows.slice(lo, Math.min(hi + 1, lo + 1000)), error: null }).then(resolve, reject)
      },
    }
    return q
  }
  const from = (table: string) => {
    const call = { table, filters: [] as string[] }
    tableCalls.push(call)
    let range: [number, number] = [0, 999]
    const rows = table === 'comm_brands' ? BRAND_ROWS : table === 'comm_salesperson_closes' ? closes : []
    const q = {
      select: () => q,
      eq: (col: string, value: unknown) => (call.filters.push(`${col} = ${value}`), q),
      gte: (col: string, value: unknown) => (call.filters.push(`${col} >= ${value}`), q),
      is: (col: string, value: unknown) => (call.filters.push(`${col} is ${value}`), q),
      order: () => q,
      range: (lo: number, hi: number) => ((range = [lo, hi]), q),
      maybeSingle: () => Promise.resolve({ data: { min_order_date: '2026-08-01' }, error: null }),
      then: (resolve: Resolve, reject?: Reject) => Promise.resolve({ data: rows.slice(range[0], range[1] + 1), error: null }).then(resolve, reject),
    }
    return q
  }
  return { client: { rpc, from } as unknown as SupabaseClient, rpcCalls, tableCalls }
}

const bill = (over: Row = {}): Row => ({
  order_id: 'o1', order_no: 'HC-SO-2610-001', period_month: '2026-10-01', order_date: '2026-10-05', staff_id: 'anthony',
  salesperson: 'ANTHONY', customer_name: 'MR TAN', brand_code: 'AKEMI', ref_no: 'HC1001', order_total: '1000.00', paid_amount: '1000.00',
  goods: '1000.00', cancelled: false, excluded_reason: null, deposit_met: true, reached_on: '2026-10-05', has_fair: true,
  fair_date: '2026-10-04', released_month: null,
  ...over,
})

const SUB = { id: 'sub-fair', schemeId: 'scheme-fair' }
const PERIODS = ['2026-11-01', '2026-10-01', '2026-09-01', '2026-08-01', '2026-07-01', '2026-06-01', '2026-05-01']

describe('loadTallyOrders', () => {
  it('asks the function for one month and reads a bill as the Tally needs it', async () => {
    const { client, rpcCalls } = database({
      bills: { '2026-10-01': [bill({ goods: '5000.50', reached_on: null, deposit_met: false, fair_date: null, released_month: null, salesperson: null, staff_id: null })] },
    })
    const [order] = await loadTallyOrders(client, 'sub-fair', '2026-10-01')
    expect(rpcCalls).toEqual([{ fn: 'revenue_tally_orders', args: { p_sub_department_id: 'sub-fair', p_from: '2026-10-01', p_to: '2026-10-01' }, orders: [], range: null }])
    expect(order).toEqual({
      orderId: 'o1', orderNo: 'HC-SO-2610-001', refNo: 'HC1001', periodMonth: '2026-10-01', orderDate: '2026-10-05',
      staffId: null, salesperson: '—', customer: 'MR TAN', brandCode: 'AKEMI', goods: 5000.5,
      cancelled: false, excludedReason: null, depositMet: false, reachedOn: null, hasFair: true, fairDate: null, releasedMonth: null,
    })
  })

  it('keeps the 1,001st bill, reading a capped answer again in the function’s own order', async () => {
    const rows = Array.from({ length: 1001 }, (_, i) => bill({ order_id: `o${String(i).padStart(5, '0')}`, order_no: `HC-SO-2610-${String(i).padStart(4, '0')}` }))
    const { client, rpcCalls } = database({ bills: { '2026-10-01': rows } })
    const month = await loadTallyOrders(client, 'sub-fair', '2026-10-01')
    expect(month).toHaveLength(1001)
    expect(month[1000].orderId).toBe('o01000')
    const order = ['order_date', 'order_no', 'order_id']
    expect(rpcCalls.map(c => [c.orders, c.range])).toEqual([[[], null], [order, [0, 999]], [order, [1000, 1999]]])
  })

  it('keeps its own words when the read fails', async () => {
    const client = {
      rpc: () => ({ then: (resolve: Resolve) => Promise.resolve({ data: null, error: { message: 'permission denied' } }).then(resolve) }),
    } as unknown as SupabaseClient
    await expect(loadTallyOrders(client, 'sub-fair', '2026-10-01')).rejects.toThrow(/^Could not read the month's bills: permission denied$/)
  })
})

describe('loadTally', () => {
  const facts = () => database({
    bills: {
      // Settled by hand in August, keyed on 2 Sep: Houzs's September.
      '2026-08-01': [bill({ order_id: 'a1', order_no: 'HC-SO-2609-002', period_month: '2026-08-01', order_date: '2026-09-02', reached_on: '2026-08-30', staff_id: 'sally', salesperson: 'SALLY' })],
      '2026-10-01': [
        // Paid by October's close.
        bill({ order_id: 'x1', released_month: '2026-10-01' }),
        // Came in after ANTHONY's October close: November will pay it.
        bill({ order_id: 'x2', order_no: 'HC-SO-2610-150', order_date: '2026-10-28', reached_on: '2026-10-28' }),
      ],
    },
    closes: [
      { staff_id: 'anthony', period_month: '2026-10-01', total_commission: '1234.50' },
      { staff_id: 'sally', period_month: '2026-08-01', total_commission: 99 },
    ],
  })

  it('reads each committed month from three before the first one shown — once, a month at a time', async () => {
    const { client, rpcCalls, tableCalls } = facts()
    await loadTally(client, SUB, PERIODS, '2026-09-01')
    // September is the first month shown; May is more than three months before it.
    expect(rpcCalls.map(c => [c.args.p_from, c.args.p_to])).toEqual([
      ['2026-06-01', '2026-06-01'], ['2026-07-01', '2026-07-01'], ['2026-08-01', '2026-08-01'],
      ['2026-09-01', '2026-09-01'], ['2026-10-01', '2026-10-01'], ['2026-11-01', '2026-11-01'],
    ])
    expect(rpcCalls.every(c => c.args.p_sub_department_id === 'sub-fair' && c.range === null)).toBe(true)
    // The standing closes of those months, this sub-department's.
    expect(tableCalls.find(c => c.table === 'comm_salesperson_closes')!.filters)
      .toEqual(['sub_department_id = sub-fair', 'period_month >= 2026-06-01', 'reopened_at is null'])
  })

  it('pays each bill in the month a close released it — or the month still open for its salesperson', async () => {
    const { client } = facts()
    const { report, commission } = await loadTally(client, SUB, PERIODS, '2026-09-01')
    expect(report.from).toBe('2026-09-01')
    expect(report.months.map(m => m.month)).toEqual(['2026-11-01', '2026-10-01', '2026-09-01'])
    const [nov, oct, sep] = report.months
    // October: Houzs pays both of its bills; its close paid one.
    expect([oct.houzs.bills, oct.we.bills, oct.open.bills]).toEqual([2, 1, 0])
    expect(oct.theirs.map(b => b.orderId)).toEqual(['x2'])
    // November: the other waits for ANTHONY's November close.
    expect([nov.we.bills, nov.open.bills]).toEqual([1, 1])
    expect(nov.ours[0]).toMatchObject({ orderId: 'x2', saleMonth: '2026-10-01', ourMonth: '2026-11-01', ours: 'open', houzsMonth: '2026-10-01' })
    // September: Houzs pays the bill August settled by hand.
    expect(sep.theirs[0]).toMatchObject({ orderId: 'a1', ours: 'by_hand', ourMonth: '2026-08-01', houzsMonth: '2026-09-01', fairDate: '2026-10-04' })
    // What the months shown pay: August's close is before them.
    expect(commission).toEqual({ '2026-10-01': { total: 1234.5, closed: 1 } })
  })

  it('has nothing to tally with no month or no scheme', async () => {
    const nothing = { report: { from: null, months: [], apartBills: 0, noPctBills: 0 }, commission: {} }
    const { client, rpcCalls } = facts()
    expect(await loadTally(client, SUB, [], '2026-09-01')).toEqual(nothing)
    expect(await loadTally(client, { id: 'sub-fair', schemeId: null }, PERIODS, '2026-09-01')).toEqual(nothing)
    expect(rpcCalls).toEqual([])
  })
})

describe('loadTallyMonth', () => {
  it('gives one month whole, with what its closes pay — and nothing for a month the Tally does not list', async () => {
    const { client } = database({
      bills: { '2026-10-01': [bill({ order_id: 'x1', released_month: '2026-10-01' }), bill({ order_id: 'x2', order_no: 'HC-SO-2610-150', deposit_met: false, reached_on: null })] },
      closes: [{ staff_id: 'anthony', period_month: '2026-10-01', total_commission: '1234.50' }],
    })
    const view = await loadTallyMonth(client, SUB, PERIODS, '2026-09-01', '2026-10-01')
    expect(view!.month.we.map(b => b.orderId)).toEqual(['x1'])
    expect(view!.month.houzs.map(b => b.orderId)).toEqual(['x1'])
    expect(view!.month.row.held.map(b => b.orderId)).toEqual(['x2'])
    expect(view!.commission).toEqual({ total: 1234.5, closed: 1 })
    expect(await loadTallyMonth(client, SUB, PERIODS, '2026-09-01', '2027-01-01')).toBeNull()
    expect(await loadTallyMonth(client, SUB, [], '2026-09-01', '2026-10-01')).toBeNull()
  })
})

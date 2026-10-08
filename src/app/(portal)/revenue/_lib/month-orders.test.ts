import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

vi.mock('server-only', () => ({}))

import { loadMonthOrders } from './month-orders'

// 2026-10-08 — revenue_month_orders answers one row per bill, and PostgREST
// caps a function's rows at 1000 like any read, without a word. The month's
// bills (~370 in September) are read as before while they fit; a capped
// answer is read again in pages, in the function's own order.

type Call = { fn: string; args: unknown; orders: string[]; range: [number, number] | null }

/** A function's answer as PostgREST gives it: ranged when asked, capped at 1000 rows. */
function functionAnswering(rows: Array<Record<string, unknown>>) {
  const calls: Call[] = []
  const rpc = (fn: string, args: unknown) => {
    const call: Call = { fn, args, orders: [], range: null }
    calls.push(call)
    const q = {
      order: (col: string, o?: { ascending?: boolean; nullsFirst?: boolean }) => {
        call.orders.push(`${col}${o?.nullsFirst === false ? '.nullslast' : ''}`)
        return q
      },
      range: (lo: number, hi: number) => ((call.range = [lo, hi]), q),
      then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => {
        // The rows are given in the function's own order, so a page asked in
        // that order and the answer as written agree.
        const [lo, hi] = call.range ?? [0, 999]
        return Promise.resolve({ data: rows.slice(lo, Math.min(hi + 1, lo + 1000)), error: null }).then(resolve, reject)
      },
    }
    return q
  }
  return { client: { rpc } as unknown as SupabaseClient, calls }
}

const bill = (i: number) => ({
  order_id: `o${String(i).padStart(5, '0')}`,
  order_no: `HC-SO-2609-${String(i).padStart(4, '0')}`,
  order_date: '2026-09-12',
  sequence_in_day: i + 1,
  order_total: 100,
  paid_amount: 100,
  balance: 0,
  line_amount: 100,
  commissionable: 100,
  margin_revenue: 100,
  margin_cost: 60,
  margin_pct: 0.4,
  deposit_required: null,
  ref_no: null,
  paper_no: null,
})

describe('loadMonthOrders', () => {
  it('keeps the 1,001st bill, reading a capped answer again in the function’s own order', async () => {
    const { client, calls } = functionAnswering(Array.from({ length: 1001 }, (_, i) => bill(i)))
    const month = await loadMonthOrders(client, 'sub-fair', '2026-09-01')
    expect(month).toHaveLength(1001)
    expect(month[1000]).toMatchObject({ orderId: 'o01000', orderNo: 'HC-SO-2609-1000', orderTotal: 100 })
    const order = ['order_date', 'sequence_in_day.nullslast', 'order_no', 'order_id']
    expect(calls.map((c) => [c.fn, c.orders, c.range])).toEqual([
      ['revenue_month_orders', [], null],
      ['revenue_month_orders', order, [0, 999]],
      ['revenue_month_orders', order, [1000, 1999]],
    ])
    expect(calls.every((c) => JSON.stringify(c.args) === JSON.stringify({ p_sub_department_id: 'sub-fair', p_period: '2026-09-01' }))).toBe(true)
  })

  it('under the cap, asks once, exactly as before', async () => {
    const { client, calls } = functionAnswering(Array.from({ length: 370 }, (_, i) => bill(i)))
    const month = await loadMonthOrders(client, 'sub-fair', '2026-09-01')
    expect(month).toHaveLength(370)
    expect(calls).toEqual([{ fn: 'revenue_month_orders', args: { p_sub_department_id: 'sub-fair', p_period: '2026-09-01' }, orders: [], range: null }])
  })

  it('keeps its own words when the read fails', async () => {
    const client = {
      rpc: () => ({ then: (resolve: (v: unknown) => unknown) => Promise.resolve({ data: null, error: { message: 'permission denied' } }).then(resolve) }),
    } as unknown as SupabaseClient
    await expect(loadMonthOrders(client, 'sub-fair', '2026-09-01')).rejects.toThrow(/^Could not read the month's orders: permission denied$/)
  })
})

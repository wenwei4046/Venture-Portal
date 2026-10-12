import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

vi.mock('server-only', () => ({}))

import { loadCarriedCloses, loadUpsaleFacts } from './row-origins'

// 2026-10-12 — what a ledger row from another month needs: the bill an upsell
// or a drop changed, and what a carried bill's own month's close said of it.

/** A stand-in that answers each table from `rows` and records what was asked. */
function fakeDb(rows: Record<string, unknown[]>) {
  const asked: { table: string; columns: string; filters: [string, unknown][] }[] = []
  const db = {
    from(table: string) {
      const call = { table, columns: '', filters: [] as [string, unknown][] }
      asked.push(call)
      const chain = {
        select(columns: string) { call.columns = columns; return chain },
        in(column: string, values: unknown) { call.filters.push([`in:${column}`, values]); return chain },
        eq(column: string, value: unknown) { call.filters.push([`eq:${column}`, value]); return chain },
        is(column: string, value: unknown) { call.filters.push([`is:${column}`, value]); return chain },
        then(resolve: (value: { data: unknown[]; error: null }) => unknown) {
          return Promise.resolve({ data: rows[table] ?? [], error: null }).then(resolve)
        },
      }
      return chain
    },
  } as unknown as SupabaseClient
  return { db, asked }
}

describe('loadUpsaleFacts', () => {
  it('names the bill each upsell or drop changed, among the sub-department’s months as they stand', async () => {
    const { db, asked } = fakeDb({
      comm_upsales: [
        { id: 'up', kind: 'upsale', amount: '600.00', original_ref: 'HC13254', erp_doc_no: 'HC-SO-013387', original_period: '2026-08-01' },
        // Typed by hand on August's claim form: no ERP document, no bill.
        { id: 'hand', kind: null, amount: '-2088.00', original_ref: 'HC13911', erp_doc_no: null, original_period: null },
      ],
      sales_orders: [{ id: 'bill-387', order_no: 'HC-SO-013387', period_month: '2026-08-01' }],
    })
    const facts = await loadUpsaleFacts(db, 'fair', ['up', 'hand', 'up'])
    expect(facts).toEqual({
      up: { kind: 'upsale', originalRef: 'HC13254', erpDocNo: 'HC-SO-013387', originalPeriod: '2026-08-01', bill: { orderId: 'bill-387', periodMonth: '2026-08-01' } },
      // No kind recorded: its sign says it is a drop.
      hand: { kind: 'drop', originalRef: 'HC13911', erpDocNo: null, originalPeriod: null, bill: null },
    })
    const bills = asked.find(call => call.table === 'sales_orders')!
    expect(bills.filters).toEqual([
      ['in:order_no', ['HC-SO-013387']],
      ['eq:sales_import_batches.status', 'committed'],
      ['eq:sales_import_batches.sub_department_id', 'fair'],
    ])
  })

  it('asks nothing when the ledgers carry no upsell or drop', async () => {
    const { db, asked } = fakeDb({})
    expect(await loadUpsaleFacts(db, 'fair', [])).toEqual({})
    expect(asked).toEqual([])
  })
})

describe('loadCarriedCloses', () => {
  it('reads what each standing close held for its deposit and every bill it closed with', async () => {
    const { db, asked } = fakeDb({
      comm_salesperson_closes: [{
        staff_id: 'shawn', period_month: '2026-09-01', order_ids: ['a', 'b'],
        deferred_orders: [{ staffId: 'shawn', orderId: 'b', orderNo: 'HC-SO-2609-090' }, { nonsense: true }],
      }],
    })
    expect(await loadCarriedCloses(db, 'fair', ['2026-09-01', '2026-09-01'])).toEqual([
      { staffId: 'shawn', periodMonth: '2026-09-01', heldIds: ['b'], billIds: ['a', 'b'] },
    ])
    expect(asked[0].filters).toEqual([
      ['eq:sub_department_id', 'fair'],
      ['in:period_month', ['2026-09-01']],
      ['is:reopened_at', null],
    ])
  })

  it('asks nothing for a ledger that carries nothing in', async () => {
    const { db, asked } = fakeDb({})
    expect(await loadCarriedCloses(db, 'fair', [])).toEqual([])
    expect(asked).toEqual([])
  })
})

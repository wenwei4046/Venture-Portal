import { describe, it, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { resolveLiveApprovalAmounts } from '@/lib/approval-amounts'

// approval_requests.amount is a submit-time snapshot no edit path refreshes.
// The queue must show what will actually post — i.e. the target row — which is
// how HV-PV-202607-0179 came to read RM 100,000 in the list and RM 90,000 on
// the detail page (2026-07-31).

/** Minimal Supabase stub: .from(t).select(...).in('id', ids) → rows for t. */
function stubClient(tables: Record<string, Array<Record<string, unknown>>>) {
  const calls: string[] = []
  const client = {
    from(table: string) {
      calls.push(table)
      return {
        select() {
          return {
            in(_col: string, ids: string[]) {
              const rows = (tables[table] ?? []).filter((r) =>
                ids.includes(String(r.id)),
              )
              return Promise.resolve({ data: rows, error: null })
            },
          }
        },
      }
    },
  } as unknown as SupabaseClient
  return { client, calls }
}

describe('resolveLiveApprovalAmounts', () => {
  it('prefers the target row over the stale snapshot', async () => {
    const { client } = stubClient({
      payment_vouchers: [{ id: 'pv1', amount: 90000 }],
    })
    const out = await resolveLiveApprovalAmounts(client, [
      { id: 'ar1', amount: 100000, reference_id: 'pv1', reference_table: 'payment_vouchers' },
    ])
    expect(out.get('ar1')).toBe(90000)
  })

  it('reads principal for loans and amount for fund_sources', async () => {
    const { client } = stubClient({
      loans: [{ id: 'l1', principal: 55540.08 }],
      fund_sources: [{ id: 'f1', amount: 45156.32 }],
    })
    const out = await resolveLiveApprovalAmounts(client, [
      { id: 'ar1', amount: 1, reference_id: 'l1', reference_table: 'loans' },
      { id: 'ar2', amount: 2, reference_id: 'f1', reference_table: 'fund_sources' },
    ])
    expect(out.get('ar1')).toBe(55540.08)
    expect(out.get('ar2')).toBe(45156.32)
  })

  it('keeps the snapshot when the target row cannot be read', async () => {
    const { client } = stubClient({ payment_vouchers: [] })
    const out = await resolveLiveApprovalAmounts(client, [
      { id: 'ar1', amount: 777, reference_id: 'gone', reference_table: 'payment_vouchers' },
    ])
    expect(out.get('ar1')).toBe(777)
  })

  it('passes through rows with no amount-bearing target', async () => {
    const { client, calls } = stubClient({})
    const out = await resolveLiveApprovalAmounts(client, [
      { id: 'ar1', amount: null, reference_id: 'd1', reference_table: 'dept_pools' },
      { id: 'ar2', amount: 12.5, reference_id: null, reference_table: null },
    ])
    expect(out.get('ar1')).toBeNull()
    expect(out.get('ar2')).toBe(12.5)
    expect(calls).toEqual([]) // nothing to look up → no queries
  })

  it('batches one query per table, not one per row', async () => {
    const { client, calls } = stubClient({
      payment_vouchers: [
        { id: 'pv1', amount: 10 },
        { id: 'pv2', amount: 20 },
        { id: 'pv3', amount: 30 },
      ],
    })
    const out = await resolveLiveApprovalAmounts(client, [
      { id: 'a', amount: 0, reference_id: 'pv1', reference_table: 'payment_vouchers' },
      { id: 'b', amount: 0, reference_id: 'pv2', reference_table: 'payment_vouchers' },
      { id: 'c', amount: 0, reference_id: 'pv3', reference_table: 'payment_vouchers' },
    ])
    expect(calls).toEqual(['payment_vouchers'])
    expect([out.get('a'), out.get('b'), out.get('c')]).toEqual([10, 20, 30])
  })

  it('coerces numeric strings the way postgres returns them', async () => {
    const { client } = stubClient({
      payment_vouchers: [{ id: 'pv1', amount: '1351.14' }],
    })
    const out = await resolveLiveApprovalAmounts(client, [
      { id: 'ar1', amount: '1339.60', reference_id: 'pv1', reference_table: 'payment_vouchers' },
    ])
    expect(out.get('ar1')).toBe(1351.14)
  })
})

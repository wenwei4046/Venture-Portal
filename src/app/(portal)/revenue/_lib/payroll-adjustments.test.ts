import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { normaliseRevenuePayrollAdjustments, readRevenuePayrollAdjustments } from './payroll-adjustments'

const row = { staff_id: 'staff', commission_synced_amount: '13000.00', commission_adjustment_amount: '-500.00',
  commission_adjustment_reason: ' DN for dropped sales ', commission_amount: '12500.00', status: 'draft', source_run_count: 2 }
describe('Revenue monthly adjustment read', () => {
  it('keeps the saved all-Revenue base, signed adjustment and final gross without deriving from a source statement', () => {
    expect(normaliseRevenuePayrollAdjustments([row])).toEqual([{ staffId: 'staff', syncedAmount: 13000,
      adjustmentAmount: -500, reason: 'DN for dropped sales', grossCommission: 12500, status: 'draft', adjustedAt: null, sourceRunCount: 2 }])
  })
  it('retains a missing legacy base as unknown, and rejects unavailable amounts instead of displaying zero', () => {
    expect(normaliseRevenuePayrollAdjustments([{ ...row, commission_synced_amount: null }])[0].syncedAmount).toBeNull()
    expect(() => normaliseRevenuePayrollAdjustments([{ ...row, commission_amount: null }])).toThrow('Incomplete')
  })
  it('calls only the permission-scoped read with this sub-department, month and optional employee', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [row], error: null })
    const client = { rpc } as unknown as SupabaseClient
    expect(await readRevenuePayrollAdjustments(client, 'sub', '2026-09-01', 'staff')).toMatchObject({ unavailable: false, rows: [{ staffId: 'staff' }] })
    expect(rpc).toHaveBeenCalledExactlyOnceWith('revenue_payroll_adjustments', { p_sub_department_id: 'sub', p_period: '2026-09-01', p_staff_id: 'staff' })
  })
  it('exposes a failed read separately from no adjustments without any privileged fallback', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: 'not permitted' } })
    expect(await readRevenuePayrollAdjustments({ rpc } as unknown as SupabaseClient, 'sub', '2026-09-01')).toEqual({ rows: [], unavailable: true })
  })
})

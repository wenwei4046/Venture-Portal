import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), requirePermission: vi.fn(), revalidatePath: vi.fn() }))
vi.mock('@/lib/auth', () => ({ requirePermission: mocks.requirePermission }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ rpc: mocks.rpc }) }))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))
import { generateStatutorySelection } from './actions'

const row = '30000000-0000-0000-0000-000000000001'
const department = '10000000-0000-0000-0000-000000000001'
describe('generateStatutorySelection', () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.rpc.mockResolvedValue({ data: { count: 2, people: 1, total: 15 }, error: null }) })
  it('forwards both schemes in one transaction with the exact reviewed amount and count', async () => {
    await generateStatutorySelection('2026-08-01', ['SOCSO', 'EIS'], 'staff', 'employee', department, [row], '2026-09-15', { total: 15, voucherCount: 2 })
    expect(mocks.requirePermission).toHaveBeenCalledWith('hr_costing')
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith('create_payroll_statutory_selection', {
      p_period: '2026-08-01', p_schemes: ['SOCSO', 'EIS'], p_scope: 'staff', p_granularity: 'employee',
      p_department_id: department, p_payroll_row_ids: [row], p_payment_date: '2026-09-15', p_expected_total: 15, p_expected_count: 2,
    })
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/approvals')
  })
  it('supports department remainder and a date left blank', async () => {
    await generateStatutorySelection('2026-08-01', ['KWSP'], 'directors', 'department', null, null)
    expect(mocks.rpc.mock.calls[0][1]).toMatchObject({ p_scope: 'directors', p_payroll_row_ids: null, p_payment_date: null })
  })
  it('rejects empty manual or duplicate selections before calling the database', async () => {
    await expect(generateStatutorySelection('2026-08-01', ['SOCSO'], 'staff', 'employee', department, null)).rejects.toThrow('at least one')
    await expect(generateStatutorySelection('2026-08-01', ['SOCSO'], 'staff', 'employee', department, [row, row])).rejects.toThrow('once')
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
  it('propagates stale-preview failure without revalidating as success', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'The contribution amounts or voucher coverage changed' } })
    await expect(generateStatutorySelection('2026-08-01', ['SOCSO'], 'staff', 'employee', department, [row])).rejects.toThrow('coverage changed')
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })
})

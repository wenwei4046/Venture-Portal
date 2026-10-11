import { beforeEach, describe, expect, it, vi } from 'vitest'
// HR: Bank accounts ticked (2026-10-09, PR4) — a salary PV carries the account numbers.
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), requirePermission: vi.fn().mockResolvedValue({ id: 'hr', sensitive: ['bank', 'nric', 'salary'] }), revalidatePath: vi.fn() }))
vi.mock('@/lib/auth', () => ({ requirePage: async () => undefined, requirePermission: mocks.requirePermission, requireActionOn: mocks.requirePermission, requireAnyActionOn: mocks.requirePermission, requirePayrollPayoutsActionOn: mocks.requirePermission }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ rpc: mocks.rpc }) }))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))
import { createPayrollDisbursement, generateStatutorySelection } from './actions'

const row = '30000000-0000-0000-0000-000000000001'
const department = '10000000-0000-0000-0000-000000000001'
describe('generateStatutorySelection', () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.rpc.mockResolvedValue({ data: { count: 2, people: 1, total: 15 }, error: null }) })
  it('forwards both schemes in one transaction with the exact reviewed amount and count', async () => {
    await generateStatutorySelection('2026-08-01', ['SOCSO', 'EIS'], 'staff', 'employee', department, [row], '2026-09-15', { total: 15, voucherCount: 2 })
    expect(mocks.requirePermission).toHaveBeenCalledWith(expect.any(String), 'hr_costing', 'create')
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

describe('salary component generation', () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.rpc.mockResolvedValue({ data: { count: 2, people: 1, total: 8556.15 }, error: null }) })
  it('forwards independent account selections and exact reviewed snapshots', async () => {
    const selections = [
      { payroll_row_id: row, component: 'basic' as const, account: 'account_2' as const, expected_amount: 4302.7, expected_bank_name: 'CIMB', expected_bank_account_no: '987654321' },
      { payroll_row_id: row, component: 'commission' as const, account: 'account_1' as const, expected_amount: 4253.45, expected_bank_name: 'Maybank', expected_bank_account_no: '123456789' },
    ]
    await createPayrollDisbursement('2026-09-01', 'staff', '2026-09-30', 'employee', department, [row], selections)
    expect(mocks.rpc.mock.calls[0][1]).toMatchObject({ p_component_selections: selections, p_payroll_row_ids: [row] })
  })
  it('rejects duplicate component selections before the RPC and propagates a stale bank preview', async () => {
    const selection = { payroll_row_id: row, component: 'basic' as const, account: 'account_1' as const }
    await expect(createPayrollDisbursement('2026-09-01', 'staff', '2026-09-30', 'employee', department, [row], [selection, selection])).rejects.toThrow('once')
    expect(mocks.rpc).not.toHaveBeenCalled()
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'Salary amount or bank details changed after preview' } })
    await expect(createPayrollDisbursement('2026-09-01', 'staff', '2026-09-30', 'employee', department, [row], [selection])).rejects.toThrow('changed after preview')
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })
  it('refuses a salary PV to somebody whose title does not tick Bank accounts (PR4)', async () => {
    mocks.requirePermission.mockResolvedValueOnce({ id: 'custom', sensitive: ['salary'] })
    await expect(createPayrollDisbursement('2026-09-01', 'staff', '2026-09-30', 'employee', department, [row], null)).rejects.toThrow(/Bank accounts/)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
})

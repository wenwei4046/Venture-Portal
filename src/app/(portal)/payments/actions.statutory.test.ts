import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ requirePermission: vi.fn(), createClient: vi.fn(), redirect: vi.fn(), revalidatePath: vi.fn() }))
vi.mock('@/lib/auth', () => ({ requirePermission: mocks.requirePermission, requireAction: mocks.requirePermission, requireAnyAction: mocks.requirePermission, requirePayrollPayoutsAction: mocks.requirePermission }))
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }))
vi.mock('next/navigation', () => ({ redirect: mocks.redirect }))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))
import { updatePaymentVoucher } from './actions'

function database(options: { covered?: boolean; reference?: string | null; status?: string; coverageError?: boolean; race?: boolean } = {}) {
  const current = { id: 'pv', status: options.status ?? 'pending_approval', direction: 'debit', voucher_type: 'salary_payout', fund_source_id: null, loan_id: null, repayment_breakdown: null, invoice_id: null, reference_type: options.reference === undefined ? 'payroll_statutory' : options.reference }
  const writes: Array<{ table: string; operation: string; values?: unknown }> = []
  const filters: Array<{ table: string; column: string; values: unknown }> = []
  const from = vi.fn((table: string) => {
    let operation = 'select'
    const query = {
      select: vi.fn().mockReturnThis(), limit: vi.fn().mockReturnThis(),
      eq: vi.fn((column: string, values: unknown) => { filters.push({ table, column, values }); return query }),
      in: vi.fn((column: string, values: unknown) => { filters.push({ table, column, values }); return query }),
      single: vi.fn().mockResolvedValue({ data: current, error: null }),
      update: vi.fn((values: unknown) => { operation = 'update'; writes.push({ table, operation, values }); return query }),
      insert: vi.fn((values: unknown) => { operation = 'insert'; writes.push({ table, operation, values }); return query }),
      delete: vi.fn(() => { operation = 'delete'; writes.push({ table, operation }); return query }),
      then: (resolve: (value: unknown) => unknown) => Promise.resolve(resolve(table === 'payroll_statutory_voucher_lines' || table === 'payroll_voucher_lines'
        ? { data: options.covered === false ? [] : [{ id: 'line' }], error: options.coverageError ? { message: 'database failure' } : null }
        : table === 'payment_vouchers' && operation === 'update' ? { data: options.race ? [] : [{ id: 'pv' }], error: null }
          : { data: [], count: 0, error: null })),
    }
    return query
  })
  mocks.createClient.mockResolvedValue({ from })
  return { writes, filters, from }
}

function editForm(extra: Record<string, string> = {}) {
  const form = new FormData()
  Object.entries({ id: 'pv', payment_date: '2026-09-16', notes: 'Payment date updated', ...extra }).forEach(([key, value]) => form.set(key, value))
  return form
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requirePermission.mockResolvedValue({ id: 'finance-user', role: 'finance', permissions: ['treasury'] })
  mocks.redirect.mockImplementation(() => { throw new Error('NEXT_REDIRECT') })
})

describe('recorded salary PV edits', () => {
  it('updates only date and notes without changing recipient or funding snapshots', async () => {
    const { writes, filters, from } = database({ reference: 'payroll_disbursement' })
    await expect(updatePaymentVoucher(editForm())).rejects.toThrow('NEXT_REDIRECT')
    expect(writes.filter(write => write.table === 'payment_vouchers')).toEqual([
      { table: 'payment_vouchers', operation: 'update', values: { payment_date: '2026-09-16', notes: 'Payment date updated', updated_at: expect.any(String) } },
    ])
    expect(from).toHaveBeenCalledWith('payroll_voucher_lines')
    expect(from).not.toHaveBeenCalledWith('payroll_statutory_voucher_lines')
    expect(from).not.toHaveBeenCalledWith('payment_voucher_sources')
    expect(writes.find(write => write.table === 'access_log')?.values).toMatchObject({ metadata: { salary_details_preserved: true } })
    expect(filters).toContainEqual({ table: 'payment_vouchers', column: 'status', values: ['pending_approval', 'draft'] })
  })

  it.each(['amount', 'payee_name', 'payee_company_id', 'bank_account_id', 'salary_component', 'recipient_account', 'bank_name', 'bank_account_no', 'source_rows[0][pool]', 'source_rows[0][amount]', 'source_rows[0][account_code]', 'payment_method', 'description', 'reference_type', 'reference_id'])('rejects a crafted %s change before writing', async field => {
    const { writes } = database({ reference: 'payroll_disbursement' })
    await expect(updatePaymentVoucher(editForm({ [field]: 'changed' }))).rejects.toThrow('Only its payment date and notes can be edited')
    expect(writes).toEqual([])
  })

  it('fails closed when snapshot verification fails or approval wins the race', async () => {
    let state = database({ reference: 'payroll_disbursement', coverageError: true })
    await expect(updatePaymentVoucher(editForm())).rejects.toThrow('Unable to verify the recorded salary payment details')
    expect(state.writes).toEqual([])
    state = database({ reference: 'payroll_disbursement', race: true })
    await expect(updatePaymentVoucher(editForm())).rejects.toThrow('Voucher status changed mid-edit')
    expect(state.writes).toHaveLength(1)
    expect(state.from).not.toHaveBeenCalledWith('payment_voucher_sources')
  })

  it('rejects an invalid date while preserving a legacy salary voucher with no snapshot lines', async () => {
    const protectedState = database({ reference: 'payroll_disbursement' })
    await expect(updatePaymentVoucher(editForm({ payment_date: '2026-02-30' }))).rejects.toThrow('Choose a valid payment date')
    expect(protectedState.writes).toEqual([])
    const legacy = database({ reference: 'payroll_disbursement', covered: false })
    await expect(updatePaymentVoucher(editForm())).rejects.toThrow('Amount must be greater than 0')
    expect(legacy.from).toHaveBeenCalledWith('payroll_voucher_lines')
  })
})

describe('recorded statutory PV edits', () => {
  it('updates only date and notes without deleting or rewriting any recorded source', async () => {
    const { writes, filters, from } = database()
    await expect(updatePaymentVoucher(editForm())).rejects.toThrow('NEXT_REDIRECT')
    expect(mocks.requirePermission).toHaveBeenCalledWith('treasury', 'edit')
    expect(writes.filter((write) => write.table === 'payment_vouchers')).toEqual([{ table: 'payment_vouchers', operation: 'update', values: { payment_date: '2026-09-16', notes: 'Payment date updated', updated_at: expect.any(String) } }])
    expect(from).not.toHaveBeenCalledWith('payment_voucher_sources')
    expect(filters).toContainEqual({ table: 'payment_vouchers', column: 'status', values: ['pending_approval', 'draft'] })
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/hr-costing/payment')
  })

  it.each(['amount', 'payee_name', 'bank_account_id', 'reference_type', 'reference_id', 'source_rows_count', 'source_rows[0][amount]', 'status'])('rejects a submitted %s change before any write', async (field) => {
    const { writes } = database()
    await expect(updatePaymentVoucher(editForm({ [field]: 'changed' }))).rejects.toThrow('Only its payment date and notes can be edited')
    expect(writes).toEqual([])
  })

  it('does not continue if immutable coverage cannot be verified', async () => {
    const { writes } = database({ coverageError: true })
    await expect(updatePaymentVoucher(editForm())).rejects.toThrow('Unable to verify')
    expect(writes).toEqual([])
  })

  it.each(['', '2026-02-30', '2026-13-01'])('rejects invalid payment date %s before writing', async (payment_date) => {
    const { writes } = database()
    await expect(updatePaymentVoucher(editForm({ payment_date }))).rejects.toThrow('Choose a valid payment date')
    expect(writes).toEqual([])
  })

  it('detects approval racing the permitted edit and performs no source writes', async () => {
    const { writes } = database({ race: true })
    await expect(updatePaymentVoucher(editForm())).rejects.toThrow('Voucher status changed mid-edit')
    expect(writes).toHaveLength(1)
  })

  it('retains the existing legacy statutory edit path when no contribution snapshots exist', async () => {
    const { writes } = database({ covered: false })
    const form = editForm({ amount: '700', payee_name: 'KWSP', bank_account_id: 'bank', description: 'Legacy statutory payment', payment_method: 'bank_transfer', source_rows_count: '1', 'source_rows[0][pool]': 'dept_pool_hr', 'source_rows[0][amount]': '700', 'source_rows[0][account_code]': '4020' })
    await expect(updatePaymentVoucher(form)).rejects.toThrow('NEXT_REDIRECT')
    expect(writes.find((write) => write.table === 'payment_vouchers')?.values).toMatchObject({ amount: 700, payee_name: 'KWSP' })
    expect(writes.filter((write) => write.table === 'payment_voucher_sources').map((write) => write.operation)).toEqual(['delete', 'insert'])
  })

  it('does not inspect statutory snapshots for an unrelated voucher', async () => {
    const { from } = database({ reference: null })
    await expect(updatePaymentVoucher(editForm())).rejects.toThrow('Amount must be greater than 0')
    expect(from).not.toHaveBeenCalledWith('payroll_statutory_voucher_lines')
  })
})

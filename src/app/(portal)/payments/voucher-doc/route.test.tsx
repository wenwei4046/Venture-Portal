import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ requirePermission: vi.fn(), createClient: vi.fn(), exportPdfResponse: vi.fn() }))
vi.mock('@/lib/auth', () => ({ requirePermission: mocks.requirePermission }))
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }))
vi.mock('@/lib/export/response', () => ({ exportPdfResponse: mocks.exportPdfResponse }))
import { GET } from './route'

function voucher(id: string, referenceType: string | null) {
  return { id, voucher_no: `TEST-${id}`, voucher_type: 'payment', direction: 'debit', status: 'pending_approval', amount: 600.60, payment_date: '2026-09-15', created_at: '2026-09-11T00:00:00Z', payee_name: 'KWSP', payee_company_id: null, bank_account_id: null, description: 'Contribution test', notes: null, payment_reference: null, target_pool: null, reference_type: referenceType }
}

function mockDatabase(vouchers: ReturnType<typeof voucher>[], coverageError: object | null = null) {
  const calls: Array<{ table: string; column: string; values: unknown }> = []
  const coverage = ['Amy', 'Cara', 'Ezra'].map((name, i) => ({ id: `line-${i}`, voucher_id: 'stat', scope: 'staff', payroll_row_id: `row-${name}`, employee_name: name, employee_code: `T${i}`, department_name: 'Original Finance', period_month: '2026-08-01', scheme: 'KWSP', amount: `${(i + 1) * 100}.20` }))
  const from = vi.fn((table: string) => {
    const result = table === 'payment_vouchers' ? { data: vouchers, error: null }
      : table === 'payroll_statutory_voucher_lines' ? { data: coverageError ? null : coverage, error: coverageError }
        : { data: [], error: null }
    const query = {
      select: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(),
      eq: vi.fn((column: string, values: unknown) => { calls.push({ table, column, values }); return query }),
      in: vi.fn((column: string, values: unknown) => { calls.push({ table, column, values }); return query }),
      then: (resolve: (value: { data: unknown; error: object | null }) => unknown) => {
        const referenceFilter = calls.find((call) => call.table === table && call.column === 'reference_type')
        const filtered = table === 'payment_vouchers' && referenceFilter
          ? { ...result, data: vouchers.filter((v) => (referenceFilter.values as string[]).includes(v.reference_type ?? '')) }
          : result
        return Promise.resolve(resolve(filtered))
      },
    }
    return query
  })
  mocks.createClient.mockResolvedValue({ from })
  return { from, calls }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requirePermission.mockResolvedValue({ role: 'principal', permissions: ['treasury'] })
  mocks.exportPdfResponse.mockResolvedValue(new Response('pdf'))
})

describe('voucher PDF statutory coverage', () => {
  it('adds only immutable coverage for the requested statutory PV and preserves other voucher data', async () => {
    const { from, calls } = mockDatabase([voucher('stat', 'payroll_statutory'), voucher('salary', 'payroll_disbursement')])
    await GET(new Request('http://localhost/payments/voucher-doc?ids=stat,salary'))
    expect(mocks.requirePermission).toHaveBeenCalledWith('treasury', 'hr_costing')
    expect(calls).toContainEqual({ table: 'payroll_statutory_voucher_lines', column: 'voucher_id', values: ['stat'] })
    expect(from.mock.calls.map(([table]) => table)).not.toContain('hr_monthly_payroll')
    const docs = mocks.exportPdfResponse.mock.calls[0][0].element.props.vouchers
    expect(docs[0].statutory_coverage.map((line: { employee_name: string }) => line.employee_name)).toEqual(['Amy', 'Cara', 'Ezra'])
    expect(docs[0].statutory_coverage.map((line: { department_name: string }) => line.department_name)).toEqual(['Original Finance', 'Original Finance', 'Original Finance'])
    expect(docs[0].statutory_coverage.reduce((total: number, line: { amount: number }) => total + line.amount, 0)).toBeCloseTo(600.60)
    expect(docs[1].statutory_coverage).toEqual([])
  })

  it('refuses to print an incomplete statutory PDF if its stored coverage cannot be read', async () => {
    mockDatabase([voucher('stat', 'payroll_statutory')], { message: 'private database detail' })
    const response = await GET(new Request('http://localhost/payments/voucher-doc?id=stat'))
    expect(response.status).toBe(500)
    expect(await response.text()).not.toContain('private database detail')
    expect(mocks.exportPdfResponse).not.toHaveBeenCalled()
  })

  it('does not query the new table for unrelated vouchers', async () => {
    const { from } = mockDatabase([voucher('ordinary', null)])
    await GET(new Request('http://localhost/payments/voucher-doc?id=ordinary'))
    expect(from).not.toHaveBeenCalledWith('payroll_statutory_voucher_lines')
    expect(mocks.exportPdfResponse.mock.calls[0][0].element.props.vouchers[0].statutory_coverage).toEqual([])
  })

  it('requires the app permission gate before reading any voucher', async () => {
    mocks.requirePermission.mockRejectedValue(new Error('redirect'))
    await expect(GET(new Request('http://localhost/payments/voucher-doc?id=stat'))).rejects.toThrow('redirect')
    expect(mocks.createClient).not.toHaveBeenCalled()
  })

  it('allows HR to print payroll PVs under the existing payroll reference filter', async () => {
    mocks.requirePermission.mockResolvedValue({ role: 'hr', permissions: ['hr_costing'] })
    const { calls } = mockDatabase([voucher('stat', 'payroll_statutory')])
    const response = await GET(new Request('http://localhost/payments/voucher-doc?id=stat'))
    expect(response.status).toBe(200)
    expect(calls).toContainEqual({ table: 'payment_vouchers', column: 'reference_type', values: ['payroll_disbursement', 'payroll_statutory', 'payroll_payment_request'] })
    expect(mocks.exportPdfResponse).toHaveBeenCalledTimes(1)
  })

  it('does not expose unrelated treasury vouchers to an HR-only user', async () => {
    mocks.requirePermission.mockResolvedValue({ role: 'hr', permissions: ['hr_costing'] })
    mockDatabase([voucher('ordinary', null)])
    const response = await GET(new Request('http://localhost/payments/voucher-doc?id=ordinary'))
    expect(response.status).toBe(404)
    expect(mocks.exportPdfResponse).not.toHaveBeenCalled()
  })
})

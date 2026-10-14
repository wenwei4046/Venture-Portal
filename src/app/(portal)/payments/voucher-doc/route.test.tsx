import { beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('server-only', () => ({}))

const mocks = vi.hoisted(() => ({ requirePermission: vi.fn(), createClient: vi.fn(), exportPdfResponse: vi.fn() }))
vi.mock('@/lib/auth', () => ({ requirePage: async () => undefined, requirePermission: mocks.requirePermission, requireActionOn: mocks.requirePermission, requireAnyActionOn: mocks.requirePermission, requirePayrollPayoutsActionOn: mocks.requirePermission }))
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }))
vi.mock('@/lib/export/response', () => ({ exportPdfResponse: mocks.exportPdfResponse }))
import { GET } from './route'

function voucher(id: string, referenceType: string | null) {
  return { id, voucher_no: `TEST-${id}`, voucher_type: 'payment', direction: 'debit', status: 'pending_approval', amount: 600.60, payment_date: '2026-09-15', created_at: '2026-09-11T00:00:00Z', payee_name: 'KWSP', payee_company_id: null, bank_account_id: null, description: 'Contribution test', notes: null, payment_reference: null, target_pool: null, reference_type: referenceType }
}

function mockDatabase(vouchers: ReturnType<typeof voucher>[], coverageError: object | null = null, salaryError: object | null = null, extra: Record<string, unknown[]> = {}) {
  const calls: Array<{ table: string; column: string; values: unknown }> = []
  const coverage = ['Amy', 'Cara', 'Ezra'].map((name, i) => ({ id: `line-${i}`, voucher_id: 'stat', scope: 'staff', payroll_row_id: `row-${name}`, employee_name: name, employee_code: `T${i}`, department_name: 'Original Finance', period_month: '2026-08-01', scheme: 'KWSP', amount: `${(i + 1) * 100}.20` }))
  const salary = ['basic', 'commission'].map((component, i) => ({ id: `salary-${i}`, voucher_id: 'salary', scope: 'staff', payroll_row_id: 'salary-row', employee_name: 'Recorded Salary Employee', employee_code: 'SAL001', department_name: 'Original Revenue', period_month: '2026-09-01', salary_component: component, recipient_account: i ? 'account_2' : 'account_1', bank_name: i ? 'Recorded CIMB' : 'Recorded Maybank', bank_account_no: i ? '0098765432' : '0012345678', net: i ? '4253.45' : '4302.70' }))
  const from = vi.fn((table: string) => {
    const result = table === 'payment_vouchers' ? { data: vouchers, error: null }
      : table === 'payroll_statutory_voucher_lines' ? { data: coverageError ? null : coverage, error: coverageError }
        : table === 'payroll_voucher_lines' ? { data: salaryError ? null : salary, error: salaryError }
        : { data: extra[table] ?? [], error: null }
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
  mocks.createClient.mockResolvedValue({ from, rpc: vi.fn((fn: string, args?: { p_line_ids?: string[] }) => Promise.resolve(fn === 'payroll_line_accounts'
      ? { data: ((salaryError ? [] : salary) as typeof salary).filter(l => (args?.p_line_ids ?? []).includes(String(l.id))).map(l => ({ id: l.id, bank_account_no: l.bank_account_no ?? null })), error: null }
      : { data: [], error: null })) })
  return { from, calls }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requirePermission.mockResolvedValue({ role: 'principal', permissions: ['treasury', 'payroll_payouts'], sensitive: ['bank', 'nric', 'salary'] })
  mocks.exportPdfResponse.mockResolvedValue(new Response('pdf'))
})

describe('voucher PDF statutory coverage', () => {
  it('adds only immutable coverage for the requested statutory PV and preserves other voucher data', async () => {
    const { from, calls } = mockDatabase([voucher('stat', 'payroll_statutory'), voucher('salary', 'payroll_disbursement')])
    await GET(new Request('http://localhost/payments/voucher-doc?ids=stat,salary'))
    expect(mocks.requirePermission).toHaveBeenCalledWith(expect.any(String), ['treasury', 'export'], ['hr_costing', 'export'])
    expect(calls).toContainEqual({ table: 'payroll_statutory_voucher_lines', column: 'voucher_id', values: ['stat'] })
    expect(from.mock.calls.map(([table]) => table)).not.toContain('hr_monthly_payroll')
    const docs = mocks.exportPdfResponse.mock.calls[0][0].element.props.vouchers
    expect(docs[0].statutory_coverage.map((line: { employee_name: string }) => line.employee_name)).toEqual(['Amy', 'Cara', 'Ezra'])
    expect(docs[0].statutory_coverage.map((line: { department_name: string }) => line.department_name)).toEqual(['Original Finance', 'Original Finance', 'Original Finance'])
    expect(docs[0].statutory_coverage.reduce((total: number, line: { amount: number }) => total + line.amount, 0)).toBeCloseTo(600.60)
    expect(docs[1].statutory_coverage).toEqual([])
  })

  // The Finance revamp v2's sheet (2026-10-15, P03): its approval step by step, the bank and the payee in words.
  it('reads who made, sent, approved and paid it, the bank it moves through, the account by its code', async () => {
    const pv = {
      ...voucher('pv', null), status: 'paid', created_by: 'u-aina', approved_by: 'u-loo', approved_at: '2026-10-06T06:08:00Z', executed_by: 'u-loo', executed_at: '2026-10-06T06:08:00Z',
      payment_method: 'bank_transfer', payee_company_id: 'co-hb', bank_account_id: 'b1',
    }
    mockDatabase([pv as unknown as ReturnType<typeof voucher>], null, null, {
      users: [{ id: 'u-aina', name: 'Aina' }, { id: 'u-loo', name: 'Loo K.W.' }],
      approval_requests: [{ reference_id: 'pv', submitted_by: 'u-aina', created_at: '2026-10-06T01:30:00Z' }],
      companies: [{ id: 'co-hb', name: 'HOUZS Bedding', short_code: 'HB' }],
      bank_accounts: [{ id: 'b1', bank_name: 'Hong Leong Bank', account_number: '5123-0098-77' }],
      payment_voucher_sources: [{ voucher_id: 'pv', pool: 'dept_pool_marketing', amount: '600.60', account_code: '6100', chart_of_accounts: { name: 'Advertising' } }],
    })
    await GET(new Request('http://localhost/payments/voucher-doc?id=pv'))
    const [doc] = mocks.exportPdfResponse.mock.calls[0][0].element.props.vouchers
    expect(doc.approval).toEqual({
      created: { by: 'Aina', at: '2026-09-11T00:00:00Z' },
      submitted: { by: 'Aina', at: '2026-10-06T01:30:00Z' },
      approved: { by: 'Loo K.W.', at: '2026-10-06T06:08:00Z' },
      paid: { by: 'Loo K.W.', at: '2026-10-06T06:08:00Z' },
    })
    expect(doc).toMatchObject({ payee_kind: 'Group company', method: 'Bank transfer', bank: { name: 'Hong Leong Bank', number: '5123-0098-77' } })
    expect(doc.sources[0].account_label).toBe('6100 · Advertising')
    // The user's pool names (2026-04-18): "XX Department Pool".
    expect(doc.sources[0].pool_label).toBe('Marketing Department Pool')
  })

  it('names every pool the user’s way — a department’s by its department', async () => {
    mockDatabase([voucher('pv', null)], null, null, {
      payment_voucher_sources: ['venture_pool', 'dept_pool_director', 'dept_pool_hr', 'dept_pool_revenue_department', 'invoice_payout_pool'].map((pool) => ({
        voucher_id: 'pv', pool, amount: '1.00', account_code: null, chart_of_accounts: null,
      })),
    })
    await GET(new Request('http://localhost/payments/voucher-doc?id=pv'))
    const [doc] = mocks.exportPdfResponse.mock.calls[0][0].element.props.vouchers
    expect(doc.sources.map((s: { pool_label: string }) => s.pool_label)).toEqual([
      'Venture Pool', 'Director Pool', 'HR Department Pool', 'Revenue Department Pool', 'Invoice Payout Pool',
    ])
  })

  it('a draft has not been sent: its Submitted step stays open', async () => {
    mockDatabase([{ ...voucher('draft', null), status: 'draft' }])
    await GET(new Request('http://localhost/payments/voucher-doc?id=draft'))
    const [doc] = mocks.exportPdfResponse.mock.calls[0][0].element.props.vouchers
    expect(doc.approval.submitted).toBeNull()
    expect(doc.approval.approved).toBeNull()
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
    expect(from).not.toHaveBeenCalledWith('payroll_voucher_lines')
    expect(mocks.exportPdfResponse.mock.calls[0][0].element.props.vouchers[0].statutory_coverage).toEqual([])
  })

  it('loads the selected receiving account snapshots for each salary component', async () => {
    const { from, calls } = mockDatabase([voucher('salary', 'payroll_disbursement')])
    await GET(new Request('http://localhost/payments/voucher-doc?id=salary'))
    expect(calls).toContainEqual({ table: 'payroll_voucher_lines', column: 'voucher_id', values: ['salary'] })
    const lines = mocks.exportPdfResponse.mock.calls[0][0].element.props.vouchers[0].salary_payments
    expect(lines).toEqual([
      expect.objectContaining({ salary_component: 'basic', recipient_account: 'account_1', bank_name: 'Recorded Maybank', bank_account_no: '0012345678', net: 4302.70 }),
      expect.objectContaining({ salary_component: 'commission', recipient_account: 'account_2', bank_name: 'Recorded CIMB', bank_account_no: '0098765432', net: 4253.45 }),
    ])
    expect(from).not.toHaveBeenCalledWith('hr_staff_costs')
    expect(from).not.toHaveBeenCalledWith('hr_monthly_payroll')
  })

  it('prints •••• for the account numbers to a viewer whose title does not tick Bank accounts (PR4)', async () => {
    mocks.requirePermission.mockResolvedValue({ role: 'staff', permissions: ['treasury', 'payroll_payouts'], sensitive: ['salary'] })
    mockDatabase([voucher('salary', 'payroll_disbursement')])
    await GET(new Request('http://localhost/payments/voucher-doc?id=salary'))
    const lines = mocks.exportPdfResponse.mock.calls[0][0].element.props.vouchers[0].salary_payments
    expect(lines.map((line: { bank_account_no: string | null }) => line.bank_account_no)).toEqual(['••••', '••••'])
    expect(lines.map((line: { bank_name: string | null }) => line.bank_name)).toEqual(['Recorded Maybank', 'Recorded CIMB'])
  })

  it('refuses an incomplete salary PDF if stored receiving account details cannot be read', async () => {
    mockDatabase([voucher('salary', 'payroll_disbursement')], null, { message: 'private database detail' })
    const response = await GET(new Request('http://localhost/payments/voucher-doc?id=salary'))
    expect(response.status).toBe(500)
    expect(await response.text()).not.toContain('private database detail')
    expect(mocks.exportPdfResponse).not.toHaveBeenCalled()
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

  // 2026-10-02: a payroll voucher prints who is paid what, and into which account.
  it('prints no payroll voucher for a treasury account without Payroll payouts', async () => {
    mocks.requirePermission.mockResolvedValue({ role: 'finance', permissions: ['treasury'] })
    const { from } = mockDatabase([voucher('salary', 'payroll_disbursement'), voucher('stat', 'payroll_statutory'), voucher('fund', 'payroll_payment_request')])
    const response = await GET(new Request('http://localhost/payments/voucher-doc?ids=salary,stat,fund'))
    expect(response.status).toBe(404)
    expect(mocks.exportPdfResponse).not.toHaveBeenCalled()
    expect(from).not.toHaveBeenCalledWith('payroll_voucher_lines')
    expect(from).not.toHaveBeenCalledWith('payroll_statutory_voucher_lines')
  })

  it('…and from a mixed selection prints only what that account may see', async () => {
    mocks.requirePermission.mockResolvedValue({ role: 'finance', permissions: ['treasury'] })
    const { from } = mockDatabase([voucher('ordinary', null), voucher('salary', 'payroll_disbursement')])
    const response = await GET(new Request('http://localhost/payments/voucher-doc?ids=ordinary,salary'))
    expect(response.status).toBe(200)
    expect(mocks.exportPdfResponse.mock.calls[0][0].element.props.vouchers.map((v: { id: string }) => v.id)).toEqual(['ordinary'])
    expect(from).not.toHaveBeenCalledWith('payroll_voucher_lines')
  })
})

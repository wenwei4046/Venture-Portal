import { beforeEach, describe, expect, it, vi } from 'vitest'

// 2026-10-07 (user: "invoice edit 我要全部都可以改"): an ISSUED invoice is edited
// with the same form as a draft. Its AR-accrual journal entry is corrected in
// place — the database function amend_issued_invoice rewrites header, lines
// and entry in one transaction; this action decides the entry's lines with
// the resolvers the issue used, and refuses what the function cannot amend.

const mocks = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  createClient: vi.fn(),
  revalidatePath: vi.fn(),
  assertPeriodOpen: vi.fn(),
  resolveArGlCode: vi.fn(),
  primeDeptRegistryFromDb: vi.fn(),
}))
vi.mock('@/lib/auth', () => ({ requirePermission: mocks.requirePermission }))
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))
vi.mock('next/navigation', () => ({ redirect: vi.fn() }))
vi.mock('@/lib/period-lock', () => ({ assertPeriodOpen: mocks.assertPeriodOpen }))
vi.mock('@/lib/ar-accounts', async (original) => ({
  ...(await original<typeof import('@/lib/ar-accounts')>()),
  resolveArGlCode: mocks.resolveArGlCode,
}))
vi.mock('@/lib/dept-registry', async (original) => ({
  ...(await original<typeof import('@/lib/dept-registry')>()),
  primeDeptRegistryFromDb: mocks.primeDeptRegistryFromDb,
}))

import { updateIssuedInvoiceFull } from './actions'

const INVOICE = {
  id: 'inv-13',
  invoice_no: 'HV-INV-202610-0013',
  status: 'issued',
  period_month: '2026-10-01',
  total_amount: 2000,
  billing_mode: 'marketing_project',
  billable_to_type: 'freetext',
  company_id: null,
  billable_to_department_id: null,
  billable_to_freetext_name: 'Rygis Private Gym',
  settlement_voucher_id: null,
  invoice_date: '2026-10-01',
}

interface Call {
  table: string
  filters: Array<[string, string, unknown]>
}
function database(invoice: Record<string, unknown> = INVOICE, lines: Array<{ segment: string | null }> = [{ segment: null }]) {
  const calls: Call[] = []
  const rpc = vi.fn(async () => ({ data: { entry_no: 'JE-202610-0853', journal_lines: 2, settled: false }, error: null }))
  const from = (table: string) => {
    const call: Call = { table, filters: [] }
    calls.push(call)
    const result = () => {
      if (table === 'invoices') return { data: invoice, error: null }
      if (table === 'invoice_lines') return { data: lines, error: null }
      if (table === 'chart_of_accounts') {
        const code = call.filters.find(([f, col]) => f === 'eq' && col === 'code')?.[2]
        return { data: code ? { code } : null, error: null }
      }
      return { data: [], error: null }
    }
    const b = {
      select: () => b,
      eq: (col: string, val: unknown) => (call.filters.push(['eq', col, val]), b),
      in: (col: string, val: unknown) => (call.filters.push(['in', col, val]), b),
      order: () => b,
      single: async () => result(),
      maybeSingle: async () => result(),
      then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => Promise.resolve(result()).then(resolve, reject),
    }
    return b
  }
  mocks.createClient.mockResolvedValue({ from, rpc })
  return { rpc, calls }
}

const payload = {
  id: 'inv-13',
  billableType: 'freetext' as const,
  billingMode: 'marketing_project' as const,
  period: '2026-10',
  invoiceDate: '2026-10-01',
  dueDate: '2026-10-31',
  referenceNo: 'PO-77',
  headerDescription: '',
  freetextName: 'Rygis Private Gym',
  freetextAddress: '12 Jalan Gym',
  freetextPhone: '',
  freetextEmail: '',
  lines: [{ description: 'Marketing Service - 1st Sep to 15th Sep', amount: 2500, categoryCode: '5019' }],
  reason: 'Wrong month on the line, and the fee was agreed at 2,500',
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requirePermission.mockResolvedValue({ id: 'fm', name: 'Finance Manager', role: 'finance', permissions: ['billing'] })
  mocks.resolveArGlCode.mockResolvedValue('3039')
  mocks.primeDeptRegistryFromDb.mockResolvedValue([])
})

describe('updateIssuedInvoiceFull', () => {
  it('rewrites the invoice and its entry through the database function, with the accounts the issue would use', async () => {
    const db = database()
    const result = await updateIssuedInvoiceFull(payload)
    expect(result).toEqual({ entryNo: 'JE-202610-0853' })

    expect(mocks.resolveArGlCode).toHaveBeenCalledWith(expect.anything(), { companyId: null, departmentId: null, freetext: 'Rygis Private Gym' })
    expect(db.rpc).toHaveBeenCalledTimes(1)
    const [name, args] = db.rpc.mock.calls[0] as unknown as [string, Record<string, unknown>]
    expect(name).toBe('amend_issued_invoice')
    expect(args.p_invoice_id).toBe('inv-13')
    expect(args.p_reason).toBe('Wrong month on the line, and the fee was agreed at 2,500')
    expect(args.p_header).toEqual({
      period_month: '2026-10-01',
      billing_mode: 'marketing_project',
      total_amount: 2500,
      invoice_date: '2026-10-01',
      due_date: '2026-10-31',
      description: null,
      reference_no: 'PO-77',
      billable_to_type: 'freetext',
      company_id: null,
      billable_to_department_id: null,
      billable_to_freetext_name: 'Rygis Private Gym',
      billable_to_freetext_address: '12 Jalan Gym',
      billable_to_freetext_phone: null,
      billable_to_freetext_email: null,
    })
    expect(args.p_lines).toEqual([{ line_no: 1, description: 'Marketing Service - 1st Sep to 15th Sep', amount: 2500, category_code: '5019' }])
    expect(args.p_journal).toEqual({
      transaction_date: '2026-10-01',
      lines: [
        { account_code: '3039', debit: 2500, credit: null, description: 'AR — invoice HV-INV-202610-0013' },
        { account_code: '5019', debit: null, credit: 2500, description: 'Marketing Service - 1st Sep to 15th Sep' },
      ],
    })
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/billing')
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/reports')
  })

  it('dates the entry by the invoice date, else the end of the period', async () => {
    const db = database()
    await updateIssuedInvoiceFull({ ...payload, period: '2026-09', invoiceDate: '' })
    const args = (db.rpc.mock.calls[0] as unknown as [string, { p_journal: { transaction_date: string }; p_header: { invoice_date: null } }])[1]
    expect(args.p_journal.transaction_date).toBe('2026-09-30')
    expect(args.p_header.invoice_date).toBeNull()
    // Both months must be open: the one it is filed in, and the one it moves to.
    expect(mocks.assertPeriodOpen).toHaveBeenCalledWith(expect.anything(), '2026-10-01')
    expect(mocks.assertPeriodOpen).toHaveBeenCalledWith(expect.anything(), '2026-09-01')
  })

  it('fans the credit out per line, each on its own account, and falls back to the mode’s revenue account', async () => {
    const db = database()
    await updateIssuedInvoiceFull({
      ...payload,
      lines: [
        { description: 'Design', amount: 1500, categoryCode: '5019' },
        { description: 'Printing', amount: 1000, categoryCode: '' },
      ],
    })
    const args = (db.rpc.mock.calls[0] as unknown as [string, { p_journal: { lines: Array<{ account_code: string; credit: number | null }> }; p_header: { total_amount: number } }])[1]
    expect(args.p_header.total_amount).toBe(2500)
    expect(args.p_journal.lines.map((l) => [l.account_code, l.credit])).toEqual([
      ['3039', null],
      ['5019', 1500],
      ['5011', 1000], // Service Revenue — Subs, the fallback for a project invoice
    ])
  })

  it('refuses a draft — that is edited normally', async () => {
    database({ ...INVOICE, status: 'draft' })
    await expect(updateIssuedInvoiceFull(payload)).rejects.toThrow('a draft is edited normally')
  })

  it('refuses a department recharge, before or after the edit — it posts an expense entry as well', async () => {
    database({ ...INVOICE, billable_to_type: 'dept_pool', billable_to_department_id: 'dept-mkt' })
    await expect(updateIssuedInvoiceFull(payload)).rejects.toThrow(/department/i)
    database()
    await expect(updateIssuedInvoiceFull({ ...payload, billableType: 'dept_pool', departmentId: 'dept-mkt' })).rejects.toThrow(/department/i)
  })

  it('refuses a consolidated payroll invoice — one entry per segment', async () => {
    database({ ...INVOICE, billing_mode: 'payroll_consolidated' }, [{ segment: 'hr' }, { segment: 'finance' }])
    await expect(updateIssuedInvoiceFull(payload)).rejects.toThrow(/consolidated/i)
  })

  it('insists on a reason', async () => {
    const db = database()
    await expect(updateIssuedInvoiceFull({ ...payload, reason: '  ' })).rejects.toThrow('reason')
    expect(db.rpc).not.toHaveBeenCalled()
  })

  it('passes the database’s refusal on as it is', async () => {
    const db = database()
    db.rpc.mockResolvedValueOnce({ data: null, error: { message: 'Money has been received against this invoice — its amount cannot change (raise a credit note instead)' } } as never)
    await expect(updateIssuedInvoiceFull(payload)).rejects.toThrow('Money has been received against this invoice')
  })
})

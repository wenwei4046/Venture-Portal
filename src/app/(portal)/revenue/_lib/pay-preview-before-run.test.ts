import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

vi.mock('server-only', () => ({}))

import { loadPayBeforeRun, previewWageWindow } from './pay-preview-before-run'
import { loadPayBoard } from './pay-preview'

function mockClient(options: {
  salary?: number; tax?: string; rpcFailure?: string; noHistoricalMembers?: boolean; payLines?: Record<string, unknown>[]
} = {}) {
  const tableReads: string[] = []
  const rpcReads: { name: string; args: Record<string, unknown> }[] = []
  const resultFor = (table: string) => {
    const rows: Record<string, unknown>[] = table === 'revenue_pay_lines' ? (options.payLines ?? [])
      : table === 'comm_hierarchy' ? (options.noHistoricalMembers ? [] : [{ staff_id: 'person-a' }])
      : table === 'hr_staff_costs' ? [{
        id: 'person-a', employee_name: 'Anthony', employee_code: 'A', designation: 'Sales', employment_type: 'full_time',
        basic_salary: options.salary ?? 3000, allowances: 100, non_statutory_allowance: 50,
        hire_date: '2026-01-01', resignation_date: null, epf_category: 'A', socso_category: 'first',
        pcb_category: 'KA1', children_count: 0, is_epf_exempt: false, tax_mode: options.tax ?? 'pcb', withholding_rate: 0.02,
      }]
      : table === 'hr_monthly_payroll' ? [{
        staff_id: 'person-a', status: 'draft', source: 'commission', unpaid_leave_days: 2,
        ot_amount: 30, deduction_amount: 150, skbbk_amount: 20, commission_amount: 200,
        commission_adjustment_amount: 75, gross: 190, net: 180,
      }]
      : table === 'comm_statements' ? [{ staff_id: 'person-a', total_commission: 500 }]
      : []
    return { data: rows, error: null }
  }
  function query(result: { data: unknown; error: { message: string } | null }) {
    const builder = {
      select: () => builder, eq: () => builder, neq: () => builder, is: () => builder,
      lte: () => builder, or: () => builder, order: () => builder, in: () => builder, range: () => builder,
      maybeSingle: () => Promise.resolve({ ...result, data: null }),
      then: (resolve: (result: unknown) => unknown) => Promise.resolve(result).then(resolve),
    }
    return builder
  }
  const client = {
    from: (table: string) => { tableReads.push(table); return query(resultFor(table)) },
    rpc: (name: string, args: Record<string, unknown>) => {
      rpcReads.push({ name, args })
      const data = name === 'lookup_epf' ? [{ employer: 390, employee: 330 }]
        : name === 'lookup_socso' ? [{ employer: 50, employee: 15 }]
        : name === 'lookup_eis' ? [{ employer: 6, employee: 6 }]
        : name === 'lookup_pcb' ? 40 : []
      return query({ data, error: options.rpcFailure === name ? { message: 'Individual pay is visible to HR and the Principal only' } : null })
    },
  } as unknown as SupabaseClient
  return { client, tableReads, rpcReads }
}

describe('salary before a saved commission run', () => {
  it('uses the SQL employment window, fractional leave rounding and raw wage for statutory lookup', () => {
    const window = previewWageWindow('2026-08-01', {
      hire_date: '2026-08-10', resignation_date: '2026-08-28', basic_salary: 3100, allowances: 310,
    }, { unpaid_leave_days: 1.5, deduction_amount: 50 })
    expect(window).toEqual({ daysInMonth: 31, daysWorked: 18, statutoryWages: 1930, basicForPcb: 1800 })
    expect(previewWageWindow('2026-08-01', {
      hire_date: '2026-09-01', resignation_date: null, basic_salary: 3100, allowances: 0,
    }).daysWorked).toBe(0)
  })

  it('reads live salary, month adjustments and other applied commission without creating a run', async () => {
    const db = mockClient()
    const board = await loadPayBoard(db.client, 'sub-1', '2026-09-01', { allowWithoutRun: true })
    expect(board.runId).toBeNull()
    expect(board.rows).toHaveLength(1)
    const row = board.rows[0]
    expect(row.commissionHere).toBe(0)
    expect(row.commissionElsewhere).toBe(500)
    expect(row.payrollAdjustment).toBe(75)
    expect(row.input).toMatchObject({ basicSalary: 3000, daysWorked: 28, daysInMonth: 30, epfEe: 330, socsoEe: 15, eisEe: 6, pcb: 40 })
    expect(db.rpcReads[0].name).toBe('revenue_pay_preview')
    expect(db.rpcReads.find(read => read.name === 'lookup_epf')?.args).toEqual({ p_wages: 2743.3333333333335, p_period: '2026-09-01', p_part: 'A' })
    expect(db.rpcReads.find(read => read.name === 'lookup_pcb')?.args).toEqual({ p_income: 2470, p_period: '2026-09-01', p_category: 'KA1', p_children: 0 })
  })

  it('keeps zero-wage statutory contributions zero and respects the salary access gate', async () => {
    const zero = mockClient({ salary: 0, tax: 'withholding' })
    const rows = await loadPayBeforeRun(zero.client, 'sub-1', '2026-09-01')
    expect(rows[0]).toMatchObject({ epf_er: 0, epf_ee: 0, socso_er: 0, socso_ee: 0, eis_er: 0, eis_ee: 0, pcb: 0 })
    expect(zero.rpcReads).toEqual([])

    const denied = mockClient({ rpcFailure: 'revenue_pay_preview' })
    await expect(loadPayBoard(denied.client, 'sub-1', '2026-09-01', { allowWithoutRun: true })).rejects.toThrow('Individual pay')
    expect(denied.tableReads).toEqual(['comm_runs'])
  })

  it('adds the month’s pay lines to the preview, and reads them only past the salary gate', async () => {
    const db = mockClient({ payLines: [
      { id: 'l1', staff_id: 'person-a', kind: 'special_claim', description: 'Petrol', amount: '500.00', version: 1, sort_order: 1 },
      { id: 'l2', staff_id: 'person-a', kind: 'deduction', description: null, amount: '120.00', version: 2, sort_order: 2 },
      { id: 'l3', staff_id: 'somebody-else', kind: 'allowance', description: null, amount: '99.00', version: 1, sort_order: 1 },
    ] })
    const board = await loadPayBoard(db.client, 'sub-1', '2026-09-01', { allowWithoutRun: true })
    const row = board.rows[0]
    expect(row.input).toMatchObject({ payLineEarnings: 500, payLineDeductions: 120 })
    expect(row.lines).toEqual([
      { id: 'l1', kind: 'special_claim', description: 'Petrol', amount: 500, version: 1 },
      { id: 'l2', kind: 'deduction', description: null, amount: 120, version: 2 },
    ])
    expect(row.pay.payLineEarnings).toBe(500)
    expect(row.pay.payLineDeductions).toBe(120)

    const denied = mockClient({ rpcFailure: 'revenue_pay_preview', payLines: [{ id: 'l1' }] })
    await expect(loadPayBoard(denied.client, 'sub-1', '2026-09-01', { allowWithoutRun: true })).rejects.toThrow('Individual pay')
    expect(denied.tableReads).not.toContain('revenue_pay_lines')
  })

  it('can read salary inputs for the actual sellers when historical membership is absent', async () => {
    const db = mockClient({ noHistoricalMembers: true })
    const board = await loadPayBoard(db.client, 'sub-1', '2026-09-01', {
      allowWithoutRun: true, previewStaffIds: ['person-a'],
    })
    expect(board.rows.map(row => row.staffId)).toEqual(['person-a'])
    expect(board.rows[0].input.basicSalary).toBe(3000)
  })
})

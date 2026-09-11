import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
const mocks = vi.hoisted(() => ({ requirePermission: vi.fn(), createClient: vi.fn(), requireSubDepartment: vi.fn() }))
vi.mock('@/lib/auth', () => ({ requirePermission: mocks.requirePermission }))
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }))
vi.mock('@/app/(portal)/revenue/_lib/sub-departments', () => ({ requireSubDepartment: mocks.requireSubDepartment }))
vi.mock('./_components/RunControls', () => ({ default: () => <div>Run controls</div> }))
import CommissionPeriodPage from './page'
import CommissionStatementPage from './statement/[staffId]/page'

function database() {
  const statement = Object.fromEntries(['product_revenue','group_revenue','deferred_revenue','excluded_revenue','penalty_weighted_revenue',
    'kpi_commission','kpi_qty','kpi_base','kpi_threshold_pct','open_bill_bonus','override_commission','margin_incentive','group_incentive',
    'group_subsidy_cap','margin_penalty_withheld','margin_revenue','margin_cost'].map(key => [key,0]))
  Object.assign(statement, { id:'statement', staff_id:'staff', product_commission:10000, total_commission:10000, product_rate:0.03,
    rank_key:'a', group_breakdown:[], full_spec:false })
  const rows: Record<string, unknown> = {
    sales_import_batches: { id:'batch', source:'erp_sync', order_count:0 },
    comm_runs: { id:'run', status:'applied', staff_count:1, total_commission:10000, warnings:[], deferred_orders:[], penalised_orders:[] },
    comm_statements: [statement], hr_staff_costs: [{ id:'staff', employee_name:'Employee One', employee_code:'EMP1' }],
  }
  const from = vi.fn((table: string) => {
    const data = rows[table] ?? []
    const query = { select:vi.fn().mockReturnThis(), eq:vi.fn().mockReturnThis(), in:vi.fn().mockReturnThis(), order:vi.fn().mockReturnThis(),
      maybeSingle:vi.fn().mockResolvedValue({ data:Array.isArray(data) ? data[0] ?? null : data, error:null }),
      then:(resolve: (value: unknown) => unknown) => Promise.resolve(resolve({ data, error:null })),
    }
    return query
  })
  const rpc = vi.fn().mockResolvedValue({ data:[{ staff_id:'staff',commission_synced_amount:13000,commission_adjustment_amount:-500,
    commission_adjustment_reason:'DN from cancelled sale',commission_amount:12500,status:'draft',source_run_count:2 }], error:null })
  mocks.createClient.mockResolvedValue({ from,rpc })
  return { from,rpc }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requireSubDepartment.mockResolvedValue({ id:'sub-id',slug:'fair',name:'Fair',schemeId:null })
})
describe('Revenue pages preserve source commission while reading monthly payroll adjustments', () => {
  it('shows the monthly adjustment in the calculation page without changing the source hero', async () => {
    const { from,rpc } = database()
    const { container } = render(await CommissionPeriodPage({ params:Promise.resolve({ sub:'fair',period:'2026-09-01' }) }))
    expect(container.querySelector('.hero-walnut')).toHaveTextContent('RM 10,000.00')
    expect(container.querySelector('.hero-walnut')).not.toHaveTextContent('RM 12,500.00')
    expect(screen.getByRole('table', { name:'Monthly payroll adjustments by salesperson' })).toHaveTextContent('RM 12,500.00')
    expect(screen.getByText('DN from cancelled sale')).toBeVisible()
    expect(rpc).toHaveBeenCalledExactlyOnceWith('revenue_payroll_adjustments',{p_sub_department_id:'sub-id',p_period:'2026-09-01',p_staff_id:null})
    expect(from).not.toHaveBeenCalledWith('hr_monthly_payroll')
    expect(mocks.requirePermission).toHaveBeenCalledWith('revenue')
  })
  it('shows the employee monthly final gross while keeping their statement source subtotal', async () => {
    const { from,rpc } = database()
    const { container } = render(await CommissionStatementPage({ params:Promise.resolve({ sub:'fair',period:'2026-09-01',staffId:'staff' }) }))
    expect(container.querySelector('.hero-walnut')).toHaveTextContent('RM 10,000.00')
    expect(screen.getByRole('table',{name:'Monthly gross commission reconciliation'})).toHaveTextContent('RM 12,500.00')
    expect(screen.getByText(/DN from cancelled sale/)).toBeVisible()
    expect(rpc).toHaveBeenCalledExactlyOnceWith('revenue_payroll_adjustments',{p_sub_department_id:'sub-id',p_period:'2026-09-01',p_staff_id:'staff'})
    expect(from).not.toHaveBeenCalledWith('hr_monthly_payroll')
  })
})

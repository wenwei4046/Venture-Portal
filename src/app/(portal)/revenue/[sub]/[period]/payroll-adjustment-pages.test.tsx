import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
const mocks = vi.hoisted(() => ({ requirePermission: vi.fn(), createClient: vi.fn(), requireSubDepartment: vi.fn() }))
vi.mock('server-only', () => ({}))
// The month page now ends in a client tab rail, so the render needs the
// router hooks the App Router would supply.
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('notFound')
  },
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@/lib/auth', () => ({ requirePage: async () => undefined, requirePermission: mocks.requirePermission }))
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }))
vi.mock('@/app/(portal)/revenue/_lib/sub-departments', () => ({ requireSubDepartment: mocks.requireSubDepartment }))
import CommissionPeriodPage from './page'
import CommissionStatementPage from './statement/[staffId]/page'

function database() {
  const statement = Object.fromEntries(['product_revenue','group_revenue','deferred_revenue','excluded_revenue','penalty_weighted_revenue',
    'kpi_commission','kpi_qty','kpi_base','kpi_threshold_pct','override_commission','margin_incentive','group_incentive',
    'group_subsidy_cap','margin_penalty_withheld','margin_revenue','margin_cost'].map(key => [key,0]))
  Object.assign(statement, { id:'statement', staff_id:'staff', product_commission:10000, total_commission:10000, product_rate:0.03,
    rank_key:'a', group_breakdown:[], full_spec:false })
  const rows: Record<string, unknown> = {
    sales_import_batches: { id:'batch', source:'erp_sync', order_count:0 },
    // A list, as PostgREST returns one: maybeSingle() takes the first row, and
    // the month page also reads which months a run has paid (2026-09-26).
    comm_runs: [{ id:'run', period_month:'2026-09-01', status:'applied', staff_count:1, total_commission:10000, warnings:[], deferred_orders:[], penalised_orders:[] }],
    comm_statements: [statement], hr_staff_costs: [{ id:'staff', employee_name:'Employee One', employee_code:'EMP1' }],
  }
  const from = vi.fn((table: string) => {
    const data = rows[table] ?? []
    const query = { select:vi.fn().mockReturnThis(), eq:vi.fn().mockReturnThis(), in:vi.fn().mockReturnThis(), order:vi.fn().mockReturnThis(),
      // The Upsales tab (2026-09-24) reads the fair calendar by date range.
      not:vi.fn().mockReturnThis(), gte:vi.fn().mockReturnThis(), lte:vi.fn().mockReturnThis(), is:vi.fn().mockReturnThis(),
      maybeSingle:vi.fn().mockResolvedValue({ data:Array.isArray(data) ? data[0] ?? null : data, error:null }),
      then:(resolve: (value: unknown) => unknown) => Promise.resolve(resolve({ data, error:null })),
    }
    return query
  })
  // The month page reads its orders through revenue_month_orders; only the
  // adjustments RPC is what these assertions are about.
  const rpc = vi.fn((name: string) =>
    name === 'revenue_month_orders' || name === 'revenue_fair_calendar_moves'
      ? Promise.resolve({ data:[], error:null })
      : Promise.resolve({ data:[{ staff_id:'staff',commission_synced_amount:13000,commission_adjustment_amount:-500,
          commission_adjustment_reason:'DN from cancelled sale',commission_amount:12500,status:'draft',source_run_count:2 }], error:null }))
  mocks.createClient.mockResolvedValue({ from,rpc })
  return { from,rpc }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requireSubDepartment.mockResolvedValue({ id:'sub-id',slug:'fair',name:'Fair',schemeId:null })
  // The gate hands back the reader (2026-10-21): the month page's Requests tab asks whether they may decide.
  mocks.requirePermission.mockResolvedValue({ id:'hr', role:'hr', permissions:['revenue'], actions:{ 'revenue.view':'all', 'revenue.edit':'all' }, closed:[] })
})
describe('Revenue pages preserve source commission while reading monthly payroll adjustments', () => {
  // *Payroll & source tools* went on 2026-09-27 — the saved run's hero, its
  // warnings, Recompute & sync, the Open Bill cost, the hand-typed upsales and
  // this reconciliation with it (user: 下面这整个东西就不需要存在了). What payroll
  // holds is the payroll bar's; a person's adjustment stays on their statement.
  it('keeps the month page to the live month: no saved-run section, no payroll rows read', async () => {
    const { from,rpc } = database()
    const { container } = render(await CommissionPeriodPage({ params:Promise.resolve({ sub:'fair',period:'2026-09-01' }) }))
    expect(screen.queryByText(/Payroll & source tools/)).toBeNull()
    expect(container.querySelector('.hero-walnut')).toBeNull()
    expect(screen.queryByRole('button', { name:/Recompute/ })).toBeNull()
    expect(screen.queryByText(/Upsales & drops/)).toBeNull()
    expect(screen.queryByRole('table', { name:'Monthly payroll adjustments by salesperson' })).toBeNull()
    expect(rpc).not.toHaveBeenCalledWith('revenue_payroll_adjustments', expect.anything())
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

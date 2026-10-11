import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CommissionSettingsData, SchemeRow } from '../config/types'

// Rules (2026-10-10, the HR revamp, variant A): a grouped side list and the
// open section beside it. What the list shows is still rules-tabs.ts; KPI
// items keeps its draft while another section is read; Capacity's figures come
// with the page, and only for whoever manages member requests.

const nav = vi.hoisted(() => ({ params: new URLSearchParams(), refresh: vi.fn() }))
const act = vi.hoisted(() => ({ saveSubDepartmentCapacity: vi.fn() }))
vi.mock('next/navigation', () => ({
  useSearchParams: () => nav.params,
  useRouter: () => ({ refresh: nav.refresh, push: vi.fn() }),
}))
vi.mock('../../config-actions', () => ({
  saveSchemeRules: vi.fn(),
  saveRankDef: vi.fn(),
  removeRankDef: vi.fn(),
  deleteMarginBand: vi.fn(),
  updateOpenBillRule: vi.fn(),
  upsertBrand: vi.fn(),
  upsertDirectorPay: vi.fn(),
  upsertItemGroup: vi.fn(),
  upsertMarginBand: vi.fn(),
  upsertRank: vi.fn(),
  upsertKpiThreshold: vi.fn(),
  deleteKpiThreshold: vi.fn(),
}))
vi.mock('../../kpi-actions', () => ({ saveKpiItems: vi.fn(), searchKpiSkus: vi.fn() }))
vi.mock('../../capacity-actions', () => act)
vi.mock('@/components/hrv/toast', () => ({ flash: vi.fn() }))

import RulesView from './RulesView'

const FAIR = 'sub-fair'

const scheme = (on: boolean): SchemeRow => ({
  id: 'scheme-fair',
  sub_department_id: FAIR,
  scheme_name: 'Fair scheme',
  open_bill_basis: 'uplift_on_commission',
  override_includes_kpi: false,
  enable_product_revenue: true,
  enable_kpi: on,
  enable_open_bill: on,
  enable_override: true,
  enable_margin_penalty: on,
  enable_margin_incentive: on,
  enable_group_incentive: false,
  group_sales_depth: null,
  override_depth: null,
  direct_line_limit: null,
  deposit_threshold_pct: null,
  default_rate_mode: 'variable',
})

function dataWith(on: boolean, over: Partial<CommissionSettingsData> = {}): CommissionSettingsData {
  return {
    scheme: scheme(on),
    rankDefs: [],
    ranks: [],
    titles: [],
    itemGroups: on ? [{ id: 'g1', item_group: 'MATTRESS', commissionable: true, note: null }] : [],
    kpiItems: [],
    kpiThresholds: [],
    kpiSpecials: [],
    kpiGoneSkus: [],
    openBillRules: [],
    brands: [],
    marginBands: [],
    promotionRules: on
      ? [{ id: 'p1', from_rank_key: 'rs', to_rank_key: 'srs', alternative_group: 1, criterion: 'personal_sales', threshold_amount: 30000, threshold_qty: null, margin_band_key: null, consecutive_months: 3, is_enforced: false, note: null }]
      : [],
    subDepartments: [],
    allSchemes: [],
    commissionDepartments: [],
    directors: on ? [{ staffId: 'kris', name: 'KRIS', titleName: 'Revenue Director', employeeCode: null, fixedAmount: null, salesThreshold: null, incentiveAmount: null }] : [],
    ...over,
  }
}

const CAPACITY = { ok: true as const, data: { capacity: 30, occupied: 27, reserved: 0, free: 3, waiting: 2 } }

function renderView(on = true, { canCapacity = true, data = dataWith(on) } = {}) {
  return render(
    <RulesView
      data={data}
      subDept={{ id: FAIR, name: 'Fair', slug: 'fair' }}
      holders={{}}
      canManage
      capacity={canCapacity ? CAPACITY : null}
      head={<h1>Rules</h1>}
    />,
  )
}

const list = () => screen.getByRole('navigation', { name: 'Rules sections' })

beforeEach(() => {
  nav.params = new URLSearchParams()
  vi.spyOn(window.history, 'pushState').mockImplementation(() => {})
})
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  vi.restoreAllMocks()
})

describe('RulesView', () => {
  it('lists Fair’s sections under the prototype’s four groups, Scheme rules open', () => {
    renderView(true)
    const groups = within(list()).getAllByRole('group').map(g => [g.getAttribute('aria-label'), within(g).getAllByRole('button').map(b => b.textContent)])
    expect(groups).toEqual([
      ['Pay structure', ['Scheme rules', 'Title ladder', 'Ranks', 'Directors']],
      ['Item rules', ['Item groups', 'KPI items', 'Open Bill rates', 'Brands & margin bands']],
      ['Headcount', ['Capacity']],
      ['Policy', ['Promotion criteria']],
    ])
    expect(within(list()).getByRole('button', { name: 'Scheme rules' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByText('Item rules appear when their switch on Scheme rules is on.')).toBeInTheDocument()
    expect(screen.getByText('Components')).toBeInTheDocument()
  })

  it('shows IR only what it uses: Pay structure and Headcount', () => {
    renderView(false)
    expect(within(list()).getAllByRole('group').map(g => g.getAttribute('aria-label'))).toEqual(['Pay structure', 'Headcount'])
  })

  it('pushes the section into the URL, so Back steps through them', () => {
    renderView(true)
    fireEvent.click(within(list()).getByRole('button', { name: 'Ranks' }))
    expect(window.history.pushState).toHaveBeenCalledWith(null, '', '?tab=ranks')
  })

  it('opens the section the URL names, under its title and one line', () => {
    nav.params = new URLSearchParams('tab=open-bill')
    renderView(true)
    expect(within(list()).getByRole('button', { name: 'Open Bill rates' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByText('The uplift paid on an Open Bill.')).toBeInTheDocument()
  })

  it('keeps KPI items mounted, hidden, while another section is read', () => {
    renderView(true)
    const kpi = screen.getByRole('region', { name: /KPI items/, hidden: true })
    expect(kpi.closest('[hidden]')).not.toBeNull()
  })

  it('opens Capacity on the figures the page read — no read of its own after it', () => {
    nav.params = new URLSearchParams('tab=capacity')
    renderView(true)
    expect(screen.getByRole('group', { name: 'Active' })).toHaveTextContent('27')
    expect(screen.getByText(/2 waiting for a seat/)).toBeInTheDocument()
    expect(act.saveSubDepartmentCapacity).not.toHaveBeenCalled()
  })

  it('leaves Capacity out for an account the member back office would refuse', () => {
    nav.params = new URLSearchParams('tab=capacity')
    renderView(true, { canCapacity: false })
    expect(within(list()).queryByRole('button', { name: 'Capacity' })).toBeNull()
    expect(within(list()).getByRole('button', { name: 'Scheme rules' })).toHaveAttribute('aria-current', 'page')
  })

  it('says so when the sub-department has no scheme yet', () => {
    renderView(true, { data: { ...dataWith(true), scheme: null } })
    expect(screen.getByText('Fair has no scheme yet.')).toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'Rules sections' })).toBeNull()
  })
})

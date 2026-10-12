import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CommissionSettingsData, KpiItemRow, KpiSpecialRow, KpiThresholdRow, SchemeRow } from './types'

const { saveKpiItems, searchSkuMaster, refresh, upsertKpiThreshold, deleteKpiThreshold } = vi.hoisted(() => ({
  saveKpiItems: vi.fn(),
  searchSkuMaster: vi.fn(),
  refresh: vi.fn(),
  upsertKpiThreshold: vi.fn(),
  deleteKpiThreshold: vi.fn(),
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))
// The SKU search reads in the browser (never a Server Action — 2026-10-11): the actions offer only the save.
vi.mock('../../kpi-actions', () => ({ saveKpiItems }))
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({ browser: true }) }))
vi.mock('@/lib/commission/kpi-sku-search', () => ({ searchSkuMaster }))
vi.mock('../../config-actions', () => ({ upsertKpiThreshold, deleteKpiThreshold }))

import KpiItemsSection from './KpiItemsSection'

const SCHEME = '9d6c1f7e-7c1d-4a8e-9f55-0b7d2d3f1a10'
const HB = '2672a958-e9fb-4257-b5dc-61449f22efa8'
const PILLOW = '22222222-2222-4222-8222-222222222222'

const scheme: SchemeRow = {
  id: SCHEME,
  sub_department_id: 'sub-fair',
  scheme_name: 'Fair scheme',
  open_bill_basis: 'uplift_on_commission',
  override_includes_kpi: false,
  enable_product_revenue: true,
  enable_kpi: false,
  enable_open_bill: false,
  enable_override: true,
  enable_margin_penalty: false,
  enable_margin_incentive: false,
  deposit_threshold_pct: 0.3,
  default_rate_mode: 'variable',
}

// Fair on 2026-10-08: HB Straight at RM 250, Tier 1 at 10 units · 20%; and a pillow.
const HB_ROW: KpiItemRow = {
  id: HB, source: 'option', product_code: null, product_name: null, erp_product_id: null,
  option_pool: 'bedframe_specials', option_value: 'HB Straight', kpi_amount: 250, effective_from: '2026-10-06', effective_to: null,
}
const PILLOW_ROW: KpiItemRow = {
  id: PILLOW, source: 'sku', product_code: 'AK-CS PIL', product_name: 'Akemi cushion pillow', erp_product_id: 'pillow',
  option_pool: null, option_value: null, kpi_amount: 50, effective_from: '2026-08-01', effective_to: null,
}
const TIER_1: KpiThresholdRow = { id: 'tier-1', tier_label: 'Tier 1', min_qty: 10, bonus_pct: 0.2, effective_from: '2026-01-01' }
const special = (pool: KpiSpecialRow['pool'], value: string, sort_order: number, removed = false): KpiSpecialRow =>
  ({ pool, value, label: value, sort_order, removed })
const SPECIALS: KpiSpecialRow[] = [
  special('bedframe_specials', 'HB Straight', 1),
  special('bedframe_specials', 'No Side Panel', 2),
  special('sofa_specials', 'Nylon Fabric', 1),
  special('sofa_specials', 'Wooden Arm', 2, true),
]

function dataWith(over: Partial<CommissionSettingsData> = {}): CommissionSettingsData {
  return {
    scheme,
    rankDefs: [],
    ranks: [],
    titles: [],
    itemGroups: [],
    kpiItems: [PILLOW_ROW, HB_ROW],
    kpiThresholds: [TIER_1],
    kpiSpecials: SPECIALS,
    kpiGoneSkus: [],
    openBillRules: [],
    brands: [],
    marginBands: [],
    promotionRules: [],
    subDepartments: [],
    allSchemes: [],
    commissionDepartments: [],
    directors: [],
    ...over,
  }
}

function renderSection(over: Partial<CommissionSettingsData> = {}, on = false) {
  const onSchemeRules = vi.fn()
  const view = render(
    <KpiItemsSection data={dataWith(over)} scheme={{ ...scheme, enable_kpi: on }} subName="Fair" onSchemeRules={onSchemeRules} />,
  )
  return { ...view, onSchemeRules }
}

const click = (name: string | RegExp) => fireEvent.click(screen.getByRole('button', { name }))
const itemsTable = () => screen.getByRole('table', { name: 'KPI items' })
const bodyRows = () => within(itemsTable()).getAllByRole('row').slice(1)
const firstCells = () => bodyRows().map(row => within(row).getAllByRole('cell').slice(0, 4).map(c => c.textContent))
const amountBox = (name: string) => screen.getByRole('textbox', { name: `${name} KPI amount` })

beforeEach(() => {
  saveKpiItems.mockReset().mockResolvedValue({ ok: true, saved: 1 })
  searchSkuMaster.mockReset().mockResolvedValue({ ok: true, hits: [], total: 0 })
  refresh.mockReset()
})
afterEach(cleanup)

describe('Rules › KPI items', () => {
  it('lists bed frame specials before SKUs, how a bill counts each, and its amount to edit', () => {
    renderSection()
    expect(firstCells()).toEqual([
      ['HB Straight', '—', 'Bed frame special', 'Per bed frame'],
      ['AK-CS PIL', 'Akemi cushion pillow', 'SKU', 'Per unit'],
    ])
    expect(amountBox('HB Straight')).toHaveValue('250')
    expect(amountBox('AK-CS PIL')).toHaveValue('50')
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled()
  })

  it('says when KPI is switched off, and opens Scheme rules where the switch is', () => {
    const { onSchemeRules, rerender } = renderSection()
    expect(screen.getByText(/nothing below comes off a bill or is paid until it/)).toBeInTheDocument()
    click('Scheme rules')
    expect(onSchemeRules).toHaveBeenCalledOnce()
    rerender(<KpiItemsSection data={dataWith()} scheme={{ ...scheme, enable_kpi: true }} subName="Fair" onSchemeRules={onSchemeRules} />)
    expect(screen.queryByText(/nothing below comes off a bill/)).not.toBeInTheDocument()
  })

  it("picks a bed frame special at the picker's amount and saves it in one go", async () => {
    const { rerender } = renderSection({}, true)
    click('Bed frame specials')
    const picker = screen.getByRole('list', { name: 'Items to add' })
    expect(within(picker).getByText('On the list')).toBeInTheDocument()
    fireEvent.change(screen.getByRole('textbox', { name: 'KPI amount for the next item added' }), { target: { value: '120' } })
    click('Add No Side Panel')
    expect(firstCells()[0]).toEqual(['No Side PanelNew', '—', 'Bed frame special', 'Per bed frame'])
    expect(amountBox('No Side Panel')).toHaveValue('120')
    click('Save 1 change')
    await waitFor(() => expect(saveKpiItems).toHaveBeenCalledWith(SCHEME, {
      adds: [{ source: 'option', optionPool: 'bedframe_specials', optionValue: 'No Side Panel', amount: '120', label: 'No Side Panel' }],
      changes: [],
      removes: [],
    }))
    expect(await screen.findByRole('status')).toHaveTextContent('From this month, a bill carrying one of these pays its amount flat as KPI.')
    expect(refresh).toHaveBeenCalled()
    // The saved list arrives; the draft gives way to it.
    const saved: KpiItemRow = { ...HB_ROW, id: '33333333-3333-4333-8333-333333333333', option_value: 'No Side Panel', kpi_amount: 120 }
    rerender(<KpiItemsSection data={dataWith({ kpiItems: [PILLOW_ROW, HB_ROW, saved] })} scheme={{ ...scheme, enable_kpi: true }} subName="Fair" onSchemeRules={vi.fn()} />)
    await waitFor(() => expect(screen.queryByText('New')).not.toBeInTheDocument())
    expect(firstCells().map(c => c[0])).toEqual(['HB Straight', 'No Side Panel', 'AK-CS PIL'])
  })

  it('never offers a special the ERP removed', () => {
    renderSection()
    click('Sofa specials')
    const picker = screen.getByRole('list', { name: 'Items to add' })
    expect(within(picker).getByRole('button', { name: 'Add Nylon Fabric' })).toBeInTheDocument()
    expect(within(picker).queryByText('Wooden Arm')).not.toBeInTheDocument()
  })

  it('finds a SKU on the server, wants its amount, then saves it', async () => {
    searchSkuMaster.mockResolvedValue({
      ok: true,
      total: 34,
      hits: [
        { erpId: 'pillow', code: 'AK-CS PIL', description: 'Akemi cushion pillow', category: 'ACC', active: true },
        { erpId: 'cable', code: 'HDMI CABLE', description: 'HDMI cable 2m', category: 'ACC', active: false },
      ],
    })
    renderSection()
    expect(screen.getByText('Type a SKU code or a word of its description.')).toBeInTheDocument()
    fireEvent.change(screen.getByRole('searchbox', { name: 'Find a SKU' }), { target: { value: 'c' } })
    await waitFor(() => expect(searchSkuMaster).toHaveBeenCalledWith({ browser: true }, 'c'))
    const picker = await screen.findByRole('list', { name: 'Items to add' })
    expect(within(picker).getByText('On the list')).toBeInTheDocument()
    expect(within(picker).getByText('Off in the ERP')).toBeInTheDocument()
    expect(screen.getByText('Showing 20 of 34 — type more to narrow it.')).toBeInTheDocument()
    click('Add HDMI CABLE')
    click('Save 1 change')
    expect(screen.getByRole('alert')).toHaveTextContent('HDMI CABLE: give it a KPI amount')
    expect(saveKpiItems).not.toHaveBeenCalled()
    fireEvent.change(amountBox('HDMI CABLE'), { target: { value: '30' } })
    click('Save 1 change')
    await waitFor(() => expect(saveKpiItems).toHaveBeenCalledWith(SCHEME, {
      adds: [{ source: 'sku', erpId: 'cable', amount: '30', label: 'HDMI CABLE' }],
      changes: [],
      removes: [],
    }))
  })

  it('a new amount, and an item taken off — one save', async () => {
    renderSection()
    fireEvent.change(amountBox('AK-CS PIL'), { target: { value: '60' } })
    click('Remove HB Straight')
    expect(within(bodyRows()[0]).getByText('Coming off')).toBeInTheDocument()
    click('Keep HB Straight')
    expect(screen.getByRole('button', { name: 'Save 1 change' })).toBeInTheDocument()
    click('Remove HB Straight')
    click('Save 2 changes')
    await waitFor(() => expect(saveKpiItems).toHaveBeenCalledWith(SCHEME, {
      adds: [],
      changes: [{ id: PILLOW, amount: '60', label: 'AK-CS PIL' }],
      removes: [HB],
    }))
  })

  it("keeps the draft and says why when the save is refused", async () => {
    saveKpiItems.mockResolvedValueOnce({ ok: false, reason: 'A KPI item changed since the page was opened. Reload and try again.' })
    renderSection()
    click('Remove HB Straight')
    click('Save 1 change')
    expect(await screen.findByRole('alert')).toHaveTextContent('A KPI item changed since the page was opened. Reload and try again.')
    // The refusal lands inside the save's transition; the button leaves *Saving…*
    // when the transition ends, a render after the alert — wait for it, don't race it.
    expect(await screen.findByRole('button', { name: 'Save 1 change' })).toBeEnabled()
    expect(refresh).not.toHaveBeenCalled()
  })

  it('Cancel throws the draft away', () => {
    renderSection()
    click('Bed frame specials')
    click('Add No Side Panel')
    click('Remove HB Straight')
    click('Cancel')
    expect(screen.queryByText('New')).not.toBeInTheDocument()
    expect(screen.queryByText('Coming off')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled()
  })

  it('names an item the ERP no longer has', () => {
    renderSection({ kpiGoneSkus: ['pillow'], kpiSpecials: SPECIALS.filter(s => s.value !== 'HB Straight') })
    expect(within(bodyRows()[0]).getByText('Gone from the ERP')).toBeInTheDocument()
    expect(within(bodyRows()[1]).getByText('Gone from the ERP')).toBeInTheDocument()
  })

  it('carries the threshold ladder on the same tab', () => {
    renderSection()
    const ladder = screen.getByRole('table', { name: 'KPI threshold ladder' })
    expect(within(ladder).getByRole('textbox', { name: 'Tier 1 label' })).toHaveValue('Tier 1')
    expect(within(ladder).getByRole('spinbutton', { name: 'Tier 1 minimum units' })).toHaveValue(10)
    expect(within(ladder).getByRole('spinbutton', { name: 'Tier 1 bonus percent' })).toHaveValue(20)
  })
})

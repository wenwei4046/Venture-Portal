import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BrandKpiCatalogue, BrandRow, CommissionSettingsData, KpiItemRow, SchemeRow } from './types'

const { saveKpiItems, searchSkuMaster, refresh } = vi.hoisted(() => ({ saveKpiItems: vi.fn(), searchSkuMaster: vi.fn(), refresh: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))
vi.mock('../../kpi-actions', () => ({ saveKpiItems }))
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({ browser: true }) }))
vi.mock('@/lib/commission/kpi-sku-search', () => ({ searchSkuMaster }))

import BrandKpiItems from './BrandKpiItems'

// 2026-11-13 — Rules › KPI items: a brand's own items are edited where they are listed (2990s; the user:
// "KPI item 那边我是可以手动去加的"). Production's two on that day. Since 2026-11-14 an item is picked as the
// sub-department's own are, of every kind of the brand's own ERP company, and carries only its bonus and its tiers (the
// user: "我只需要像 Fair 一样选 KPI 就好，不需要去选它的 cost"; "by model、by special 或者是 by compartment").
const SCHEME = 'ab55f0b5-084e-4e31-968f-311fb9e1558b'
const BRAND_ID = '383ddd53-18fd-4dfd-b31e-57df4e1d42d9'
const FABRIC_ID = '11111111-1111-4111-8111-111111111111'
const LATEX_ID = '22222222-2222-4222-8222-222222222222'

const scheme: SchemeRow = {
  id: SCHEME,
  sub_department_id: 'sub-fair',
  scheme_name: 'Fair scheme',
  override_includes_kpi: false,
  enable_product_revenue: true,
  enable_kpi: false,
  enable_override: true,
  enable_margin_penalty: false,
  enable_margin_incentive: false,
  deposit_threshold_pct: 0.3,
  default_rate_mode: 'variable',
}
const BRAND_2990S: BrandRow = {
  id: BRAND_ID, code: '2990S', name: '2990s', item_code_prefixes: [], sub_brands: [], ref_prefixes: [], hc_bill_pct: null,
  note: null, is_active: true, own_scheme: true, erp_company_id: 2,
}
const AKEMI: BrandRow = { ...BRAND_2990S, id: 'brand-akemi', code: 'AKEMI', name: 'Akemi', own_scheme: false, erp_company_id: null }
const item = (over: Partial<KpiItemRow> & Pick<KpiItemRow, 'id'>): KpiItemRow => ({
  source: 'option', product_code: null, product_name: null, erp_product_id: null, option_pool: 'sofa_specials', option_value: null,
  kpi_amount: 50, effective_from: '2026-11-01', effective_to: null, brand_id: BRAND_ID, unit_tiers: [], ...over,
})
const row = (id: string, name: string | null, special: string, unit_tiers: unknown, brand = BRAND_ID): KpiItemRow =>
  item({ id, product_name: name, option_value: special, unit_tiers, brand_id: brand })
const FABRIC = row(FABRIC_ID, 'Upgrade fabric', 'Sofa Full Fabric', [])
const LATEX = row(LATEX_ID, 'Upgrade latex seat', 'Latex Seat', [{ min_qty: 10, amount: 100 }, { min_qty: 5, amount: 70 }])
const ITEMS = [FABRIC, LATEX]
const PILLOW_L = item({
  id: '55555555-5555-4555-8555-555555555555', source: 'sku', product_code: 'SQUARE PILLOW-L', product_name: 'Square pillow (L)',
  erp_product_id: '4712', option_pool: null, kpi_amount: 10,
})
const BOAAT = item({ id: '66666666-6666-4666-8666-666666666666', option_pool: 'models', option_value: 'BOAAT', kpi_amount: 40 })
const CNR = item({ id: '77777777-7777-4777-8777-777777777777', option_pool: 'compartments', option_value: 'CNR', kpi_amount: 30 })

// 2990s' own ERP company's catalogue (company 2), as load.ts builds it.
const CATALOGUE: BrandKpiCatalogue = {
  companyId: 2,
  specials: [
    ...['Sofa Full Fabric', 'Latex Seat', 'Neylon Fabric', 'Nylon Fabric', 'Separate Backrest Packing']
      .map((value, i) => ({ pool: 'sofa_specials' as const, value, label: value, sort_order: i, removed: false })),
    { pool: 'bedframe_specials', value: 'HB Straight', label: 'HB Straight', sort_order: 1, removed: false },
    { pool: 'bedframe_specials', value: 'No Side Panel', label: 'No side panel', sort_order: 2, removed: true },
  ],
  fabricSeries: [{ series: 'BELONG', fabrics: 12, removed: false }, { series: 'EZ', fabrics: 1, removed: false }, { series: 'MONS', fabrics: 0, removed: true }],
  models: [{ model: 'ARIA', category: 'BEDFRAME', skus: 4, sample: 'Aria queen' }, { model: 'BOAAT', category: 'SOFA', skus: 6, sample: 'SOFA BOAAT 1A' }],
  compartments: [{ compartment: '2A', models: 30 }, { compartment: 'CNR', models: 14 }],
}

function dataWith(over: Partial<CommissionSettingsData> = {}): CommissionSettingsData {
  return {
    scheme,
    rankDefs: [],
    ranks: [],
    titles: [],
    itemGroups: [],
    kpiItems: [],
    brandKpiItems: ITEMS,
    brandKpiCatalogues: [CATALOGUE],
    kpiThresholds: [],
    kpiSpecials: [],
    kpiFabricSeries: [],
    kpiGoneSkus: [],
    brands: [AKEMI, BRAND_2990S],
    marginBands: [],
    promotionRules: [],
    subDepartments: [],
    allSchemes: [],
    commissionDepartments: [],
    directors: [],
    ...over,
  }
}

const renderBlock = (over: Partial<CommissionSettingsData> = {}, canManage = true) => {
  const data = dataWith(over)
  return { data, ...render(<BrandKpiItems data={data} scheme={scheme} canManage={canManage} />) }
}
const table = (brand = '2990s') => screen.getByRole('table', { name: `${brand} KPI items` })
const bodyRows = (brand = '2990s') => within(table(brand)).getAllByRole('row').slice(1)
const cells = (brand = '2990s') => bodyRows(brand).map(r => within(r).getAllByRole('cell').map(c => c.textContent))
const box = (name: string) => screen.getByRole('textbox', { name })
const click = (name: string | RegExp) => fireEvent.click(screen.getByRole('button', { name }))
const type = (name: string, value: string) => fireEvent.change(box(name), { target: { value } })
const saveButton = (brand = '2990s') => screen.getByRole('button', { name: `Save ${brand} KPI items` })
const results = (brand = '2990s') => screen.getByRole('list', { name: `${brand} items to add` })
const offered = (brand = '2990s') =>
  within(results(brand)).getAllByRole('listitem').map(li => [li.firstElementChild?.textContent, within(li).queryByText('On the list') ? 'On the list' : 'Add'])
const SOURCES = ['SKU Master', 'Models', 'Compartments', 'Bed frame specials', 'Sofa specials', 'Bed frame fabric series', 'Sofa fabric series']

beforeEach(() => {
  saveKpiItems.mockReset().mockResolvedValue({ ok: true, saved: 1 })
  searchSkuMaster.mockReset().mockResolvedValue({ ok: true, hits: [], total: 0 })
  refresh.mockReset()
})
afterEach(cleanup)

describe("Rules › KPI items — a brand's own items", () => {
  describe('for whoever may not manage the rules', () => {
    it('lists them — the name over what it is found by, its kind, how a bill counts it, the bonus, the tiers — with nothing to type or press', () => {
      renderBlock({ brandKpiItems: [...ITEMS, PILLOW_L, BOAAT, CNR] }, false)
      expect(within(table()).getAllByRole('columnheader').map(h => h.textContent)).toEqual([
        'Item', 'Kind', 'Counted', 'Bonus a unit · RM', "By the month's units",
      ])
      expect(cells()).toEqual([
        ['BOAAT', 'Model', 'Once per sofa set, else per unit', '40.00', '—'],
        ['CNR', 'Compartment', 'Once per sofa set', '30.00', '—'],
        ['Square pillow (L)SQUARE PILLOW-L', 'SKU', 'Per unit', '10.00', '—'],
        ['Upgrade fabricSofa Full Fabric', 'Sofa special', 'Once per sofa set', '50.00', '—'],
        ['Upgrade latex seatLatex Seat', 'Sofa special', 'Once per sofa set', '50.00', '5+ · 70.00  ·  10+ · 100.00'],
      ])
      expect(screen.getByText('5 ITEMS · ALWAYS PAID')).toBeInTheDocument()
      expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
      expect(screen.queryByRole('searchbox')).not.toBeInTheDocument()
      expect(screen.queryByRole('button')).not.toBeInTheDocument()
    })

    it('shows no block for a brand with no item, nor for a brand that is not on its own scheme', () => {
      renderBlock({ brandKpiItems: [] }, false)
      expect(screen.queryByRole('table')).not.toBeInTheDocument()
      cleanup()
      renderBlock({ brands: [{ ...BRAND_2990S, own_scheme: false }] }, false)
      expect(screen.queryByRole('table')).not.toBeInTheDocument()
      cleanup()
      renderBlock({ brands: [{ ...BRAND_2990S, is_active: false }] }, true)
      expect(screen.queryByRole('table')).not.toBeInTheDocument()
    })
  })

  it('offers seven sources, the SKU Master first, and opens each bonus and each tier to edit — no cost to type', () => {
    renderBlock()
    expect(SOURCES.map(name => screen.getByRole('button', { name }).getAttribute('aria-pressed'))).toEqual(['true', ...SOURCES.slice(1).map(() => 'false')])
    expect(screen.getByText('Type a SKU code or a word of its description.')).toBeInTheDocument()
    expect(screen.getByRole('searchbox', { name: 'Find a 2990s SKU' })).toHaveValue('')
    expect(box('Upgrade fabric bonus a unit')).toHaveValue('50')
    expect(box('Upgrade latex seat bonus a unit')).toHaveValue('50')
    expect(box('Upgrade latex seat tier 1 from units')).toHaveValue('5')
    expect(box('Upgrade latex seat tier 1 pays')).toHaveValue('70')
    expect(box('Upgrade latex seat tier 2 from units')).toHaveValue('10')
    expect(box('Upgrade latex seat tier 2 pays')).toHaveValue('100')
    expect(screen.queryByRole('textbox', { name: 'Upgrade fabric tier 1 from units' })).not.toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: /cost/i })).not.toBeInTheDocument()
    expect(within(table()).queryByRole('columnheader', { name: /cost/i })).not.toBeInTheDocument()
    expect(saveButton()).toBeDisabled()
    expect(saveButton()).toHaveTextContent('Save')
    expect(screen.getByRole('button', { name: 'Cancel 2990s KPI item changes' })).toBeDisabled()
  })

  it('a bonus retyped is saved alone, and the draft gives way only when the saved list arrives', async () => {
    const { data, rerender } = renderBlock()
    type('Upgrade fabric bonus a unit', '60')
    expect(screen.getByText(/1 change not saved/)).toBeInTheDocument()
    expect(saveButton()).toHaveTextContent('Save 1 change')
    // Typed back, there is nothing to save.
    type('Upgrade fabric bonus a unit', '50.00')
    expect(saveButton()).toBeDisabled()
    type('Upgrade fabric bonus a unit', '60')
    fireEvent.click(saveButton())
    await waitFor(() => expect(saveKpiItems).toHaveBeenCalledWith(SCHEME, {
      adds: [],
      changes: [{ id: FABRIC_ID, amount: '60', label: 'Upgrade fabric' }],
      removes: [],
    }))
    expect(await screen.findByRole('status')).toHaveTextContent('Saved.')
    expect(refresh).toHaveBeenCalledOnce()
    await waitFor(() => expect(saveButton()).toHaveTextContent('Saved'))
    // The page drawn again with the list it had: the draft stays on screen, locked.
    rerender(<BrandKpiItems data={{ ...data }} scheme={scheme} canManage />)
    expect(box('Upgrade fabric bonus a unit')).toHaveValue('60')
    expect(box('Upgrade fabric bonus a unit')).toBeDisabled()
    // The saved list: today's row replaced the one that began on 1 November.
    const saved = { ...FABRIC, id: '33333333-3333-4333-8333-333333333333', kpi_amount: 60, effective_from: '2026-11-13' }
    rerender(<BrandKpiItems data={dataWith({ brandKpiItems: [saved, LATEX] })} scheme={scheme} canManage />)
    await waitFor(() => expect(box('Upgrade fabric bonus a unit')).toBeEnabled())
    expect(box('Upgrade fabric bonus a unit')).toHaveValue('60')
    expect(saveButton()).toBeDisabled()
    expect(screen.queryByText(/not saved/)).not.toBeInTheDocument()
  })

  it('a tier added to an item is saved as its tiers, the bonus nobody touched left out', async () => {
    renderBlock()
    click('Add a tier to Upgrade fabric')
    // A row left blank is no tier and no change.
    expect(saveButton()).toBeDisabled()
    type('Upgrade fabric tier 1 from units', '5')
    type('Upgrade fabric tier 1 pays', '70')
    fireEvent.click(saveButton())
    await waitFor(() => expect(saveKpiItems).toHaveBeenCalledWith(SCHEME, {
      adds: [],
      changes: [{ id: FABRIC_ID, label: 'Upgrade fabric', tiers: [{ minQty: '5', amount: '70' }] }],
      removes: [],
    }))
  })

  it('a tier dropped and a tier retyped go as the tiers that are left, whole', async () => {
    renderBlock()
    type('Upgrade latex seat tier 2 pays', '120')
    click('Drop Upgrade latex seat tier 1')
    expect(box('Upgrade latex seat tier 1 from units')).toHaveValue('10')
    expect(screen.queryByRole('textbox', { name: 'Upgrade latex seat tier 2 from units' })).not.toBeInTheDocument()
    fireEvent.click(saveButton())
    await waitFor(() => expect(saveKpiItems).toHaveBeenCalledWith(SCHEME, {
      adds: [],
      changes: [{ id: LATEX_ID, label: 'Upgrade latex seat', tiers: [{ minQty: '10', amount: '120' }] }],
      removes: [],
    }))
  })

  it('offers no seventh tier', () => {
    renderBlock({ brandKpiItems: [row(FABRIC_ID, 'Upgrade fabric', 'Sofa Full Fabric', [2, 3, 4, 5, 6, 7].map(n => ({ min_qty: n, amount: n * 10 })))] })
    expect(box('Upgrade fabric tier 6 from units')).toHaveValue('7')
    expect(screen.queryByRole('button', { name: 'Add a tier to Upgrade fabric' })).not.toBeInTheDocument()
  })

  it('says what is wrong with a tier before anything is sent', () => {
    renderBlock()
    type('Upgrade latex seat tier 1 from units', '1')
    fireEvent.click(saveButton())
    expect(screen.getByRole('alert')).toHaveTextContent('Upgrade latex seat: a tier starts from 2 units — below that every unit pays the bonus')
    type('Upgrade latex seat tier 1 from units', '12')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    fireEvent.click(saveButton())
    expect(screen.getByRole('alert')).toHaveTextContent('Upgrade latex seat: each tier starts above the one before')
    type('Upgrade latex seat tier 1 from units', '5')
    type('Upgrade latex seat bonus a unit', '')
    fireEvent.click(saveButton())
    expect(screen.getByRole('alert')).toHaveTextContent('Upgrade latex seat: give it a KPI amount')
    expect(saveKpiItems).not.toHaveBeenCalled()
  })

  it('takes an item off — or keeps it after all — and offers it again meanwhile', async () => {
    renderBlock()
    click('Sofa specials')
    expect(offered()).toEqual([
      ['Sofa Full Fabric', 'On the list'], ['Latex Seat', 'On the list'], ['Neylon Fabric', 'Add'], ['Nylon Fabric', 'Add'],
      ['Separate Backrest Packing', 'Add'],
    ])
    type('Upgrade latex seat bonus a unit', '80')
    click('Remove Upgrade latex seat')
    expect(within(bodyRows()[1]).getByText('Coming off')).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: 'Upgrade latex seat bonus a unit' })).not.toBeInTheDocument()
    expect(offered()[1]).toEqual(['Latex Seat', 'Add'])
    expect(saveButton()).toHaveTextContent('Save 1 change')
    click('Keep Upgrade latex seat')
    // Its retyped bonus is still there.
    expect(box('Upgrade latex seat bonus a unit')).toHaveValue('80')
    click('Remove Upgrade latex seat')
    fireEvent.click(saveButton())
    await waitFor(() => expect(saveKpiItems).toHaveBeenCalledWith(SCHEME, { adds: [], changes: [], removes: [LATEX_ID] }))
  })

  it("adds a special of the brand's own pool at the bonus typed for it, under a name of its own, with a tier", async () => {
    renderBlock()
    click('Sofa specials')
    type('2990s bonus for the next item added', '30')
    click('Add Nylon Fabric to 2990s')
    expect(cells()[0].slice(0, 4)).toEqual(['Nylon FabricNew', 'Sofa special', 'Once per sofa set', ''])
    expect(box('Nylon Fabric bonus a unit')).toHaveValue('30')
    // On the list now; the bonus stays for the next one.
    expect(offered()[3]).toEqual(['Nylon Fabric', 'On the list'])
    expect(box('2990s bonus for the next item added')).toHaveValue('30')
    type('Nylon Fabric name', 'Upgrade nylon')
    click('Add a tier to Upgrade nylon')
    type('Upgrade nylon tier 1 from units', '5')
    type('Upgrade nylon tier 1 pays', '45')
    expect(saveButton()).toHaveTextContent('Save 1 change')
    fireEvent.click(saveButton())
    await waitFor(() => expect(saveKpiItems).toHaveBeenCalledWith(SCHEME, {
      adds: [{
        source: 'option', optionPool: 'sofa_specials', optionValue: 'Nylon Fabric', amount: '30', brandId: BRAND_ID,
        name: 'Upgrade nylon', tiers: [{ minQty: '5', amount: '45' }], label: 'Upgrade nylon',
      }],
      changes: [],
      removes: [],
    }))
  })

  it("finds a SKU on the brand's own SKU master, wants its bonus, then saves it", async () => {
    searchSkuMaster.mockResolvedValue({
      ok: true,
      total: 3,
      hits: [
        { erpId: '4711', code: 'SQUARE PILLOW-M', description: 'Square pillow (M)', category: 'ACCESSORY', active: true },
        { erpId: '4712', code: 'SQUARE PILLOW-L', description: 'Square pillow (L)', category: 'ACCESSORY', active: true },
        { erpId: '4713', code: 'SQUARE PILLOW-S', description: 'Square pillow (S)', category: 'ACCESSORY', active: false },
      ],
    })
    renderBlock({ brandKpiItems: [...ITEMS, PILLOW_L] })
    fireEvent.change(screen.getByRole('searchbox', { name: 'Find a 2990s SKU' }), { target: { value: 'pillow' } })
    // Its own company's SKU master alone.
    await waitFor(() => expect(searchSkuMaster).toHaveBeenCalledWith({ browser: true }, 'pillow', 2))
    await screen.findByRole('list', { name: '2990s items to add' })
    expect(offered()).toEqual([['SQUARE PILLOW-M', 'Add'], ['SQUARE PILLOW-L', 'On the list'], ['SQUARE PILLOW-S', 'Add']])
    expect(within(results()).getByText('Off in the ERP')).toBeInTheDocument()
    click('Add SQUARE PILLOW-M to 2990s')
    expect(cells()[0].slice(0, 3)).toEqual(['SQUARE PILLOW-MNew', 'SKU', 'Per unit'])
    expect(box('Square pillow (M) name')).toHaveAttribute('placeholder', 'Square pillow (M)')
    fireEvent.click(saveButton())
    expect(screen.getByRole('alert')).toHaveTextContent('Square pillow (M): give it a KPI amount')
    expect(saveKpiItems).not.toHaveBeenCalled()
    type('Square pillow (M) bonus a unit', '10')
    fireEvent.click(saveButton())
    await waitFor(() => expect(saveKpiItems).toHaveBeenCalledWith(SCHEME, {
      adds: [{ source: 'sku', erpId: '4711', amount: '10', brandId: BRAND_ID, name: null, tiers: [], label: 'Square pillow (M)' }],
      changes: [],
      removes: [],
    }))
  })

  it('says why no SKU is listed — nothing typed, nothing found, the search failing', async () => {
    renderBlock()
    const find = screen.getByRole('searchbox', { name: 'Find a 2990s SKU' })
    fireEvent.change(find, { target: { value: 'zzz' } })
    expect(await screen.findByText('No SKU matches.')).toBeInTheDocument()
    searchSkuMaster.mockResolvedValue({ ok: false, reason: 'The SKU Master could not be searched just now. Try again.' })
    fireEvent.change(find, { target: { value: 'zzzz' } })
    expect(await screen.findByText('The SKU Master could not be searched just now. Try again.')).toBeInTheDocument()
  })

  it('lists its own models, compartments, fabric series and bed frame specials — filtered as typed, none the ERP removed', async () => {
    renderBlock({ brandKpiItems: [...ITEMS, CNR] })
    click('Models')
    expect(screen.getByRole('button', { name: 'Models' })).toHaveAttribute('aria-pressed', 'true')
    expect(offered()).toEqual([['ARIA', 'Add'], ['BOAAT', 'Add']])
    expect(within(results()).getByText('SOFA · 6 SKUs · SOFA BOAAT 1A')).toBeInTheDocument()
    fireEvent.change(screen.getByRole('searchbox', { name: "Filter 2990s's models" }), { target: { value: 'queen' } })
    expect(offered()).toEqual([['ARIA', 'Add']])
    fireEvent.change(screen.getByRole('searchbox', { name: "Filter 2990s's models" }), { target: { value: 'nothing like it' } })
    expect(screen.getByText('Nothing matches.')).toBeInTheDocument()
    fireEvent.change(screen.getByRole('searchbox', { name: "Filter 2990s's models" }), { target: { value: '' } })
    type('2990s bonus for the next item added', '25')
    click('Add ARIA to 2990s')
    click('Compartments')
    // The filter is emptied for the new source.
    expect(screen.getByRole('searchbox', { name: "Filter 2990s's compartments" })).toHaveValue('')
    expect(offered()).toEqual([['2A', 'Add'], ['CNR', 'On the list']])
    expect(within(results()).getByText('14 sofa models')).toBeInTheDocument()
    click('Add 2A to 2990s')
    click('Sofa fabric series')
    expect(offered()).toEqual([['BELONG', 'Add'], ['EZ', 'Add']])
    expect(within(results()).getByText('1 fabric')).toBeInTheDocument()
    click('Add EZ to 2990s')
    click('Bed frame specials')
    expect(offered()).toEqual([['HB Straight', 'Add']])
    // The newest first; each named as the database will list it.
    expect(cells().slice(0, 3).map(c => c.slice(0, 3))).toEqual([
      ['EZNew', 'Sofa fabric series', 'Once per sofa set'],
      ['2ANew', 'Compartment', 'Once per sofa set'],
      ['ARIANew', 'Model', 'Once per sofa set, else per unit'],
    ])
    expect(box('EZ · Sofa fabric name')).toHaveAttribute('placeholder', 'EZ · Sofa fabric')
    expect(box('ARIA name')).toHaveAttribute('placeholder', 'Name')
    fireEvent.click(saveButton())
    await waitFor(() => expect(saveKpiItems).toHaveBeenCalledWith(SCHEME, {
      adds: [
        { source: 'option', optionPool: 'sofa_fabric_series', optionValue: 'EZ', amount: '25', brandId: BRAND_ID, name: null, tiers: [], label: 'EZ · Sofa fabric' },
        { source: 'option', optionPool: 'compartments', optionValue: '2A', amount: '25', brandId: BRAND_ID, name: null, tiers: [], label: '2A' },
        { source: 'option', optionPool: 'models', optionValue: 'ARIA', amount: '25', brandId: BRAND_ID, name: null, tiers: [], label: 'ARIA' },
      ],
      changes: [],
      removes: [],
    }))
  })

  it('an item added with no bonus is refused by its name, and taken off again is offered again', () => {
    renderBlock()
    click('Compartments')
    click('Add CNR to 2990s')
    fireEvent.click(saveButton())
    expect(screen.getByRole('alert')).toHaveTextContent('CNR: give it a KPI amount')
    click('Take CNR off')
    expect(bodyRows()).toHaveLength(2)
    expect(saveButton()).toBeDisabled()
    expect(offered()).toEqual([['2A', 'Add'], ['CNR', 'Add']])
  })

  it('keeps the draft and says why when the save is refused', async () => {
    saveKpiItems.mockResolvedValueOnce({ ok: false, reason: 'A KPI item changed since the page was opened. Reload and try again.' })
    renderBlock()
    type('Upgrade fabric bonus a unit', '60')
    fireEvent.click(saveButton())
    expect(await screen.findByRole('alert')).toHaveTextContent('A KPI item changed since the page was opened. Reload and try again.')
    await waitFor(() => expect(saveButton()).toBeEnabled())
    expect(box('Upgrade fabric bonus a unit')).toHaveValue('60')
    expect(refresh).not.toHaveBeenCalled()
  })

  it('Cancel throws the draft away', () => {
    renderBlock()
    type('Upgrade fabric bonus a unit', '60')
    click('Drop Upgrade latex seat tier 2')
    click('Models')
    click('Add BOAAT to 2990s')
    expect(saveButton()).toHaveTextContent('Save 3 changes')
    click('Cancel 2990s KPI item changes')
    expect(box('Upgrade fabric bonus a unit')).toHaveValue('50')
    expect(box('Upgrade latex seat tier 2 pays')).toHaveValue('100')
    expect(bodyRows()).toHaveLength(2)
    expect(saveButton()).toBeDisabled()
  })

  it('gives whoever may manage the rules a brand with no item yet, to add its first', () => {
    renderBlock({ brandKpiItems: [] })
    expect(within(table()).getByText('2990s has no KPI items yet.')).toBeInTheDocument()
    expect(screen.getByText('0 ITEMS · ALWAYS PAID')).toBeInTheDocument()
    click('Sofa specials')
    expect(offered().map(([value]) => value)).toEqual(['Sofa Full Fabric', 'Latex Seat', 'Neylon Fabric', 'Nylon Fabric', 'Separate Backrest Packing'])
    click('Add Latex Seat to 2990s')
    expect(within(table()).queryByText('2990s has no KPI items yet.')).not.toBeInTheDocument()
  })

  it('names an item the ERP no longer has, of any kind — never when its list could not be read', () => {
    const GONE_MODEL = item({ id: '88888888-8888-4888-8888-888888888888', option_pool: 'models', option_value: 'QUBBU', kpi_amount: 40 })
    const GONE_SERIES = item({ id: '99999999-9999-4999-8999-999999999990', option_pool: 'sofa_fabric_series', option_value: 'MONS', product_name: 'MONS · Sofa fabric' })
    const catalogue = { ...CATALOGUE, specials: CATALOGUE.specials.map(o => (o.value === 'Latex Seat' ? { ...o, removed: true } : o)) }
    renderBlock({
      brandKpiItems: [...ITEMS, PILLOW_L, BOAAT, GONE_MODEL, GONE_SERIES],
      brandKpiCatalogues: [catalogue],
      kpiGoneSkus: ['4712'],
    })
    const gone = () => bodyRows().filter(r => within(r).queryByText('Gone from the ERP')).map(r => within(r).getAllByRole('cell')[0].textContent)
    expect(gone()).toEqual([
      'MONS · Sofa fabricGone from the ERPMONS',
      'QUBBUGone from the ERP',
      'Square pillow (L)Gone from the ERPSQUARE PILLOW-L',
      'Upgrade latex seatGone from the ERPLatex Seat',
    ])
    cleanup()
    renderBlock({
      brandKpiItems: [...ITEMS, BOAAT, GONE_MODEL, GONE_SERIES],
      brandKpiCatalogues: [{ companyId: 2, specials: [], fabricSeries: [], models: [], compartments: [] }],
    })
    expect(screen.queryByText('Gone from the ERP')).not.toBeInTheDocument()
  })

  it('keeps each brand to its own block, its own catalogue, its own draft and its own Save', async () => {
    const OTHER = '99999999-9999-4999-8999-999999999999'
    const OTHER_ITEM = '44444444-4444-4444-8444-444444444444'
    renderBlock({
      brands: [BRAND_2990S, { ...BRAND_2990S, id: OTHER, code: 'OUTLET', name: 'Outlet', erp_company_id: 3 }],
      brandKpiItems: [...ITEMS, row(OTHER_ITEM, null, 'Recliner', [], OTHER)],
      brandKpiCatalogues: [CATALOGUE, {
        companyId: 3, fabricSeries: [], models: [], compartments: [],
        specials: [
          { pool: 'sofa_specials', value: 'Recliner', label: 'Recliner', sort_order: 1, removed: false },
          { pool: 'sofa_specials', value: 'Footrest', label: 'Electric footrest', sort_order: 2, removed: false },
        ],
      }],
    })
    expect(bodyRows('Outlet')).toHaveLength(1)
    fireEvent.click(within(screen.getByRole('group', { name: 'Add a Outlet KPI item' })).getByRole('button', { name: 'Sofa specials' }))
    expect(offered('Outlet')).toEqual([['Recliner', 'On the list'], ['Footrest', 'Add']])
    expect(within(results('Outlet')).getByText('Electric footrest')).toBeInTheDocument()
    type('Upgrade fabric bonus a unit', '60')
    type('Recliner bonus a unit', '40')
    expect(saveButton('Outlet')).toHaveTextContent('Save 1 change')
    fireEvent.click(saveButton('Outlet'))
    await waitFor(() => expect(saveKpiItems).toHaveBeenCalledWith(SCHEME, {
      adds: [],
      changes: [{ id: OTHER_ITEM, amount: '40', label: 'Recliner' }],
      removes: [],
    }))
    expect(saveKpiItems).toHaveBeenCalledOnce()
    // 2990s' own draft is untouched by it.
    expect(box('Upgrade fabric bonus a unit')).toHaveValue('60')
    expect(saveButton()).toHaveTextContent('Save 1 change')
  })
})

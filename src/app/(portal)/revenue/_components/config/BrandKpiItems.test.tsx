import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BrandKpiSpecialRow, BrandRow, CommissionSettingsData, KpiItemRow, KpiSpecialRow, SchemeRow } from './types'

const { saveKpiItems, refresh } = vi.hoisted(() => ({ saveKpiItems: vi.fn(), refresh: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))
vi.mock('../../kpi-actions', () => ({ saveKpiItems }))

import BrandKpiItems from './BrandKpiItems'

// 2026-11-13 — Rules › KPI items: a brand's own items are edited where they are listed (2990s; the user:
// "KPI item 那边我是可以手动去加的"). Production's two on that day, and its ERP company's five sofa specials.
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
const row = (id: string, name: string | null, special: string, unit_tiers: unknown, brand = BRAND_ID): KpiItemRow => ({
  id, source: 'option', product_code: null, product_name: name, erp_product_id: null, option_pool: 'sofa_specials', option_value: special,
  kpi_amount: 50, effective_from: '2026-11-01', effective_to: null, brand_id: brand, unit_tiers,
})
const FABRIC = row(FABRIC_ID, 'Upgrade fabric', 'Sofa Full Fabric', [])
const LATEX = row(LATEX_ID, 'Upgrade latex seat', 'Latex Seat', [{ min_qty: 10, amount: 100 }, { min_qty: 5, amount: 70 }])
const ITEMS = [FABRIC, LATEX]
const POOL: BrandKpiSpecialRow[] = ['Sofa Full Fabric', 'Latex Seat', 'Neylon Fabric', 'Nylon Fabric', 'Separate Backrest Packing']
  .map((value, i) => ({ companyId: 2, value, label: value, sort_order: i, removed: false }))

function dataWith(over: Partial<CommissionSettingsData> = {}): CommissionSettingsData {
  return {
    scheme,
    rankDefs: [],
    ranks: [],
    titles: [],
    itemGroups: [],
    kpiItems: [],
    brandKpiItems: ITEMS,
    brandKpiSpecials: POOL,
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
const box = (name: string) => screen.getByRole('textbox', { name })
const click = (name: string | RegExp) => fireEvent.click(screen.getByRole('button', { name }))
const type = (name: string, value: string) => fireEvent.change(box(name), { target: { value } })
const saveButton = (brand = '2990s') => screen.getByRole('button', { name: `Save ${brand} KPI items` })
const picker = (brand = '2990s') => screen.getByRole('combobox', { name: `${brand} special to add` })
const offered = (brand = '2990s') => within(picker(brand)).getAllByRole('option').map(o => o.textContent)

beforeEach(() => {
  saveKpiItems.mockReset().mockResolvedValue({ ok: true, saved: 1 })
  refresh.mockReset()
})
afterEach(cleanup)

describe("Rules › KPI items — a brand's own items", () => {
  describe('for whoever may not manage the rules', () => {
    it('lists them — the name over the special, a unit a sofa set, the cost, the bonus, the tiers — with nothing to type or press', () => {
      // The latex seat costs RM 500 a unit, RM 1,000 on a sofa with a corner; the fabric has no cost: what the bill
      // charged comes off — on a corner sofa too.
      renderBlock({ brandKpiItems: [FABRIC, { ...LATEX, cost_amount: '500.00', corner_cost_amount: '1000.00' }] }, false)
      expect(within(table()).getAllByRole('columnheader').map(h => h.textContent)).toEqual([
        'Item', 'Counted', 'Cost a unit · RM', 'Corner cost · RM', 'Bonus a unit · RM', "By the month's units",
      ])
      expect(bodyRows().map(r => within(r).getAllByRole('cell').map(c => c.textContent))).toEqual([
        ['Upgrade fabricSofa Full Fabric', 'Once per sofa set', 'As billed', 'As cost', '50.00', '—'],
        ['Upgrade latex seatLatex Seat', 'Once per sofa set', '500.00', '1,000.00', '50.00', '5+ · 70.00  ·  10+ · 100.00'],
      ])
      expect(screen.getByText('2 ITEMS · ALWAYS PAID')).toBeInTheDocument()
      expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
      expect(screen.queryByRole('button')).not.toBeInTheDocument()
      expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
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

  it('opens each cost, each bonus and each tier to edit, with nothing to save yet', () => {
    renderBlock()
    // No cost yet: an empty box that says what that means.
    expect(box('Upgrade fabric cost a unit')).toHaveValue('')
    expect(box('Upgrade fabric cost a unit')).toHaveAttribute('placeholder', 'As billed')
    expect(box('Upgrade latex seat cost a unit')).toHaveValue('')
    expect(box('Upgrade fabric bonus a unit')).toHaveValue('50')
    expect(box('Upgrade latex seat bonus a unit')).toHaveValue('50')
    expect(box('Upgrade latex seat tier 1 from units')).toHaveValue('5')
    expect(box('Upgrade latex seat tier 1 pays')).toHaveValue('70')
    expect(box('Upgrade latex seat tier 2 from units')).toHaveValue('10')
    expect(box('Upgrade latex seat tier 2 pays')).toHaveValue('100')
    expect(screen.queryByRole('textbox', { name: 'Upgrade fabric tier 1 from units' })).not.toBeInTheDocument()
    expect(saveButton()).toBeDisabled()
    expect(saveButton()).toHaveTextContent('Save')
    expect(screen.getByRole('button', { name: 'Cancel 2990s KPI item changes' })).toBeDisabled()
    // What is left of the brand's own ERP company's sofa specials.
    expect(offered()).toEqual(['Neylon Fabric', 'Nylon Fabric', 'Separate Backrest Packing'])
  })

  it('a bonus retyped is saved alone, and the draft gives way only when the saved list arrives', async () => {
    const { data, rerender } = renderBlock()
    type('Upgrade fabric bonus a unit', '60')
    expect(screen.getByText('1 change not saved')).toBeInTheDocument()
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

  // 2026-11-13 — the user: "i need a place at kpi item rules set there fill in cost, so that it can dedecut the cost
  // out and change to kpi amount only".
  it('a cost typed is saved alone — the bonus and the tiers nobody touched left out', async () => {
    renderBlock()
    type('Upgrade latex seat cost a unit', '500')
    expect(screen.getByText('1 change not saved')).toBeInTheDocument()
    // Emptied again, or typed 0, on an item with no cost: nothing to save.
    type('Upgrade latex seat cost a unit', '')
    expect(saveButton()).toBeDisabled()
    type('Upgrade latex seat cost a unit', '0')
    expect(saveButton()).toBeDisabled()
    type('Upgrade latex seat cost a unit', ' 500 ')
    type('Upgrade fabric cost a unit', '250')
    expect(saveButton()).toHaveTextContent('Save 2 changes')
    fireEvent.click(saveButton())
    await waitFor(() => expect(saveKpiItems).toHaveBeenCalledWith(SCHEME, {
      adds: [],
      changes: [
        { id: FABRIC_ID, cost: '250', label: 'Upgrade fabric' },
        { id: LATEX_ID, cost: '500', label: 'Upgrade latex seat' },
      ],
      removes: [],
    }))
  })

  it('shows the cost an item has, saves a new one, and sends an emptied one as none', async () => {
    renderBlock({ brandKpiItems: [FABRIC, { ...LATEX, cost_amount: 500 }] })
    expect(box('Upgrade latex seat cost a unit')).toHaveValue('500')
    // Typed back to what it is: nothing to save.
    type('Upgrade latex seat cost a unit', '500.00')
    expect(saveButton()).toBeDisabled()
    type('Upgrade latex seat cost a unit', '')
    expect(saveButton()).toHaveTextContent('Save 1 change')
    fireEvent.click(saveButton())
    await waitFor(() => expect(saveKpiItems).toHaveBeenCalledWith(SCHEME, {
      adds: [], changes: [{ id: LATEX_ID, cost: null, label: 'Upgrade latex seat' }], removes: [],
    }))
  })

  // 2026-11-14 — the user: "yes need to be corner as well, if that is a compartment of corner sofa. then consider yes".
  it('a corner cost is its own box: empty is its cost, typed is saved alone, emptied is none again', async () => {
    renderBlock({ brandKpiItems: [FABRIC, { ...LATEX, cost_amount: 500 }] })
    expect(box('Upgrade latex seat corner cost a unit')).toHaveValue('')
    expect(box('Upgrade latex seat corner cost a unit')).toHaveAttribute('placeholder', 'As cost')
    type('Upgrade latex seat corner cost a unit', '1000')
    type('Upgrade fabric corner cost a unit', '250')
    expect(saveButton()).toHaveTextContent('Save 2 changes')
    fireEvent.click(saveButton())
    await waitFor(() => expect(saveKpiItems).toHaveBeenCalledWith(SCHEME, {
      adds: [],
      changes: [
        { id: FABRIC_ID, cornerCost: '250', label: 'Upgrade fabric' },
        { id: LATEX_ID, cornerCost: '1000', label: 'Upgrade latex seat' },
      ],
      removes: [],
    }))
    cleanup()
    saveKpiItems.mockClear()
    renderBlock({ brandKpiItems: [FABRIC, { ...LATEX, cost_amount: 500, corner_cost_amount: 1000 }] })
    expect(box('Upgrade latex seat corner cost a unit')).toHaveValue('1000')
    type('Upgrade latex seat corner cost a unit', '1,000.00')
    expect(saveButton()).toBeDisabled()
    type('Upgrade latex seat corner cost a unit', '')
    fireEvent.click(saveButton())
    await waitFor(() => expect(saveKpiItems).toHaveBeenCalledWith(SCHEME, {
      adds: [], changes: [{ id: LATEX_ID, cornerCost: null, label: 'Upgrade latex seat' }], removes: [],
    }))
  })

  it('says what is wrong with a corner cost before anything is sent', () => {
    renderBlock()
    type('Upgrade latex seat corner cost a unit', '-5')
    fireEvent.click(saveButton())
    expect(screen.getByRole('alert')).toHaveTextContent('Upgrade latex seat: a corner cost cannot be negative')
    expect(saveKpiItems).not.toHaveBeenCalled()
  })

  it('says what is wrong with a cost before anything is sent', () => {
    renderBlock()
    type('Upgrade latex seat cost a unit', 'five hundred')
    fireEvent.click(saveButton())
    expect(screen.getByRole('alert')).toHaveTextContent('Upgrade latex seat: cost: "five hundred" is not an amount (up to two decimals)')
    type('Upgrade latex seat cost a unit', '-5')
    fireEvent.click(saveButton())
    expect(screen.getByRole('alert')).toHaveTextContent('Upgrade latex seat: a cost cannot be negative')
    type('Upgrade latex seat cost a unit', '1000000.01')
    fireEvent.click(saveButton())
    expect(screen.getByRole('alert')).toHaveTextContent('Upgrade latex seat: a cost is at most RM 1,000,000 a unit')
    expect(saveKpiItems).not.toHaveBeenCalled()
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

  it('takes an item off — or keeps it after all — and offers its special again meanwhile', async () => {
    renderBlock()
    type('Upgrade latex seat bonus a unit', '80')
    click('Remove Upgrade latex seat')
    expect(within(bodyRows()[1]).getByText('Coming off')).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: 'Upgrade latex seat bonus a unit' })).not.toBeInTheDocument()
    expect(offered()).toEqual(['Latex Seat', 'Neylon Fabric', 'Nylon Fabric', 'Separate Backrest Packing'])
    expect(saveButton()).toHaveTextContent('Save 1 change')
    click('Keep Upgrade latex seat')
    // Its retyped bonus is still there.
    expect(box('Upgrade latex seat bonus a unit')).toHaveValue('80')
    click('Remove Upgrade latex seat')
    fireEvent.click(saveButton())
    await waitFor(() => expect(saveKpiItems).toHaveBeenCalledWith(SCHEME, { adds: [], changes: [], removes: [LATEX_ID] }))
  })

  it("adds a special of the brand's pool under a name of its own, with its cost, its bonus and a tier", async () => {
    renderBlock()
    fireEvent.change(picker(), { target: { value: 'Nylon Fabric' } })
    type('2990s new item name', 'Upgrade nylon')
    type('2990s new item cost a unit', '125')
    type('2990s new item corner cost a unit', '250')
    type('2990s new item bonus a unit', '30')
    click('Add 2990s item')
    const added = bodyRows()[2]
    expect(within(added).getAllByRole('cell')[0]).toHaveTextContent('Upgrade nylonNewNylon Fabric')
    expect(box('Upgrade nylon cost a unit')).toHaveValue('125')
    expect(box('Upgrade nylon corner cost a unit')).toHaveValue('250')
    expect(box('Upgrade nylon bonus a unit')).toHaveValue('30')
    // The picker is ready for the next one: the special picked is gone from it, the boxes are empty.
    expect(offered()).toEqual(['Neylon Fabric', 'Separate Backrest Packing'])
    expect(box('2990s new item name')).toHaveValue('')
    expect(box('2990s new item cost a unit')).toHaveValue('')
    expect(box('2990s new item corner cost a unit')).toHaveValue('')
    expect(box('2990s new item bonus a unit')).toHaveValue('')
    click('Add a tier to Upgrade nylon')
    type('Upgrade nylon tier 1 from units', '5')
    type('Upgrade nylon tier 1 pays', '45')
    expect(saveButton()).toHaveTextContent('Save 1 change')
    fireEvent.click(saveButton())
    await waitFor(() => expect(saveKpiItems).toHaveBeenCalledWith(SCHEME, {
      adds: [{
        source: 'option', optionPool: 'sofa_specials', optionValue: 'Nylon Fabric', amount: '30', brandId: BRAND_ID,
        name: 'Upgrade nylon', tiers: [{ minQty: '5', amount: '45' }], label: 'Upgrade nylon', cost: '125', cornerCost: '250',
      }],
      changes: [],
      removes: [],
    }))
  })

  it('an item added with no cost names none', async () => {
    renderBlock()
    type('2990s new item bonus a unit', '30')
    click('Add 2990s item')
    expect(box('Neylon Fabric cost a unit')).toHaveValue('')
    fireEvent.click(saveButton())
    await waitFor(() => expect(saveKpiItems).toHaveBeenCalledWith(SCHEME, {
      adds: [{
        source: 'option', optionPool: 'sofa_specials', optionValue: 'Neylon Fabric', amount: '30', brandId: BRAND_ID,
        name: null, tiers: [], label: 'Neylon Fabric',
      }],
      changes: [],
      removes: [],
    }))
  })

  it('adds the first special offered when none was picked, under its own name — and takes it off again', () => {
    renderBlock()
    click('Add 2990s item')
    expect(within(bodyRows()[2]).getAllByRole('cell')[0]).toHaveTextContent('Neylon FabricNew')
    // No bonus yet: refused by the special's name.
    fireEvent.click(saveButton())
    expect(screen.getByRole('alert')).toHaveTextContent('Neylon Fabric: give it a KPI amount')
    click('Take Neylon Fabric off')
    expect(bodyRows()).toHaveLength(2)
    expect(saveButton()).toBeDisabled()
    expect(offered()).toEqual(['Neylon Fabric', 'Nylon Fabric', 'Separate Backrest Packing'])
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
    click('Add 2990s item')
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
    expect(offered()).toEqual(['Sofa Full Fabric', 'Latex Seat', 'Neylon Fabric', 'Nylon Fabric', 'Separate Backrest Packing'])
    click('Add 2990s item')
    expect(within(table()).queryByText('2990s has no KPI items yet.')).not.toBeInTheDocument()
  })

  it('says so once every special of the pool is an item, with nothing left to add', () => {
    renderBlock({ brandKpiSpecials: POOL.slice(0, 2) })
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add 2990s item' })).not.toBeInTheDocument()
    expect(screen.getByText('2 items')).toBeInTheDocument()
  })

  it('names an item whose special the ERP no longer has — never when the pool could not be read', () => {
    renderBlock({ brandKpiSpecials: POOL.map(o => (o.value === 'Latex Seat' ? { ...o, removed: true } : o)) })
    expect(within(bodyRows()[1]).getByText('Gone from the ERP')).toBeInTheDocument()
    expect(within(bodyRows()[0]).queryByText('Gone from the ERP')).not.toBeInTheDocument()
    // A special the ERP removed is not offered either.
    expect(offered()).toEqual(['Neylon Fabric', 'Nylon Fabric', 'Separate Backrest Packing'])
    cleanup()
    renderBlock({ brandKpiSpecials: [] })
    expect(screen.queryByText('Gone from the ERP')).not.toBeInTheDocument()
  })

  it("reads the ERP's first company's sofa specials for a brand that names no company, as the database does", () => {
    const own = (value: string, pool: KpiSpecialRow['pool'], removed = false): KpiSpecialRow => ({ pool, value, label: value, sort_order: 1, removed })
    renderBlock({
      brands: [{ ...BRAND_2990S, erp_company_id: null }],
      brandKpiItems: [],
      brandKpiSpecials: [],
      kpiSpecials: [own('Wooden Arm', 'sofa_specials'), own('HB Straight', 'bedframe_specials'), own('Short Backrest', 'sofa_specials', true), own('Seat Firmer', 'sofa_specials')],
    })
    expect(offered()).toEqual(['Wooden Arm', 'Seat Firmer'])
  })

  it('keeps each brand to its own block, its own draft and its own Save', async () => {
    const OTHER = '99999999-9999-4999-8999-999999999999'
    const OTHER_ITEM = '44444444-4444-4444-8444-444444444444'
    renderBlock({
      brands: [BRAND_2990S, { ...BRAND_2990S, id: OTHER, code: 'OUTLET', name: 'Outlet', erp_company_id: 3 }],
      brandKpiItems: [...ITEMS, row(OTHER_ITEM, null, 'Recliner', [], OTHER)],
      brandKpiSpecials: [...POOL, { companyId: 3, value: 'Recliner', label: 'Recliner', sort_order: 1, removed: false }, { companyId: 3, value: 'Footrest', label: 'Electric footrest', sort_order: 2, removed: false }],
    })
    expect(bodyRows('Outlet')).toHaveLength(1)
    expect(offered('Outlet')).toEqual(['Footrest · Electric footrest'])
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

import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FabricRow, FabricUpgradeRow, MaintenanceOption } from '../load'

const { saveOptionPrices, saveFabricUpgrades, refresh } = vi.hoisted(() => ({ saveOptionPrices: vi.fn(), saveFabricUpgrades: vi.fn(), refresh: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))
vi.mock('../actions', () => ({ saveOptionPrices, saveFabricUpgrades }))

import MaintenanceTab from './MaintenanceTab'

function option(overrides: Partial<MaintenanceOption> = {}): MaintenanceOption {
  return { pool: 'bedframe_divan_heights', value: '24"', label: '24 inch', sortOrder: 0,
    active: true, removed: false, isNew: false, price: 80, byQuantity: false, ...overrides }
}
function fabric(overrides: Partial<FabricRow> = {}): FabricRow {
  return { erpId: 'fabric-a', code: 'FAB-A', description: 'Fine fabric', series: 'Linen', category: 'Imported',
    sofaTier: 'PRICE_1', bedframeTier: 'PRICE_3', priceTier: null, active: true, removed: false, ...overrides }
}
const options = [
  option({ value: 'DEFAULT', label: 'Standard', sortOrder: 10, price: 25 }),
  option(),
  option({ pool: 'sofa_leg_heights', label: '24 inch sofa leg', price: 30 }),
  option({ pool: 'sofa_leg_heights', value: 'NO-LEG', label: 'No leg', sortOrder: 1, price: 10 }),
  option({ pool: 'bedframe_gaps', value: '5CM', label: '5 cm gap', price: null }),
  option({ pool: 'bedframe_total_heights', value: '30"', label: '30 inch total', price: null }),
  option({ pool: 'sofa_sizes', value: '25"', label: '25 inch seat', price: null }),
]
function click(name: string | RegExp) { fireEvent.click(screen.getByRole('button', { name })) }
function changePrice(name: string, value: string) { fireEvent.change(screen.getByRole('textbox', { name }), { target: { value } }) }
function select(name: string, value: string) { fireEvent.change(screen.getByRole('combobox', { name }), { target: { value } }) }
function sofaLegs() { click('Sofa'); click('Leg Heights') }
/** A save's alert or status can render before its transition settles, and the
 *  pool buttons stay disabled until it does: a click in between is dropped. */
async function saveSettled() { await waitFor(() => expect(screen.getByRole('button', { name: 'Fabrics' })).toBeEnabled()) }

beforeEach(() => {
  saveOptionPrices.mockReset().mockImplementation(async (_pool, edits) => ({ saved: edits.length }))
  saveFabricUpgrades.mockReset().mockResolvedValue({ ok: true, saved: 1 })
  refresh.mockReset()
})
afterEach(cleanup)

describe('Maintenance workspace', () => {
  it('preserves ERP section/pool order and raw values, and keeps nonpriced pools read only', () => {
    render(<MaintenanceTab options={options} fabrics={[]} />)
    expect(within(screen.getByRole('group', { name: 'Maintenance sections' })).getAllByRole('button').map(button => button.textContent))
      .toEqual(['Bedframe', 'Sofa', 'Fabrics'])
    expect(within(screen.getByRole('group', { name: 'Bedframe option pools' })).getAllByRole('button').map(button => button.textContent))
      .toEqual(['Divan Heights', 'Total Heights', 'Gaps', 'Leg Heights', 'Specials'])
    const rows = within(screen.getByRole('table')).getAllByRole('row').slice(1)
    expect(rows.map(row => within(row).getAllByRole('cell')[0].textContent)).toEqual(['24"', 'DEFAULT'])
    // A bed frame's divan, leg and gap are charged to the customer (2026-10-05).
    expect(screen.getByRole('button', { name: 'Edit charges' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'CHARGE (RM)' })).toBeInTheDocument()
    click('Gaps')
    expect(screen.getByText('5CM')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Edit charges' })).toBeInTheDocument()
    // …and its total height, the same way (user 2026-10-05).
    click('Total Heights')
    expect(screen.getByText('30"')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Edit charges' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'CHARGE (RM)' })).toBeInTheDocument()
    // Every priced pool is the customer's since 2026-10-06: a special, a sofa's leg and special too.
    click('Specials')
    expect(screen.getByRole('button', { name: 'Edit charges' })).toBeInTheDocument()
    expect(screen.getByText(/ticks this special for a bed frame on the Quote. Out of the margin/)).toBeInTheDocument()
    click('Sofa')
    expect(within(screen.getByRole('group', { name: 'Sofa option pools' })).getAllByRole('button').map(button => button.textContent))
      .toEqual(['Sizes', 'Leg Heights', 'Specials'])
    expect(screen.getByText('25"')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Edit charges' })).not.toBeInTheDocument()
    expect(screen.getByText('Read only')).toBeInTheDocument()
    click('Leg Heights')
    expect(screen.getByRole('button', { name: 'Edit charges' })).toBeInTheDocument()
    expect(screen.queryByText('Read only')).not.toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'CHARGE (RM)' })).toBeInTheDocument()
    expect(screen.getByText(/once per sofa. Out of the margin/)).toBeInTheDocument()
    expect(screen.getByText('10.00')).toBeInTheDocument()
    expect(screen.queryByText(/surcharge/i)).not.toBeInTheDocument()
  })

  it('saves exact option keys across pools, preserving zero and blank charges', async () => {
    render(<MaintenanceTab options={options} fabrics={[]} />)
    click('Edit charges')
    changePrice('24 inch charge', '0')
    changePrice('Standard charge', '')
    sofaLegs()
    changePrice('24 inch sofa leg charge', '40')
    click('Bedframe')
    expect(screen.getByRole('textbox', { name: '24 inch charge' })).toHaveValue('0')
    click('Save 3 changes')
    await waitFor(() => expect(saveOptionPrices).toHaveBeenCalledTimes(2))
    expect(saveOptionPrices).toHaveBeenNthCalledWith(1, 'bedframe_divan_heights', [{ value: '24"', price: '0' }, { value: 'DEFAULT', price: '' }])
    expect(saveOptionPrices).toHaveBeenNthCalledWith(2, 'sofa_leg_heights', [{ value: '24"', price: '40' }])
    expect(await screen.findByRole('status')).toHaveTextContent('3 changes saved.')
    expect(refresh).toHaveBeenCalledOnce()
    // Zero is a charge of nothing; a cleared divan height is free of charge.
    expect(screen.getByText('0.00')).toBeInTheDocument()
    expect(screen.getByText('FOC')).toBeInTheDocument()
    await saveSettled()
    sofaLegs()
    expect(screen.getByText('40.00')).toBeInTheDocument()
  })

  // 2026-10-06: what the customer pays is never negative — on any pool.
  it('refuses a negative charge before saving anything', () => {
    render(<MaintenanceTab options={options} fabrics={[]} />)
    sofaLegs()
    click('Edit charges')
    changePrice('24 inch sofa leg charge', '-40')
    click('Save 1 change')
    expect(screen.getByRole('alert')).toHaveTextContent('a price cannot be negative')
    expect(saveOptionPrices).not.toHaveBeenCalled()
  })

  it('validates every edited pool before saving any of them and retains invalid drafts', () => {
    render(<MaintenanceTab options={options} fabrics={[]} />)
    click('Edit charges')
    changePrice('24 inch charge', '100')
    sofaLegs()
    changePrice('24 inch sofa leg charge', 'abc')
    click('Save 2 changes')
    expect(screen.getByRole('alert')).toHaveTextContent('is not an amount')
    expect(saveOptionPrices).not.toHaveBeenCalled()
    expect(screen.getByRole('textbox', { name: '24 inch sofa leg charge' })).toHaveValue('abc')
    click('Bedframe')
    expect(screen.getByRole('textbox', { name: '24 inch charge' })).toHaveValue('100')
  })

  it('keeps only failed and pending pools for retry after a partial save', async () => {
    saveOptionPrices.mockResolvedValueOnce({ saved: 1 }).mockRejectedValueOnce(new Error('Connection lost'))
    render(<MaintenanceTab options={options} fabrics={[]} />)
    click('Edit charges')
    changePrice('24 inch charge', '120')
    sofaLegs()
    changePrice('24 inch sofa leg charge', '55')
    click('Save 2 changes')
    expect(await screen.findByRole('alert')).toHaveTextContent('Connection lost')
    expect(screen.getByRole('status')).toHaveTextContent('1 change saved. Remaining changes are kept for retry.')
    expect(screen.getByRole('textbox', { name: '24 inch sofa leg charge' })).toHaveValue('55')
    await saveSettled()
    click('Bedframe')
    expect(screen.getByRole('textbox', { name: '24 inch charge' })).toHaveValue('120')
    click('Save 1 change')
    await waitFor(() => expect(saveOptionPrices).toHaveBeenCalledTimes(3))
    expect(saveOptionPrices).toHaveBeenNthCalledWith(3, 'sofa_leg_heights', [{ value: '24"', price: '55' }])
    expect(await screen.findByRole('status')).toHaveTextContent('1 change saved.')
  })

  it('disables navigation, inputs and cancel during a save; cancel otherwise clears all pool drafts', async () => {
    let resolveSave!: (result: { saved: number }) => void
    saveOptionPrices.mockImplementationOnce(() => new Promise(resolve => { resolveSave = resolve }))
    render(<MaintenanceTab options={options} fabrics={[]} />)
    click('Edit charges')
    changePrice('24 inch charge', '101')
    click('Save 1 change')
    expect(screen.getByRole('button', { name: 'Fabrics' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Sofa' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Total Heights' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cancel changes' })).toBeDisabled()
    expect(screen.getByRole('textbox', { name: '24 inch charge' })).toBeDisabled()
    await act(async () => resolveSave({ saved: 1 }))
    click('Edit charges')
    changePrice('24 inch charge', '999')
    sofaLegs()
    changePrice('24 inch sofa leg charge', '888')
    click('Cancel changes')
    click('Edit charges')
    expect(screen.getByRole('textbox', { name: '24 inch sofa leg charge' })).toHaveValue('30')
    click('Bedframe')
    expect(screen.getByRole('textbox', { name: '24 inch charge' })).toHaveValue('101')
  })

  it('shows active and inactive records in accurate counts, and includes removed records only on request', () => {
    render(<MaintenanceTab options={[option(), option({ value: 'OLD', label: 'Old option', active: false }), option({ value: 'GONE', removed: true })]} fabrics={[]} />)
    expect(screen.getByText('2 of 2 options shown')).toBeInTheDocument()
    expect(screen.getByText('Inactive')).toBeInTheDocument()
    expect(screen.queryByText('GONE')).not.toBeInTheDocument()
    // The pools have no filters of their own: Catalogue is asked on Fabrics and holds for the pools too.
    expect(screen.queryByRole('combobox', { name: 'Catalogue' })).not.toBeInTheDocument()
    click('Fabrics')
    select('Catalogue', 'all')
    click('Bedframe')
    expect(screen.getByText('3 of 3 options shown')).toBeInTheDocument()
    expect(screen.getByText('GONE')).toBeInTheDocument()
    expect(screen.getByText('Removed')).toBeInTheDocument()
    expect(screen.getByText('OLD')).toBeInTheDocument()
  })

  it('has no search box on an option pool, while Fabrics keeps its own', () => {
    render(<MaintenanceTab options={options} fabrics={[fabric()]} />)
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument()
    click('Sofa')
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument()
    click('Fabrics')
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search fabrics' }), { target: { value: 'linen' } })
    expect(screen.getByText('FAB-A')).toBeInTheDocument()
    click('Bedframe')
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument()
    expect(within(screen.getByRole('table')).getAllByRole('row')).toHaveLength(3)
  })

  it('uses newly refreshed authoritative prices instead of keeping a stale confirmed-save overlay', async () => {
    const initialOptions = [option()]
    const { rerender } = render(<MaintenanceTab options={initialOptions} fabrics={[]} />)
    click('Edit charges')
    changePrice('24 inch charge', '101')
    click('Save 1 change')
    expect(await screen.findByText('101.00')).toBeInTheDocument()
    rerender(<MaintenanceTab options={[option({ price: 102 })]} fabrics={[]} />)
    expect(screen.getByText('102.00')).toBeInTheDocument()
    expect(screen.queryByText('101.00')).not.toBeInTheDocument()
  })

  it('keeps Sofa and Bedframe fabric mappings independent, includes default P2 in tier filters, and searches series/category', () => {
    render(<MaintenanceTab options={[]} fabrics={[
      fabric(), fabric({ erpId: 'b', code: 'FAB-B', sofaTier: 'PRICE_3', bedframeTier: 'PRICE_1', series: 'Velvet' }),
      fabric({ erpId: 'c', code: 'FAB-C', sofaTier: null, bedframeTier: 'PRICE_1', category: 'Domestic' }),
      fabric({ erpId: 'd', code: 'FAB-D', sofaTier: 'PRICE_2', bedframeTier: null }),
    ]} />)
    click('Fabrics')
    const aCells = within(screen.getByText('FAB-A').closest('tr')!).getAllByRole('cell')
    expect(aCells[4]).toHaveTextContent('P1')
    expect(aCells[5]).toHaveTextContent('P3')
    select('Bedframe tier', 'PRICE_1')
    select('Sofa tier', 'PRICE_3')
    expect(screen.getByText('FAB-B')).toBeInTheDocument()
    expect(screen.queryByText('FAB-A')).not.toBeInTheDocument()
    expect(screen.queryByText('FAB-C')).not.toBeInTheDocument()
    select('Sofa tier', 'unassigned')
    expect(screen.getByText('FAB-C')).toBeInTheDocument()
    expect(screen.getByText('P2 · default')).toBeInTheDocument()
    select('Bedframe tier', '')
    select('Sofa tier', 'PRICE_2')
    expect(screen.getByText('FAB-D')).toBeInTheDocument()
    expect(screen.getByText('FAB-C')).toBeInTheDocument()
    select('Sofa tier', '')
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'velvet' } })
    expect(screen.getByText('FAB-B')).toBeInTheDocument()
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'domestic' } })
    expect(screen.getByText('FAB-C')).toBeInTheDocument()
    expect(screen.queryByText('FAB-B')).not.toBeInTheDocument()
  })

  it('uses the shared fabric tier before P2 only where the category mapping is unassigned', () => {
    render(<MaintenanceTab options={[]} fabrics={[
      fabric({ erpId: 'shared', code: 'FAB-SHARED', sofaTier: null, bedframeTier: 'PRICE_3', priceTier: 'PRICE_1' }),
      fabric({ erpId: 'override', code: 'FAB-OVERRIDE', sofaTier: 'PRICE_3', bedframeTier: 'PRICE_1', priceTier: 'PRICE_2' }),
      fabric({ erpId: 'default', code: 'FAB-DEFAULT', sofaTier: null, bedframeTier: null, priceTier: null }),
    ]} />)
    click('Fabrics')
    const shared = within(screen.getByText('FAB-SHARED').closest('tr')!).getAllByRole('cell')
    expect(shared[4]).toHaveTextContent('P1 · shared')
    expect(shared[5]).toHaveTextContent(/^P3$/)
    const overrides = within(screen.getByText('FAB-OVERRIDE').closest('tr')!).getAllByRole('cell')
    expect(overrides[4]).toHaveTextContent(/^P3$/)
    expect(overrides[5]).toHaveTextContent(/^P1$/)
    select('Sofa tier', 'PRICE_1')
    expect(screen.getByText('FAB-SHARED')).toBeInTheDocument()
    expect(screen.queryByText('FAB-DEFAULT')).not.toBeInTheDocument()
    select('Bedframe tier', 'PRICE_3')
    expect(screen.getByText('FAB-SHARED')).toBeInTheDocument()
    select('Sofa tier', 'unassigned')
    select('Bedframe tier', '')
    expect(screen.getByText('FAB-SHARED')).toBeInTheDocument()
    expect(screen.getByText('FAB-DEFAULT')).toBeInTheDocument()
    expect(screen.queryByText('FAB-OVERRIDE')).not.toBeInTheDocument()
    select('Sofa tier', 'PRICE_2')
    expect(screen.getByText('FAB-DEFAULT')).toBeInTheDocument()
    expect(screen.queryByText('FAB-SHARED')).not.toBeInTheDocument()
    expect(screen.queryByText('FAB-OVERRIDE')).not.toBeInTheDocument()
  })

  // 2026-10-26, the user: "在 sofa special 这里的 maintenance，我要它能够选择两种：一种是整 set 沙发的 … 另一种是 by quantity 的".
  it('says how a sofa special is charged — Full set or By quantity — and saves the choice with its price', async () => {
    const specials = [
      option({ pool: 'sofa_specials', value: 'Change 8030 Backcushion', label: 'Change 8030 Backcushion', price: 200, byQuantity: true }),
      option({ pool: 'sofa_specials', value: 'Seat Base Fully Cover', label: 'Seat Base Fully Cover', sortOrder: 1, price: 300 }),
      option({ pool: 'sofa_specials', value: 'Nylon Fabric', label: 'Nylon Fabric', sortOrder: 2, price: null }),
    ]
    render(<MaintenanceTab options={[...options, ...specials]} fabrics={[]} />)
    click('Sofa')
    click('Specials')
    expect(screen.getByRole('columnheader', { name: 'CHARGED' })).toBeInTheDocument()
    const charged = () => within(screen.getByRole('table')).getAllByRole('row').slice(1).map(row => within(row).getAllByRole('cell')[3].textContent)
    expect(charged()).toEqual(['By quantity', 'Full set', '—'])
    expect(screen.getByText(/Full set: once per sofa; By quantity: each, times the quantity the member sets/)).toBeInTheDocument()
    // A bed frame's specials are charged per frame: no such column there.
    click('Bedframe')
    click('Specials')
    expect(screen.queryByRole('columnheader', { name: 'CHARGED' })).not.toBeInTheDocument()

    click('Sofa')
    click('Specials')
    click('Edit charges')
    // No price, nothing to choose.
    expect(screen.getByRole('combobox', { name: 'Nylon Fabric charged' })).toBeDisabled()
    select('Seat Base Fully Cover charged', 'qty')
    changePrice('Change 8030 Backcushion charge', '180')
    click('Save 2 changes')
    await waitFor(() => expect(saveOptionPrices).toHaveBeenCalledTimes(1))
    // Each sent whole: a typed price keeps how it is charged, a choice keeps its price.
    expect(saveOptionPrices).toHaveBeenCalledWith('sofa_specials', [
      { value: 'Seat Base Fully Cover', price: '300', byQuantity: true },
      { value: 'Change 8030 Backcushion', price: '180', byQuantity: true },
    ])
    await saveSettled()
    expect(charged()).toEqual(['By quantity', 'By quantity', '—'])
  })

  it('makes every fabric reachable past the former 400-row cutoff and searches the full list', () => {
    const fabrics = Array.from({ length: 601 }, (_, index) => fabric({ erpId: String(index), code: `FAB-${String(index).padStart(3, '0')}` }))
    render(<MaintenanceTab options={[]} fabrics={fabrics} />)
    click('Fabrics')
    expect(screen.getByText('300 of 601 fabrics shown')).toBeInTheDocument()
    expect(screen.queryByText('FAB-400')).not.toBeInTheDocument()
    click('Show 300 more')
    expect(screen.getByText('FAB-400')).toBeInTheDocument()
    expect(screen.getByText('600 of 601 fabrics shown')).toBeInTheDocument()
    click('Show 1 more')
    expect(screen.getByText('FAB-600')).toBeInTheDocument()
    expect(screen.getByText('601 of 601 fabrics shown')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Show .* more/ })).not.toBeInTheDocument()
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'FAB-600' } })
    expect(screen.getByText('1 of 1 fabrics shown')).toBeInTheDocument()
  })
})

// Maintenance › Fabrics › Sofa / Bedframe upgrades (2026-10-29, the user: "先建 upgrade 再勾 series").
describe('Fabric upgrades', () => {
  const UP = '6f1d2c3b-4a5e-4f60-8a7b-9c0d1e2f3a4b'
  const upgrades: FabricUpgradeRow[] = [
    { id: UP, category: 'SOFA', name: 'Upgrade fabric', price: 200, series: ['KS', 'PC151'] },
    { id: '7a2e3d4c-5b6f-4a71-9b8c-0d1e2f3a4b5c', category: 'BEDFRAME', name: 'Upgrade fabric', price: 150, series: ['PC151'] },
  ]
  const fabrics = [
    fabric({ erpId: 'a', code: 'KS-08', series: 'KS' }), fabric({ erpId: 'b', code: 'PC151-01', series: 'PC151' }),
    fabric({ erpId: 'c', code: 'PC151-18', series: 'PC151' }), fabric({ erpId: 'd', code: 'LX-01', series: 'LX' }),
    fabric({ erpId: 'e', code: 'ZL-02', series: 'ZL' }),
  ]
  const offered = (name: string) => within(screen.getByRole('combobox', { name })).getAllByRole('option').map(o => o.textContent)
  function sofaUpgrades() { click('Fabrics'); click('Sofa upgrades') }

  it('sit under Fabrics: a name, a charge and the series ticked — a sofa once per sofa, a bed frame per frame', () => {
    render(<MaintenanceTab options={options} fabrics={fabrics} upgrades={upgrades} />)
    click('Fabrics')
    expect(within(screen.getByRole('group', { name: 'Fabrics lists' })).getAllByRole('button').map(b => b.textContent))
      .toEqual(['All fabrics', 'Sofa upgrades', 'Bedframe upgrades'])
    click('Sofa upgrades')
    expect(screen.getByRole('heading', { name: 'Fabrics · Sofa upgrades' })).toBeInTheDocument()
    expect(screen.getByText('1 upgrade · once per sofa')).toBeInTheDocument()
    expect(within(screen.getByRole('table')).getAllByRole('columnheader').map(h => h.textContent)).toEqual(['NAME', 'CHARGE (RM)', 'SERIES'])
    const [row] = within(screen.getByRole('table')).getAllByRole('row').slice(1)
    expect(within(row).getAllByRole('cell').map(cell => cell.textContent)).toEqual(['Upgrade fabric', '200.00', 'KSPC151'])
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument()
    click('Bedframe upgrades')
    expect(screen.getByText('1 upgrade · per bed frame')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Edit upgrades' })).toBeInTheDocument()
  })

  it('makes one and changes another, a series offered only where no upgrade has it — and saves only what changed', async () => {
    render(<MaintenanceTab options={options} fabrics={fabrics} upgrades={upgrades} />)
    sofaUpgrades()
    click('Edit upgrades')
    expect(offered('Tick a series for Upgrade fabric')).toEqual(['+ Series', 'LX · 1 fabric', 'ZL · 1 fabric'])
    changePrice('Upgrade fabric charge', '250')
    click('+ Add upgrade')
    fireEvent.change(screen.getByRole('textbox', { name: 'New upgrade name' }), { target: { value: 'Leather' } })
    changePrice('Leather charge', '500')
    expect(offered('Tick a series for Leather')).toEqual(['+ Series', 'LX · 1 fabric', 'ZL · 1 fabric'])
    select('Tick a series for Leather', 'LX')
    expect(offered('Tick a series for Upgrade fabric')).toEqual(['+ Series', 'ZL · 1 fabric'])
    expect(screen.getByRole('button', { name: 'Sofa upgrades 2 unsaved' })).toBeInTheDocument()
    click('Save 2 changes')
    await saveSettled()
    expect(saveFabricUpgrades).toHaveBeenCalledExactlyOnceWith('SOFA', {
      adds: [{ name: 'Leather', price: '500', series: ['LX'] }],
      changes: [{ id: UP, label: 'Upgrade fabric', price: '250' }],
      removes: [],
    })
    expect(screen.getByRole('status')).toHaveTextContent('2 changes saved.')
    expect(refresh).toHaveBeenCalledOnce()
    // Shown as saved until the page's fresh rows arrive.
    expect(within(screen.getByRole('table')).getAllByRole('row').slice(1).map(r => within(r).getAllByRole('cell')[0].textContent))
      .toEqual(['Upgrade fabric', 'LeatherNEW'])
  })

  it('unticks a series and takes an upgrade off; a refusal keeps the draft for a retry', async () => {
    saveFabricUpgrades.mockResolvedValueOnce({ ok: false, reason: 'KS is already in Leather' })
    render(<MaintenanceTab options={options} fabrics={fabrics} upgrades={upgrades} />)
    sofaUpgrades()
    click('Edit upgrades')
    click('Untick KS from Upgrade fabric')
    expect(offered('Tick a series for Upgrade fabric')).toEqual(['+ Series', 'KS · 1 fabric', 'LX · 1 fabric', 'ZL · 1 fabric'])
    click('Save 1 change')
    await saveSettled()
    expect(saveFabricUpgrades).toHaveBeenLastCalledWith('SOFA', {
      adds: [], changes: [{ id: UP, label: 'Upgrade fabric', dropSeries: ['KS'] }], removes: [],
    })
    expect(screen.getByRole('alert')).toHaveTextContent('KS is already in Leather')
    expect(refresh).not.toHaveBeenCalled()
    click('Remove Upgrade fabric')
    expect(screen.getByText('REMOVING')).toBeInTheDocument()
    click('Save 1 change')
    await saveSettled()
    expect(saveFabricUpgrades).toHaveBeenLastCalledWith('SOFA', { adds: [], changes: [], removes: [UP] })
  })

  it('checks a Save before sending it', () => {
    render(<MaintenanceTab options={options} fabrics={fabrics} upgrades={upgrades} />)
    sofaUpgrades()
    click('Edit upgrades')
    click('+ Add upgrade')
    changePrice('New upgrade charge', '100')
    click('Save 1 change')
    expect(screen.getByRole('alert')).toHaveTextContent('An upgrade has no name')
    expect(saveFabricUpgrades).not.toHaveBeenCalled()
  })
})

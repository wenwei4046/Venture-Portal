import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FabricRow, MaintenanceOption } from '../load'

const { saveOptionPrices, refresh } = vi.hoisted(() => ({ saveOptionPrices: vi.fn(), refresh: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))
vi.mock('../../catalogue-actions', () => ({ saveOptionPrices }))

import MaintenanceTab from './MaintenanceTab'

function option(overrides: Partial<MaintenanceOption> = {}): MaintenanceOption {
  return { pool: 'bedframe_divan_heights', value: '24"', label: '24 inch', sortOrder: 0,
    active: true, removed: false, isNew: false, price: 80, ...overrides }
}
function fabric(overrides: Partial<FabricRow> = {}): FabricRow {
  return { erpId: 'fabric-a', code: 'FAB-A', description: 'Fine fabric', series: 'Linen', category: 'Imported',
    sofaTier: 'PRICE_1', bedframeTier: 'PRICE_3', priceTier: null, active: true, removed: false, ...overrides }
}
const options = [
  option({ value: 'DEFAULT', label: 'Standard', sortOrder: 10, price: 25 }),
  option(),
  option({ pool: 'sofa_leg_heights', label: '24 inch sofa leg', price: 30 }),
  option({ pool: 'sofa_leg_heights', value: 'NO-LEG', label: 'No leg', sortOrder: 1, price: -10 }),
  option({ pool: 'bedframe_gaps', value: '5CM', label: '5 cm gap', price: null }),
  option({ pool: 'sofa_sizes', value: '25"', label: '25 inch seat', price: null }),
]
function click(name: string | RegExp) { fireEvent.click(screen.getByRole('button', { name })) }
function changePrice(name: string, value: string) { fireEvent.change(screen.getByRole('textbox', { name }), { target: { value } }) }
function select(name: string, value: string) { fireEvent.change(screen.getByRole('combobox', { name }), { target: { value } }) }
function sofaLegs() { click('Sofa'); click('Leg Heights') }

beforeEach(() => {
  saveOptionPrices.mockReset().mockImplementation(async (_pool, edits) => ({ saved: edits.length }))
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
    click('Gaps')
    expect(screen.getByText('5CM')).toBeInTheDocument()
    expect(screen.getByText('Read only')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Edit surcharges' })).not.toBeInTheDocument()
    expect(screen.queryByRole('columnheader', { name: 'Surcharge (RM)' })).not.toBeInTheDocument()
    click('Sofa')
    expect(within(screen.getByRole('group', { name: 'Sofa option pools' })).getAllByRole('button').map(button => button.textContent))
      .toEqual(['Sizes', 'Leg Heights', 'Specials'])
    expect(screen.getByText('25"')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Edit surcharges' })).not.toBeInTheDocument()
    click('Leg Heights')
    expect(screen.getByRole('button', { name: 'Edit surcharges' })).toBeInTheDocument()
    expect(screen.getByText('(RM 10.00)')).toBeInTheDocument()
  })

  it('saves exact option keys across pools, preserving zero, blank and negative surcharges', async () => {
    render(<MaintenanceTab options={options} fabrics={[]} />)
    click('Edit surcharges')
    changePrice('24 inch surcharge', '0')
    changePrice('Standard surcharge', '')
    sofaLegs()
    changePrice('24 inch sofa leg surcharge', '-40')
    click('Bedframe')
    expect(screen.getByRole('textbox', { name: '24 inch surcharge' })).toHaveValue('0')
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'standard' } })
    expect(screen.queryByRole('textbox', { name: '24 inch surcharge' })).not.toBeInTheDocument()
    click('Save 3 surcharges')
    await waitFor(() => expect(saveOptionPrices).toHaveBeenCalledTimes(2))
    expect(saveOptionPrices).toHaveBeenNthCalledWith(1, 'bedframe_divan_heights', [{ value: '24"', price: '0' }, { value: 'DEFAULT', price: '' }])
    expect(saveOptionPrices).toHaveBeenNthCalledWith(2, 'sofa_leg_heights', [{ value: '24"', price: '-40' }])
    expect(await screen.findByRole('status')).toHaveTextContent('3 surcharges saved.')
    expect(refresh).toHaveBeenCalledOnce()
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: '' } })
    expect(screen.getByText('RM 0.00')).toBeInTheDocument()
    sofaLegs()
    expect(screen.getByText('(RM 40.00)')).toBeInTheDocument()
  })

  it('validates every edited pool before saving any of them and retains invalid drafts', () => {
    render(<MaintenanceTab options={options} fabrics={[]} />)
    click('Edit surcharges')
    changePrice('24 inch surcharge', '100')
    sofaLegs()
    changePrice('24 inch sofa leg surcharge', 'abc')
    click('Save 2 surcharges')
    expect(screen.getByRole('alert')).toHaveTextContent('is not an amount')
    expect(saveOptionPrices).not.toHaveBeenCalled()
    expect(screen.getByRole('textbox', { name: '24 inch sofa leg surcharge' })).toHaveValue('abc')
    click('Bedframe')
    expect(screen.getByRole('textbox', { name: '24 inch surcharge' })).toHaveValue('100')
  })

  it('keeps only failed and pending pools for retry after a partial save', async () => {
    saveOptionPrices.mockResolvedValueOnce({ saved: 1 }).mockRejectedValueOnce(new Error('Connection lost'))
    render(<MaintenanceTab options={options} fabrics={[]} />)
    click('Edit surcharges')
    changePrice('24 inch surcharge', '120')
    sofaLegs()
    changePrice('24 inch sofa leg surcharge', '55')
    click('Save 2 surcharges')
    expect(await screen.findByRole('alert')).toHaveTextContent('Connection lost')
    expect(screen.getByRole('status')).toHaveTextContent('1 surcharge saved. Remaining changes are kept for retry.')
    expect(screen.getByRole('textbox', { name: '24 inch sofa leg surcharge' })).toHaveValue('55')
    click('Bedframe')
    expect(screen.getByRole('textbox', { name: '24 inch surcharge' })).toHaveValue('120')
    click('Save 1 surcharge')
    await waitFor(() => expect(saveOptionPrices).toHaveBeenCalledTimes(3))
    expect(saveOptionPrices).toHaveBeenNthCalledWith(3, 'sofa_leg_heights', [{ value: '24"', price: '55' }])
    expect(await screen.findByRole('status')).toHaveTextContent('1 surcharge saved.')
  })

  it('disables navigation, inputs and cancel during a save; cancel otherwise clears all pool drafts', async () => {
    let resolveSave!: (result: { saved: number }) => void
    saveOptionPrices.mockImplementationOnce(() => new Promise(resolve => { resolveSave = resolve }))
    render(<MaintenanceTab options={options} fabrics={[]} />)
    click('Edit surcharges')
    changePrice('24 inch surcharge', '101')
    click('Save 1 surcharge')
    expect(screen.getByRole('button', { name: 'Fabrics' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cancel changes' })).toBeDisabled()
    expect(screen.getByRole('textbox', { name: '24 inch surcharge' })).toBeDisabled()
    expect(screen.getByRole('searchbox')).toBeDisabled()
    expect(screen.getByRole('combobox', { name: 'Catalogue' })).toBeDisabled()
    await act(async () => resolveSave({ saved: 1 }))
    click('Edit surcharges')
    changePrice('24 inch surcharge', '999')
    sofaLegs()
    changePrice('24 inch sofa leg surcharge', '888')
    click('Cancel changes')
    click('Edit surcharges')
    expect(screen.getByRole('textbox', { name: '24 inch sofa leg surcharge' })).toHaveValue('30')
    click('Bedframe')
    expect(screen.getByRole('textbox', { name: '24 inch surcharge' })).toHaveValue('101')
  })

  it('shows active and inactive records in accurate counts, and includes removed records only on request', () => {
    render(<MaintenanceTab options={[option(), option({ value: 'OLD', label: 'Old option', active: false }), option({ value: 'GONE', removed: true })]} fabrics={[]} />)
    expect(screen.getByText('2 of 2 options shown')).toBeInTheDocument()
    expect(screen.getByText('Inactive')).toBeInTheDocument()
    expect(screen.queryByText('GONE')).not.toBeInTheDocument()
    select('Catalogue', 'all')
    expect(screen.getByText('3 of 3 options shown')).toBeInTheDocument()
    expect(screen.getByText('Removed')).toBeInTheDocument()
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'old' } })
    expect(screen.getByText('1 of 1 options shown')).toBeInTheDocument()
    expect(screen.getByText('OLD')).toBeInTheDocument()
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: '24"' } })
    expect(screen.getByText('24 inch')).toBeInTheDocument()
  })

  it('uses newly refreshed authoritative prices instead of keeping a stale confirmed-save overlay', async () => {
    const initialOptions = [option()]
    const { rerender } = render(<MaintenanceTab options={initialOptions} fabrics={[]} />)
    click('Edit surcharges')
    changePrice('24 inch surcharge', '101')
    click('Save 1 surcharge')
    expect(await screen.findByText('RM 101.00')).toBeInTheDocument()
    rerender(<MaintenanceTab options={[option({ price: 102 })]} fabrics={[]} />)
    expect(screen.getByText('RM 102.00')).toBeInTheDocument()
    expect(screen.queryByText('RM 101.00')).not.toBeInTheDocument()
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

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CostRatioRow, PickSku } from '../load'

const { saveCostSetting, refresh, push } = vi.hoisted(() => ({ saveCostSetting: vi.fn(), refresh: vi.fn(), push: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh, push }), usePathname: () => '/revenue/products' }))
vi.mock('../../catalogue-actions', () => ({ saveCostSetting }))

import CostSettingTab, { formatRatio } from './CostSettingTab'

const SCHEME = '9d6c1f7e-7c1d-4a8e-9f55-0b7d2d3f1a10'
const subs = [{ slug: 'fair', name: 'Fair' }, { slug: 'ir', name: 'IR' }]

function sku(overrides: Partial<PickSku>): PickSku {
  return { erpId: 'x', code: 'X', description: 'X', category: 'MATTRESS', model: 'ULTIMATE', price: 1000,
    priceLow: null, priceHigh: null, active: true, removed: false, ...overrides }
}
const skus = [
  sku({ erpId: 'ult-k', code: 'AK-ULTIMATE MATT (K)', description: 'Akemi Ultimate King', price: 1800 }),
  sku({ erpId: 'ult-q', code: 'AK-ULTIMATE MATT (Q)', description: 'Akemi Ultimate Queen', price: 1500 }),
  sku({ erpId: 'ult-s', code: 'AK-ULTIMATE MATT (S)', description: 'Akemi Ultimate Single', price: 1200 }),
  sku({ erpId: 'sofa-1a', code: '8030-1A(LHF)', description: 'Soffio 1A', category: 'SOFA', model: '8030', price: null, priceLow: 1000, priceHigh: 1400 }),
  sku({ erpId: 'gone', code: 'AK-ULTIMATE OLD', description: 'Retired', removed: true }),
]
const ultK: CostRatioRow = { erpId: 'ult-k', code: 'AK-ULTIMATE MATT (K)', ratio: 0.6, updatedAt: null }

function renderTab(ratios: CostRatioRow[] = [ultK], divisor = 0.7) {
  return render(<CostSettingTab sub={subs[0]} subs={subs} schemeId={SCHEME} divisor={divisor} ratios={ratios} skus={skus} />)
}
const click = (name: string | RegExp) => fireEvent.click(screen.getByRole('button', { name }))
const type = (name: string, value: string) => fireEvent.change(screen.getByRole('textbox', { name }), { target: { value } })
const search = (name: string, value: string) => fireEvent.change(screen.getByRole('searchbox', { name }), { target: { value } })
const bodyRows = () => within(screen.getByRole('table')).getAllByRole('row').slice(1)
const cells = (row: HTMLElement) => within(row).getAllByRole('cell').map(cell => cell.textContent)

beforeEach(() => {
  saveCostSetting.mockReset().mockResolvedValue({ saved: 1 })
  refresh.mockReset()
  push.mockReset()
})
afterEach(cleanup)

describe('Costing Setting', () => {
  it("shows the sub-department's ratio at work, and each SKU's own", () => {
    renderTab([ultK, { erpId: 'sofa-1a', code: '8030-1A(LHF)', ratio: 0.8, updatedAt: null }])
    expect(screen.getByText('÷ 0.70')).toBeInTheDocument()
    expect(screen.getByText(/of cost is judged as/)).toHaveTextContent('RM 1,000.00 of cost is judged as RM 1,428.57')
    const [king, sofa] = bodyRows()
    expect(cells(king)).toEqual(['AK-ULTIMATE MATT (K)', 'Akemi Ultimate King', 'Mattress', '1,800.00', '0.60', '3,000.00'])
    // A sofa module is priced per seat height and tier: its range, divided through.
    expect(cells(sofa)).toEqual(['8030-1A(LHF)', 'Soffio 1A', 'Sofa', '1,000.00 – 1,400.00', '0.80', '1,250.00 – 1,750.00'])
  })

  it('says so when no SKU has a ratio of its own', () => {
    renderTab([])
    expect(screen.getByText('No SKU has a ratio of its own: every SKU is divided by 0.70.')).toBeInTheDocument()
  })

  it("saves the sub-department's ratio alone", async () => {
    renderTab()
    click('Edit ratios')
    type('Fair cost ratio', '0.65')
    expect(screen.getByText(/of cost is judged as/)).toHaveTextContent('RM 1,538.46')
    click('Save 1 change')
    await waitFor(() => expect(saveCostSetting).toHaveBeenCalledWith(SCHEME, { divisor: '0.65', ratios: [] }))
    expect(await screen.findByRole('status')).toHaveTextContent('Saved.')
    expect(refresh).toHaveBeenCalled()
  })

  it('adds the SKUs ticked in the finder at one ratio', async () => {
    renderTab()
    click('Edit ratios')
    search('Find a SKU', 'ultimate')
    const finder = screen.getByRole('group', { name: 'Add SKUs' })
    // The King is on the list already; the retired SKU is not offered at all.
    expect(within(finder).getAllByRole('checkbox')).toHaveLength(3)
    expect(within(finder).getByText('On the list')).toBeInTheDocument()
    expect(within(finder).queryByText('AK-ULTIMATE OLD')).not.toBeInTheDocument()
    click('Tick all 2 shown')
    type('Ratio for the ticked SKUs', '0.6')
    click('Add 2 SKUs')
    const [queen, single, king] = bodyRows()
    expect(cells(queen).slice(0, 2)).toEqual(['AK-ULTIMATE MATT (Q)', 'Akemi Ultimate QueenNEW'])
    expect(cells(queen)[5]).toBe('2,500.00')
    expect(cells(single)[0]).toBe('AK-ULTIMATE MATT (S)')
    expect(cells(king)[0]).toBe('AK-ULTIMATE MATT (K)')
    click('Save 2 changes')
    await waitFor(() => expect(saveCostSetting).toHaveBeenCalledWith(SCHEME, {
      ratios: [
        { erpId: 'ult-q', ratio: '0.6', label: 'AK-ULTIMATE MATT (Q)' },
        { erpId: 'ult-s', ratio: '0.6', label: 'AK-ULTIMATE MATT (S)' },
      ],
    }))
  })

  it('sends a removed SKU back to the sub-department ratio, and can keep it after all', async () => {
    renderTab()
    click('Edit ratios')
    const [king] = bodyRows()
    fireEvent.click(within(king).getByRole('button', { name: 'Remove' }))
    expect(king).toHaveTextContent('BACK TO 0.70')
    expect(cells(king)[5]).toBe('2,571.43')
    fireEvent.click(within(king).getByRole('button', { name: 'Keep' }))
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled()
    fireEvent.click(within(king).getByRole('button', { name: 'Remove' }))
    click('Save 1 change')
    await waitFor(() => expect(saveCostSetting).toHaveBeenCalledWith(SCHEME, {
      ratios: [{ erpId: 'ult-k', ratio: '', label: 'AK-ULTIMATE MATT (K)' }],
    }))
  })

  it('refuses an added SKU with no ratio, and a ratio that is not one', () => {
    renderTab()
    click('Edit ratios')
    search('Find a SKU', 'queen')
    fireEvent.click(screen.getByRole('checkbox'))
    type('Ratio for the ticked SKUs', '0.6')
    click('Add 1 SKU')
    type('AK-ULTIMATE MATT (Q) ratio', '')
    click('Save 1 change')
    expect(screen.getByRole('alert')).toHaveTextContent('AK-ULTIMATE MATT (Q): give it a ratio, or take it off the list.')
    type('AK-ULTIMATE MATT (Q) ratio', '0')
    click('Save 1 change')
    expect(screen.getByRole('alert')).toHaveTextContent('AK-ULTIMATE MATT (Q): a ratio must be above 0 and at most 10')
    expect(saveCostSetting).not.toHaveBeenCalled()
  })

  it('follows a SKU the ERP renamed on the next save', async () => {
    renderTab([{ ...ultK, code: 'AKEMI ULTIMATE MATT (K)' }])
    expect(bodyRows()[0]).toHaveTextContent('Now AK-ULTIMATE MATT (K) in the ERP')
    click('Edit ratios')
    expect(screen.getByText(/1 SKU was renamed in the ERP/)).toBeInTheDocument()
    click('Save 1 change')
    await waitFor(() => expect(saveCostSetting).toHaveBeenCalledWith(SCHEME, {
      ratios: [{ erpId: 'ult-k', ratio: '0.6', label: 'AKEMI ULTIMATE MATT (K)' }],
    }))
  })

  it('keeps the drafts when the save fails', async () => {
    saveCostSetting.mockRejectedValueOnce(new Error('Two SKUs share that code — only one of them can carry its own ratio'))
    renderTab()
    click('Edit ratios')
    type('AK-ULTIMATE MATT (K) ratio', '0.55')
    click('Save 1 change')
    expect(await screen.findByRole('alert')).toHaveTextContent('Two SKUs share that code')
    expect(screen.getByRole('textbox', { name: 'AK-ULTIMATE MATT (K) ratio' })).toHaveValue('0.55')
    expect(refresh).not.toHaveBeenCalled()
  })

  it('asks before another sub-department throws the drafts away', () => {
    renderTab()
    click('IR')
    expect(push).toHaveBeenLastCalledWith('/revenue/products?tab=costing&sub=ir', { scroll: false })
    click('Edit ratios')
    type('Fair cost ratio', '0.65')
    click('IR')
    expect(screen.getByRole('alert')).toHaveTextContent('Discard them and open IR?')
    click('Keep editing')
    expect(push).toHaveBeenCalledTimes(1)
    click('IR')
    click('Discard and switch')
    expect(push).toHaveBeenCalledTimes(2)
  })

  it('prints a ratio with two decimals at least, four at most', () => {
    expect([0.7, 0.65, 0.655, 0.6543, 1].map(formatRatio)).toEqual(['0.70', '0.65', '0.655', '0.6543', '1.00'])
  })

  // Regression (prod, 2026-09-27): the drafts were cleared the moment the save
  // returned, and until the refresh landed the table showed the rows from
  // before it — an empty list right under "Saved.".
  it('keeps what was saved on screen until the refreshed rows arrive', async () => {
    const view = renderTab()
    click('Edit ratios')
    search('Find a SKU', 'queen')
    fireEvent.click(screen.getByRole('checkbox'))
    type('Ratio for the ticked SKUs', '0.6')
    click('Add 1 SKU')
    click('Save 1 change')
    expect(await screen.findByRole('status')).toHaveTextContent('Saved.')
    expect(refresh).toHaveBeenCalled()
    expect(bodyRows()[0]).toHaveTextContent('AK-ULTIMATE MATT (Q)')
    expect(screen.getByRole('textbox', { name: 'AK-ULTIMATE MATT (Q) ratio' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Saved' })).toBeDisabled()

    view.rerender(<CostSettingTab sub={subs[0]} subs={subs} schemeId={SCHEME} divisor={0.7}
      ratios={[{ erpId: 'ult-q', code: 'AK-ULTIMATE MATT (Q)', ratio: 0.6, updatedAt: null }, ultK]} skus={skus} />)
    expect(screen.getByRole('button', { name: 'Edit ratios' })).toBeEnabled()
    expect(cells(bodyRows()[0])).toEqual(['AK-ULTIMATE MATT (Q)', 'Akemi Ultimate Queen', 'Mattress', '1,500.00', '0.60', '2,500.00'])
    expect(bodyRows()).toHaveLength(2)
  })
})

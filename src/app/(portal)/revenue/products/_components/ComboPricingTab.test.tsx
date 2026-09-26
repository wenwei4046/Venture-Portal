import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ComboRow } from '../load'

const { saveComboPrices, refresh } = vi.hoisted(() => ({ saveComboPrices: vi.fn(), refresh: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))
vi.mock('../../catalogue-actions', () => ({ saveComboPrices }))

import ComboPricingTab from './ComboPricingTab'

function combo(overrides: Partial<ComboRow> = {}): ComboRow {
  return {
    erpId: 'combo-a', baseModel: '2376', modelName: 'Model A', label: 'L set',
    slots: [['1A(LHF)', '1A(RHF)'], ['1S'], ['1S']],
    slotsKey: '[["1A(LHF)", "1A(RHF)"], ["1S"], ["1S"]]', tier: 'PRICE_2',
    heights: ['DEFAULT', '24', '30'], effectiveFrom: '2026-09-24',
    prices: { '24"': 1500, '30': 1800, DEFAULT: 1300, '75CM': 1900 }, isNew: false,
    ...overrides,
  }
}

const fixtures = [combo(),
  combo({ erpId: 'combo-b', baseModel: '9999', modelName: null, label: 'Compact', tier: null, heights: ['27"'], prices: { '27"': 800 } }),
  combo({ erpId: 'combo-c', label: 'L set P1', tier: 'PRICE_1', heights: ['24'], prices: { '24': 900 } }),
]

function chooseModel(value: string) {
  fireEvent.change(screen.getByRole('combobox', { name: 'Model' }), { target: { value } })
}

function changePrice(name: string, value: string) {
  fireEvent.change(screen.getByRole('textbox', { name }), { target: { value } })
}

beforeEach(() => {
  saveComboPrices.mockReset().mockResolvedValue({ saved: 1 })
  refresh.mockReset()
})
afterEach(cleanup)

describe('Combo Pricing workspace', () => {
  it('filters the ERP definitions by model, tier and alternative module without inventing allowed sizes', () => {
    render(<ComboPricingTab combos={fixtures} />)
    chooseModel('2376')
    fireEvent.click(screen.getByRole('button', { name: 'P2' }))
    expect(screen.getAllByRole('columnheader').map(h => h.textContent)).toEqual([
      'Set', 'What is in it', 'Fabric P2', '24', '30', '75CM', 'DEFAULT',
    ])
    expect(screen.getByRole('rowheader', { name: /L set/ }).closest('tr')).toHaveTextContent('RM 1,500.00')
    expect(screen.queryByText('Compact')).not.toBeInTheDocument()
    expect(screen.queryByText('L set P1')).not.toBeInTheDocument()
    expect(screen.getByLabelText('3 modules in one set')).toHaveTextContent('1ALHF / RHF+1S×2')
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: '1A(RHF)' } })
    expect(screen.getByText('L set')).toBeInTheDocument()
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'no match' } })
    expect(screen.getByText('No combos match these filters.')).toBeInTheDocument()
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: '' } })
    chooseModel('')
    fireEvent.click(screen.getByRole('button', { name: 'All' }))
    fireEvent.click(screen.getByRole('button', { name: 'Edit Prices' }))
    const compactRow = screen.getByRole('rowheader', { name: /Compact/ }).closest('tr')!
    expect(within(compactRow).getAllByRole('textbox')).toHaveLength(1)
    expect(within(compactRow).getByRole('textbox')).toHaveAccessibleName('9999 Compact any tier at 27"')
    fireEvent.click(screen.getByRole('button', { name: 'Any' }))
    expect(screen.queryByText('L set')).not.toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Any fabric' })).toBeInTheDocument()
  })

  it('saves changes across models and tiers together while preserving untouched cells and raw saved labels', async () => {
    saveComboPrices.mockResolvedValue({ saved: 3 })
    render(<ComboPricingTab combos={fixtures} />)
    chooseModel('2376')
    fireEvent.click(screen.getByRole('button', { name: 'P2' }))
    fireEvent.click(screen.getByRole('button', { name: 'Edit Prices' }))
    changePrice('2376 L set PRICE_2 at 24', '0')
    changePrice('2376 L set PRICE_2 at DEFAULT', '')
    fireEvent.click(screen.getByRole('button', { name: 'P1' }))
    changePrice('2376 L set P1 PRICE_1 at 24', '950')
    chooseModel('9999')
    fireEvent.click(screen.getByRole('button', { name: 'Any' }))
    changePrice('9999 Compact any tier at 27"', '875')
    chooseModel('2376')
    fireEvent.click(screen.getByRole('button', { name: 'P2' }))
    expect(screen.getByRole('textbox', { name: '2376 L set PRICE_2 at 24' })).toHaveValue('0')
    expect(screen.getByRole('textbox', { name: '2376 L set PRICE_2 at DEFAULT' })).toHaveValue('')
    fireEvent.click(screen.getByRole('button', { name: 'Save 3 combos' }))
    await waitFor(() => expect(saveComboPrices).toHaveBeenCalledOnce())
    expect(saveComboPrices).toHaveBeenCalledWith([
      { baseModel: '2376', slotsKey: fixtures[0].slotsKey, tier: 'PRICE_2', prices: { '24"': '0', '30': '1800', DEFAULT: '', '75CM': '1900' } },
      { baseModel: '2376', slotsKey: fixtures[2].slotsKey, tier: 'PRICE_1', prices: { '24': '950' } },
      { baseModel: '9999', slotsKey: fixtures[1].slotsKey, tier: null, prices: { '27"': '875' } },
    ])
    await waitFor(() => expect(refresh).toHaveBeenCalledOnce())
    expect(screen.getByRole('status')).toHaveTextContent('3 combos saved')
  })

  it('retains failed edits and clears them on Cancel or when restored to the saved value', async () => {
    saveComboPrices.mockRejectedValueOnce(new Error('Could not save'))
    render(<ComboPricingTab combos={[fixtures[0]]} />)
    fireEvent.click(screen.getByRole('button', { name: 'Edit Prices' }))
    changePrice('2376 L set PRICE_2 at 24', '1550')
    fireEvent.click(screen.getByRole('button', { name: 'Save 1 combo' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not save')
    expect(screen.getByRole('textbox', { name: '2376 L set PRICE_2 at 24' })).toHaveValue('1550')
    changePrice('2376 L set PRICE_2 at 24', '1500')
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled()
    changePrice('2376 L set PRICE_2 at 24', '')
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Edit Prices' }))
    expect(screen.getByRole('textbox', { name: '2376 L set PRICE_2 at 24' })).toHaveValue('1500')
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled()
    expect(refresh).not.toHaveBeenCalled()
  })

  it('locks filters, inputs and Cancel while saving and sends the price changes only once', async () => {
    let resolveSave!: (value: { saved: number }) => void
    saveComboPrices.mockImplementation(() => new Promise(resolve => { resolveSave = resolve }))
    render(<ComboPricingTab combos={[fixtures[0]]} />)
    fireEvent.click(screen.getByRole('button', { name: 'Edit Prices' }))
    changePrice('2376 L set PRICE_2 at 24', '1550')
    fireEvent.click(screen.getByRole('button', { name: 'Save 1 combo' }))
    expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
    expect(screen.getByRole('searchbox')).toBeDisabled()
    expect(screen.getByRole('combobox')).toBeDisabled()
    expect(screen.getByRole('button', { name: 'P1' })).toBeDisabled()
    expect(screen.getByRole('textbox', { name: '2376 L set PRICE_2 at 24' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Saving…' }))
    expect(saveComboPrices).toHaveBeenCalledOnce()
    await act(async () => { resolveSave({ saved: 1 }) })
    expect(screen.getByRole('button', { name: 'Edit Prices' })).toBeEnabled()
  })

  it('shows the tiers of one set on one row and pastes an Excel block across them', () => {
    const p3 = combo({ erpId: 'combo-d', tier: 'PRICE_3', heights: ['24', '30'], prices: {} })
    render(<ComboPricingTab combos={[fixtures[0], p3, fixtures[2]]} />)
    const row = screen.getByRole('rowheader', { name: /^L set/ }).closest('tr')!
    expect(screen.getAllByRole('row')).toHaveLength(4) // two header rows, model row, one set row
    expect(within(row).getByText('RM 1,800.00')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Edit Prices' }))
    const first = screen.getByRole('textbox', { name: '2376 L set PRICE_2 at 30' })
    fireEvent.paste(first, { clipboardData: { getData: () => '1,850.00\t75\t2100\t2200\r\n' } })
    expect(first).toHaveValue('1850.00')
    expect(screen.getByRole('textbox', { name: '2376 L set PRICE_2 at 75CM' })).toHaveValue('75')
    expect(screen.getByRole('textbox', { name: '2376 L set PRICE_2 at DEFAULT' })).toHaveValue('2100')
    // The row runs on into the next fabric band: P3 24 comes after P2 DEFAULT.
    expect(screen.getByRole('textbox', { name: '2376 L set PRICE_3 at 24' })).toHaveValue('2200')
    expect(screen.getByRole('button', { name: 'Save 2 combos' })).toBeEnabled()
  })
})

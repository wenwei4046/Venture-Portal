import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ComboRow } from '../load'

const { saveComboPrices, removeCombos, refresh } = vi.hoisted(() => ({ saveComboPrices: vi.fn(), removeCombos: vi.fn(), refresh: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))
vi.mock('../actions', () => ({ saveComboPrices, removeCombos }))

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
  removeCombos.mockReset().mockResolvedValue({ ok: true, removed: 1 })
  refresh.mockReset()
})
afterEach(cleanup)

describe('Combo Pricing workspace', () => {
  it('filters the combos by model, tier and alternative module without inventing allowed sizes', () => {
    render(<ComboPricingTab combos={fixtures} />)
    chooseModel('2376')
    fireEvent.click(screen.getByRole('button', { name: 'P2' }))
    // The band row (a blank over SET and WHAT IS IN IT, then one fabric per band), then the heads.
    expect(screen.getAllByRole('columnheader').map(h => h.textContent)).toEqual([
      '\u00a0', 'FABRIC P2', 'SET', 'WHAT IS IN IT', '24', '30', '75CM', 'DEFAULT',
    ])
    expect(screen.getByRole('rowheader', { name: /L set/ }).closest('tr')).toHaveTextContent('1,500.00')
    expect(screen.queryByText('Compact')).not.toBeInTheDocument()
    expect(screen.queryByText('L set P1')).not.toBeInTheDocument()
    expect(screen.getByLabelText('3 modules in one set')).toHaveTextContent('1A(LHF)or 1A(RHF)+1S×2')
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: '1A(RHF)' } })
    expect(screen.getByText('L set')).toBeInTheDocument()
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'no match' } })
    expect(screen.getByText('No combos match these filters.')).toBeInTheDocument()
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: '' } })
    chooseModel('')
    fireEvent.click(screen.getByRole('button', { name: 'All' }))
    fireEvent.click(screen.getByRole('button', { name: 'Edit prices' }))
    const compactRow = screen.getByRole('rowheader', { name: /Compact/ }).closest('tr')!
    expect(within(compactRow).getAllByRole('textbox')).toHaveLength(1)
    expect(within(compactRow).getByRole('textbox')).toHaveAccessibleName('9999 Compact any tier at 27"')
    fireEvent.click(screen.getByRole('button', { name: 'Any' }))
    expect(screen.queryByText('L set')).not.toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'ANY FABRIC' })).toBeInTheDocument()
  })

  it('saves changes across models and tiers together while preserving untouched cells and raw saved labels', async () => {
    saveComboPrices.mockResolvedValue({ saved: 3 })
    render(<ComboPricingTab combos={fixtures} />)
    chooseModel('2376')
    fireEvent.click(screen.getByRole('button', { name: 'P2' }))
    fireEvent.click(screen.getByRole('button', { name: 'Edit prices' }))
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
    fireEvent.click(screen.getByRole('button', { name: 'Edit prices' }))
    changePrice('2376 L set PRICE_2 at 24', '1550')
    fireEvent.click(screen.getByRole('button', { name: 'Save 1 combo' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not save')
    expect(screen.getByRole('textbox', { name: '2376 L set PRICE_2 at 24' })).toHaveValue('1550')
    changePrice('2376 L set PRICE_2 at 24', '1500')
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled()
    changePrice('2376 L set PRICE_2 at 24', '')
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Edit prices' }))
    expect(screen.getByRole('textbox', { name: '2376 L set PRICE_2 at 24' })).toHaveValue('1500')
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled()
    expect(refresh).not.toHaveBeenCalled()
  })

  it('locks filters, inputs and Cancel while saving and sends the price changes only once', async () => {
    let resolveSave!: (value: { saved: number }) => void
    saveComboPrices.mockImplementation(() => new Promise(resolve => { resolveSave = resolve }))
    render(<ComboPricingTab combos={[fixtures[0]]} />)
    fireEvent.click(screen.getByRole('button', { name: 'Edit prices' }))
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
    expect(screen.getByRole('button', { name: 'Edit prices' })).toBeEnabled()
  })

  it('shows the tiers of one set on one row and pastes an Excel block across them', () => {
    const p3 = combo({ erpId: 'combo-d', tier: 'PRICE_3', heights: ['24', '30'], prices: {} })
    render(<ComboPricingTab combos={[fixtures[0], p3, fixtures[2]]} />)
    const row = screen.getByRole('rowheader', { name: /^L set/ }).closest('tr')!
    expect(screen.getAllByRole('row')).toHaveLength(4) // two header rows, model row, one set row
    expect(within(row).getByText('1,800.00')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Edit prices' }))
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

describe('Combo Pricing › Remove (combos are the portal’s own, 2026-10-08)', () => {
  it('offers Remove only in Edit prices, in a column of its own', () => {
    render(<ComboPricingTab combos={fixtures} />)
    expect(screen.queryByRole('button', { name: /^Remove / })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Edit prices' }))
    // One per SET: L set's P1 and P2 are one row, one Remove.
    expect(screen.getAllByRole('button', { name: /^Remove / }).map(b => b.getAttribute('aria-label'))).toEqual([
      'Remove 2376 L set', 'Remove 9999 Compact',
    ])
    expect(screen.getByRole('columnheader', { name: 'Remove a set' })).toBeInTheDocument()
  })

  it('takes a set away — every tier of it — and saves the prices typed on the sets that stay', async () => {
    render(<ComboPricingTab combos={fixtures} />)
    fireEvent.click(screen.getByRole('button', { name: 'Edit prices' }))
    changePrice('2376 L set PRICE_2 at 24', '1600') // typed, then the set is removed: it goes with it
    changePrice('9999 Compact any tier at 27"', '875')
    fireEvent.click(screen.getByRole('button', { name: 'Remove 2376 L set' }))

    const row = screen.getByRole('rowheader', { name: /L set/ }).closest('tr')!
    expect(row).toHaveAttribute('data-removing')
    expect(within(row).getByText('REMOVING')).toBeInTheDocument()
    expect(within(row).queryAllByRole('textbox')).toHaveLength(0)
    expect(within(row).getByText('1,500.00')).toBeInTheDocument()
    expect(screen.getByText(/1 set marked Remove; Save takes it away with its prices\./)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Save 2 changes' }))
    await waitFor(() => expect(saveComboPrices).toHaveBeenCalledOnce())
    expect(removeCombos).toHaveBeenCalledWith([{ baseModel: '2376', slotsKey: fixtures[0].slotsKey }])
    expect(removeCombos.mock.invocationCallOrder[0]).toBeLessThan(saveComboPrices.mock.invocationCallOrder[0])
    expect(saveComboPrices).toHaveBeenCalledWith([
      { baseModel: '9999', slotsKey: fixtures[1].slotsKey, tier: null, prices: { '27"': '875' } },
    ])
    expect(await screen.findByRole('status')).toHaveTextContent(
      '1 combo removed. 1 combo saved. New sales lines use these prices. To update an existing month, recost its orders in Comm Cal.',
    )
    expect(refresh).toHaveBeenCalledOnce()
  })

  it('Keep takes the mark back', () => {
    render(<ComboPricingTab combos={fixtures} />)
    fireEvent.click(screen.getByRole('button', { name: 'Edit prices' }))
    fireEvent.click(screen.getByRole('button', { name: 'Remove 9999 Compact' }))
    expect(screen.getByRole('button', { name: 'Save 1 change' })).toBeEnabled()
    fireEvent.click(screen.getByRole('button', { name: 'Keep 9999 Compact' }))
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled()
    expect(screen.queryByText('REMOVING')).not.toBeInTheDocument()
  })

  it('a removal alone says the sets no longer cost anything, and saves no prices', async () => {
    render(<ComboPricingTab combos={fixtures} />)
    fireEvent.click(screen.getByRole('button', { name: 'Edit prices' }))
    fireEvent.click(screen.getByRole('button', { name: 'Remove 9999 Compact' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save 1 change' }))
    expect(await screen.findByRole('status')).toHaveTextContent(
      '1 combo removed. New sales lines no longer use it. To update an existing month, recost its orders in Comm Cal.',
    )
    expect(saveComboPrices).not.toHaveBeenCalled()
  })

  it('a refused removal changes nothing and says why', async () => {
    removeCombos.mockResolvedValueOnce({ ok: false, reason: 'Model 9999 no longer has that combo. Refresh the page and try again.' })
    render(<ComboPricingTab combos={fixtures} />)
    fireEvent.click(screen.getByRole('button', { name: 'Edit prices' }))
    changePrice('2376 L set PRICE_2 at 24', '1600')
    fireEvent.click(screen.getByRole('button', { name: 'Remove 9999 Compact' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save 2 changes' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Model 9999 no longer has that combo.')
    expect(saveComboPrices).not.toHaveBeenCalled()
    expect(screen.getByRole('textbox', { name: '2376 L set PRICE_2 at 24' })).toHaveValue('1600')
    expect(screen.getByRole('button', { name: 'Keep 9999 Compact' })).toBeInTheDocument()
    expect(refresh).not.toHaveBeenCalled()
  })
})

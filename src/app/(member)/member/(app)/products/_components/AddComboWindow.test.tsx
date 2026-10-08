import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CatalogueSku } from '../load'

const { addCombo } = vi.hoisted(() => ({ addCombo: vi.fn() }))
vi.mock('../actions', () => ({ addCombo }))

import AddComboWindow from './AddComboWindow'

function sku(code: string, module: string): CatalogueSku {
  return {
    erpId: code, code, description: `SOFA ${code}`, category: 'SOFA', modelId: 'm-2376', modelCode: '2376', modelName: null,
    baseModel: '2376', moduleCode: module, sizeCode: null, sizeLabel: null, optionLabel: module, branding: 'ZANOTTI', brand: 'ZANOTTI',
    active: true, removed: false, isNew: false, price: null,
    grid: [{ height: '30', tier: 'PRICE_2', price: 1000 }],
    offered: false, modelOffered: false, adopted: false,
  }
}
const skus = [sku('2376-1A(R)(LHF)', '1A(R)(LHF)'), sku('2376-1A(R)(RHF)', '1A(R)(RHF)'), sku('2376-1NA', '1NA')]

function renderWindow(onAdded = vi.fn()) {
  render(<AddComboWindow open initialModel="2376" sofaSkus={skus} heights={['30']} combos={[]}
    onClose={() => {}} onAdded={onAdded} onDirtyChange={() => {}} />)
  return onAdded
}

beforeEach(() => addCombo.mockReset().mockResolvedValue({ ok: true, prices: 1 }))
afterEach(cleanup)

// User 2026-10-08: 我需要左右都算的 function — a piece that may be the left or the right arm.
describe('Add combo — a piece that may be either side', () => {
  it('offers the pair after its two sides', () => {
    renderWindow()
    const cards = screen.getAllByRole('button', { name: /^Add one / }).map(b => b.getAttribute('aria-label'))
    expect(cards).toEqual(['Add one 1A(R)(LHF)', 'Add one 1A(R)(RHF)', 'Add one 1A(R) either side', 'Add one 1NA'])
    expect(screen.getByText('LHF or RHF')).toBeInTheDocument()
  })

  it('saves it as a slot of both sides, and names the set by the pair', async () => {
    const onAdded = renderWindow()
    fireEvent.click(screen.getByRole('button', { name: 'Add one 1A(R) either side' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add one 1NA' }))
    // The strip says which piece may be either side.
    expect(screen.getAllByText('LHF or RHF')).toHaveLength(2)
    expect(screen.getByText(/has exactly 1A\(R\) \(LHF or RHF\) \+ 1NA/)).toBeInTheDocument()
    fireEvent.change(screen.getByRole('textbox', { name: 'Fabric P2 at 30' }), { target: { value: '1900' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add combo' }))
    await waitFor(() => expect(addCombo).toHaveBeenCalledOnce())
    expect(addCombo).toHaveBeenCalledWith({
      baseModel: '2376',
      modules: [['1A(R)(LHF)', '1A(R)(RHF)'], ['1NA']],
      label: '1A(R) + 1NA',
      prices: { PRICE_2: { '30': 1900 } },
    })
    await waitFor(() => expect(onAdded).toHaveBeenCalledWith({ model: '2376', label: '1A(R) + 1NA', filled: 1 }))
  })

  it('still takes one side only as its own piece', async () => {
    renderWindow()
    fireEvent.click(screen.getByRole('button', { name: 'Add one 1A(R)(LHF)' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add one 1NA' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Fabric P2 at 30' }), { target: { value: '1900' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add combo' }))
    await waitFor(() => expect(addCombo).toHaveBeenCalledOnce())
    expect(addCombo.mock.calls[0][0].modules).toEqual([['1A(R)(LHF)'], ['1NA']])
  })
})

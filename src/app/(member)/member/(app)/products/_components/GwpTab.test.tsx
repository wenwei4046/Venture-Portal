import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { GwpEntry, PickSku } from '../load'

const { saveGwp, removeGwp, refresh } = vi.hoisted(() => ({ saveGwp: vi.fn(), removeGwp: vi.fn(), refresh: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh, push: vi.fn() }), usePathname: () => '/member/products', useSearchParams: () => new URLSearchParams() }))
vi.mock('../actions', () => ({ saveGwp, removeGwp }))

import GwpTab from './GwpTab'

function sku(overrides: Partial<PickSku>): PickSku {
  return { erpId: 'x', code: 'X', description: 'X', category: 'MATTRESS', model: null, price: 1000,
    priceLow: null, priceHigh: null, active: true, removed: false, ...overrides }
}
const skus = [
  sku({ erpId: 'bas-k', code: 'AKEMI BASTION MATT (K)', description: 'Akemi Bastion King' }),
  sku({ erpId: 'bas-q', code: 'AKEMI BASTION MATT (Q)', description: 'Akemi Bastion Queen' }),
  sku({ erpId: 'mp-k', code: 'AERO-MP (K)', description: 'Mattress protector (King)', category: 'ACCESSORY', price: 90 }),
  sku({ erpId: 'mp-q', code: 'AERO-MP (Q)', description: 'Mattress protector (Queen)', category: 'ACCESSORY', price: 80 }),
  sku({ erpId: 'mf', code: 'MF PILLOW', description: 'Microfibre pillow', category: 'ACCESSORY', price: 35 }),
  sku({ erpId: 'old', code: 'OLD PILLOW', description: 'Retired pillow', category: 'ACCESSORY', removed: true }),
]
const bastion: GwpEntry = {
  id: 'gwp-1',
  buy: [{ erpId: 'bas-k', code: 'AKEMI BASTION MATT (K)' }, { erpId: 'bas-q', code: 'AKEMI BASTION MATT (Q)' }],
  gifts: [{ erpId: 'mp-k', code: 'AERO-MP (K)', qty: 1 }, { erpId: 'mf', code: 'MF PILLOW', qty: 2 }],
  updatedAt: '2026-11-08T00:00:00Z',
}

const click = (name: string | RegExp, scope: HTMLElement = document.body) => fireEvent.click(within(scope).getByRole('button', { name }))
const side = (name: 'Bought' | 'Gifts') => screen.getByRole('group', { name })
const search = (label: string, value: string) => fireEvent.change(screen.getByRole('searchbox', { name: label }), { target: { value } })
const tick = (code: string, scope: HTMLElement) => fireEvent.click(within(scope).getByRole('checkbox', { name: `Tick ${code}` }))
const more = (code: string, times = 1) => { for (let i = 0; i < times; i++) click(`One ${code} more`, side('Gifts')) }
const count = (code: string) => within(screen.getByRole('group', { name: `${code} quantity` })).getByText(/^\d+$/).textContent
const bodyRows = () => within(screen.getByRole('table')).getAllByRole('row').slice(1)
const cells = (row: HTMLElement) => within(row).getAllByRole('cell').map(cell => cell.textContent)

beforeEach(() => {
  saveGwp.mockReset().mockResolvedValue({ ok: true, id: 'gwp-new' })
  removeGwp.mockReset().mockResolvedValue({ ok: true, id: 'gwp-1' })
  refresh.mockReset()
})
afterEach(cleanup)

describe('Product List › GWP', () => {
  it('lists each GWP: what is bought, and each gift with how many a unit earns', () => {
    render(<GwpTab entries={[bastion]} skus={skus} />)
    expect(screen.getByRole('heading', { name: 'Gifts with purchase' })).toBeInTheDocument()
    expect(cells(bodyRows()[0]).slice(0, 2)).toEqual(['AKEMI BASTION MATT (K)AKEMI BASTION MATT (Q)', 'AERO-MP (K)×1MF PILLOW×2'])
    // No one number for every gift any more: each gift says its own.
    expect(screen.queryByRole('textbox', { name: 'Free per unit' })).not.toBeInTheDocument()
  })

  it('says so when there is none', () => {
    render(<GwpTab entries={[]} skus={skus} />)
    expect(screen.getByText('No GWP yet')).toBeInTheDocument()
  })

  it("adds the user's: every Bastion size, a protector ×1 and pillows ×2 — + by +", async () => {
    render(<GwpTab entries={[]} skus={skus} />)
    click('+ Add GWP')
    search('Find a SKU bought', 'bastion')
    click('Tick all 2', side('Bought'))
    search('Find a gift', 'aero')
    more('AERO-MP (K)')
    expect(count('AERO-MP (K)')).toBe('1')
    expect(count('AERO-MP (Q)')).toBe('0')
    search('Find a gift', 'pillow')
    // A SKU gone from the ERP is not offered.
    expect(within(side('Gifts')).queryByText('OLD PILLOW')).not.toBeInTheDocument()
    more('MF PILLOW', 3)
    click('One MF PILLOW less', side('Gifts'))
    expect(count('MF PILLOW')).toBe('2')
    expect(within(side('Gifts')).getByText('×2')).toBeInTheDocument()
    click('Save GWP')
    await waitFor(() => expect(saveGwp).toHaveBeenCalledWith(null, {
      buy: ['bas-k', 'bas-q'],
      gifts: [{ id: 'mp-k', qty: 1 }, { id: 'mf', qty: 2 }],
    }))
    expect(await screen.findByRole('status')).toHaveTextContent('Saved')
    expect(refresh).toHaveBeenCalled()
  })

  it('takes a gift off at 0, and adds every match at one each', () => {
    render(<GwpTab entries={[]} skus={skus} />)
    click('+ Add GWP')
    search('Find a gift', 'aero')
    click('Add all 2', side('Gifts'))
    expect([count('AERO-MP (K)'), count('AERO-MP (Q)')]).toEqual(['1', '1'])
    click('One AERO-MP (Q) less', side('Gifts'))
    expect(count('AERO-MP (Q)')).toBe('0')
    expect(within(side('Gifts')).queryByRole('button', { name: 'Take AERO-MP (Q) off' })).not.toBeInTheDocument()
    expect(within(side('Gifts')).getByRole('button', { name: 'One AERO-MP (Q) less' })).toBeDisabled()
  })

  it("keeps each search box in a row of its own, never straight in the picker's column", () => {
    // In the card's flex column the search box's flex basis (280px, a width in Costing Setting's row) became its
    // height: a box 280px tall (seen on the PR's preview, 2026-11-08).
    render(<GwpTab entries={[]} skus={skus} />)
    click('+ Add GWP')
    for (const label of ['Find a SKU bought', 'Find a gift']) {
      const box = screen.getByRole('searchbox', { name: label }).closest('label')
      expect(box?.parentElement?.getAttribute('role')).not.toBe('group')
    }
  })

  it('never lets one SKU be bought and given', () => {
    render(<GwpTab entries={[]} skus={skus} />)
    click('+ Add GWP')
    search('Find a SKU bought', 'bastion matt (q)')
    tick('AKEMI BASTION MATT (Q)', side('Bought'))
    search('Find a gift', 'bastion')
    const gifts = side('Gifts')
    expect(within(gifts).queryByRole('group', { name: 'AKEMI BASTION MATT (Q) quantity' })).not.toBeInTheDocument()
    expect(within(gifts).getByText('Bought')).toBeInTheDocument()
    expect(within(gifts).getByRole('group', { name: 'AKEMI BASTION MATT (K) quantity' })).toBeInTheDocument()
  })

  it("refuses in the page's words before anything is sent", async () => {
    render(<GwpTab entries={[]} skus={skus} />)
    click('+ Add GWP')
    search('Find a SKU bought', 'bastion')
    click('Tick all 2', side('Bought'))
    click('Save GWP')
    expect(await screen.findByRole('alert')).toHaveTextContent('Pick the gifts')
    expect(saveGwp).not.toHaveBeenCalled()
  })

  it('sends only what changed on one saved, and shows what the database refused', async () => {
    saveGwp.mockResolvedValueOnce({ ok: false, reason: 'MF PILLOW is both bought and given' })
    render(<GwpTab entries={[bastion]} skus={skus} />)
    click('Edit')
    expect(screen.getByText('EDITING')).toBeInTheDocument()
    // Saved as it was: nothing to save yet.
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled()
    search('Find a gift', 'pillow')
    more('MF PILLOW')
    click('Save changes')
    await waitFor(() => expect(saveGwp).toHaveBeenCalledWith('gwp-1', { gifts: [{ id: 'mp-k', qty: 1 }, { id: 'mf', qty: 3 }] }))
    expect(await screen.findByRole('alert')).toHaveTextContent('MF PILLOW is both bought and given')
    // A chip taken off is a change of that side alone.
    click('Take AERO-MP (K) off', side('Gifts'))
    click('Save changes')
    await waitFor(() => expect(saveGwp).toHaveBeenLastCalledWith('gwp-1', { gifts: [{ id: 'mf', qty: 3 }] }))
  })

  it('asks a second click before it removes one', async () => {
    render(<GwpTab entries={[bastion]} skus={skus} />)
    click('Remove')
    expect(removeGwp).not.toHaveBeenCalled()
    click('Click again to remove')
    await waitFor(() => expect(removeGwp).toHaveBeenCalledWith('gwp-1'))
    expect(await screen.findByRole('status')).toHaveTextContent('Removed')
  })

  it('follows a SKU the ERP renamed: shown on the list, and saved to its new code with nothing else changed', async () => {
    const renamed = skus.map(s => (s.erpId === 'mf' ? { ...s, code: 'MF PILLOW V2' } : s))
    render(<GwpTab entries={[bastion]} skus={renamed} />)
    expect(screen.getByText('now MF PILLOW V2')).toBeInTheDocument()
    click('Edit')
    click('Save changes')
    await waitFor(() => expect(saveGwp).toHaveBeenCalledWith('gwp-1', { gifts: [{ id: 'mp-k', qty: 1 }, { id: 'mf', qty: 2 }] }))
  })
})

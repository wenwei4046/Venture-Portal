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
  sku({ erpId: 'eco-q', code: 'ECOBLISS (Q)', description: 'Dunlopillo Ecobliss Queen' }),
  sku({ erpId: 'eco-k', code: 'ECOBLISS (K)', description: 'Dunlopillo Ecobliss King' }),
  sku({ erpId: 'mf', code: 'MF PILLOW', description: 'Microfibre pillow', category: 'ACCESSORY', price: 35 }),
  sku({ erpId: 'latex', code: 'LATEX PILLOW', description: 'Latex pillow', category: 'ACCESSORY', price: 60 }),
  sku({ erpId: 'old', code: 'OLD PILLOW', description: 'Retired pillow', category: 'ACCESSORY', removed: true }),
]
const eco: GwpEntry = {
  id: 'gwp-1',
  perUnit: 2,
  buy: [{ erpId: 'eco-k', code: 'ECOBLISS (K)' }, { erpId: 'eco-q', code: 'ECOBLISS (Q)' }],
  gift: [{ erpId: 'mf', code: 'MF PILLOW' }],
  updatedAt: '2026-11-08T00:00:00Z',
}

const click = (name: string | RegExp, scope: HTMLElement = document.body) => fireEvent.click(within(scope).getByRole('button', { name }))
const side = (name: 'Bought' | 'Gifts') => screen.getByRole('group', { name })
const search = (label: string, value: string) => fireEvent.change(screen.getByRole('searchbox', { name: label }), { target: { value } })
const tick = (code: string, scope: HTMLElement) => fireEvent.click(within(scope).getByRole('checkbox', { name: `Tick ${code}` }))
const bodyRows = () => within(screen.getByRole('table')).getAllByRole('row').slice(1)
const cells = (row: HTMLElement) => within(row).getAllByRole('cell').map(cell => cell.textContent)

beforeEach(() => {
  saveGwp.mockReset().mockResolvedValue({ ok: true, id: 'gwp-new' })
  removeGwp.mockReset().mockResolvedValue({ ok: true, id: 'gwp-1' })
  refresh.mockReset()
})
afterEach(cleanup)

describe('Product List › GWP', () => {
  it('lists each GWP: what is bought, the gifts and how many a unit earns', () => {
    render(<GwpTab entries={[eco]} skus={skus} />)
    expect(screen.getByRole('heading', { name: 'Gifts with purchase' })).toBeInTheDocument()
    expect(cells(bodyRows()[0]).slice(0, 3)).toEqual(['ECOBLISS (K)ECOBLISS (Q)', 'MF PILLOW', '2'])
  })

  it('says so when there is none', () => {
    render(<GwpTab entries={[]} skus={skus} />)
    expect(screen.getByText('No GWP yet')).toBeInTheDocument()
  })

  it("adds the user's example: every Ecobliss size, two microfibre pillows a unit", async () => {
    render(<GwpTab entries={[]} skus={skus} />)
    click('+ Add GWP')
    search('Find a SKU bought', 'ecobliss')
    click('Tick all 2', side('Bought'))
    search('Find a gift', 'pillow')
    // A SKU gone from the ERP is not offered.
    expect(within(side('Gifts')).queryByText('OLD PILLOW')).not.toBeInTheDocument()
    tick('MF PILLOW', side('Gifts'))
    fireEvent.change(screen.getByRole('textbox', { name: 'Free per unit' }), { target: { value: '2' } })
    click('Save GWP')
    await waitFor(() => expect(saveGwp).toHaveBeenCalledWith(null, { qty: 2, buy: ['eco-q', 'eco-k'], gift: ['mf'] }))
    expect(await screen.findByRole('status')).toHaveTextContent('Saved')
    expect(refresh).toHaveBeenCalled()
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
    search('Find a SKU bought', 'ecobliss (q)')
    tick('ECOBLISS (Q)', side('Bought'))
    search('Find a gift', 'ecobliss')
    const gifts = side('Gifts')
    expect(within(gifts).queryByRole('checkbox', { name: 'Tick ECOBLISS (Q)' })).not.toBeInTheDocument()
    expect(within(gifts).getByText('Bought')).toBeInTheDocument()
    expect(within(gifts).getByRole('checkbox', { name: 'Tick ECOBLISS (K)' })).toBeInTheDocument()
  })

  it("refuses in the page's words before anything is sent", async () => {
    render(<GwpTab entries={[]} skus={skus} />)
    click('+ Add GWP')
    search('Find a SKU bought', 'ecobliss')
    click('Tick all 2', side('Bought'))
    click('Save GWP')
    expect(await screen.findByRole('alert')).toHaveTextContent('Pick the gifts')
    expect(saveGwp).not.toHaveBeenCalled()
  })

  it('sends only what changed on one saved, and shows what the database refused', async () => {
    saveGwp.mockResolvedValueOnce({ ok: false, reason: 'MF PILLOW is both bought and given' })
    render(<GwpTab entries={[eco]} skus={skus} />)
    click('Edit')
    expect(screen.getByText('EDITING')).toBeInTheDocument()
    // Saved as it was: nothing to save yet.
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled()
    fireEvent.change(screen.getByRole('textbox', { name: 'Free per unit' }), { target: { value: '3' } })
    click('Save changes')
    await waitFor(() => expect(saveGwp).toHaveBeenCalledWith('gwp-1', { qty: 3 }))
    expect(await screen.findByRole('alert')).toHaveTextContent('MF PILLOW is both bought and given')
    // A chip taken off is a change of that side alone.
    click('Take MF PILLOW off', side('Gifts'))
    search('Find a gift', 'latex')
    tick('LATEX PILLOW', side('Gifts'))
    click('Save changes')
    await waitFor(() => expect(saveGwp).toHaveBeenLastCalledWith('gwp-1', { qty: 3, gift: ['latex'] }))
  })

  it('asks a second click before it removes one', async () => {
    render(<GwpTab entries={[eco]} skus={skus} />)
    click('Remove')
    expect(removeGwp).not.toHaveBeenCalled()
    click('Click again to remove')
    await waitFor(() => expect(removeGwp).toHaveBeenCalledWith('gwp-1'))
    expect(await screen.findByRole('status')).toHaveTextContent('Removed')
  })

  it('follows a SKU the ERP renamed: shown on the list, and saved to its new code with nothing else changed', async () => {
    const renamed = skus.map(s => (s.erpId === 'mf' ? { ...s, code: 'MF PILLOW V2' } : s))
    render(<GwpTab entries={[eco]} skus={renamed} />)
    expect(screen.getByText('now MF PILLOW V2')).toBeInTheDocument()
    click('Edit')
    click('Save changes')
    await waitFor(() => expect(saveGwp).toHaveBeenCalledWith('gwp-1', { gift: ['mf'] }))
  })
})

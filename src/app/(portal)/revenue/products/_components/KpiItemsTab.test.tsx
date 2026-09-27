import type { ReactNode } from 'react'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { KpiItemSetting, MaintenanceOption, PickSku } from '../load'

const { saveKpiItems, refresh, push } = vi.hoisted(() => ({ saveKpiItems: vi.fn(), refresh: vi.fn(), push: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh, push }), usePathname: () => '/revenue/products' }))
vi.mock('next/link', () => ({ default: ({ children, href, ...rest }: { children: ReactNode; href: string }) => <a href={href} {...rest}>{children}</a> }))
vi.mock('../../catalogue-actions', () => ({ saveKpiItems }))

import KpiItemsTab from './KpiItemsTab'

const SCHEME = '9d6c1f7e-7c1d-4a8e-9f55-0b7d2d3f1a10'
const HB = '11111111-1111-4111-8111-111111111111'
const PILLOW = '22222222-2222-4222-8222-222222222222'
const subs = [{ slug: 'fair', name: 'Fair' }, { slug: 'ir', name: 'IR' }]

const items: KpiItemSetting[] = [
  { id: PILLOW, source: 'sku', erpId: 'pillow', code: 'AK-CS PIL', name: 'Akemi cushion pillow', optionPool: null,
    optionValue: null, amount: 50, from: '2026-08-01', to: null },
  { id: HB, source: 'option', erpId: null, code: null, name: null, optionPool: 'bedframe_specials',
    optionValue: 'HB Straight', amount: 200, from: '2026-09-01', to: null },
]
const skus: PickSku[] = [
  { erpId: 'pillow', code: 'AK-CS PIL', description: 'Akemi cushion pillow', category: 'ACCESSORY', model: null,
    price: 30, priceLow: null, priceHigh: null, active: true, removed: false },
  { erpId: 'prot-k', code: 'PROT-K', description: 'Mattress protector King', category: 'ACCESSORY', model: null,
    price: 40, priceLow: null, priceHigh: null, active: true, removed: false },
]
function special(pool: string, value: string, sortOrder: number, overrides: Partial<MaintenanceOption> = {}): MaintenanceOption {
  return { pool, value, label: value, sortOrder, active: true, removed: false, isNew: false, price: null, ...overrides }
}
const specials = [
  special('bedframe_specials', 'HB Straight', 1),
  special('bedframe_specials', 'No Side Panel', 2),
  special('sofa_specials', 'Nylon Fabric', 1),
  special('sofa_specials', 'Wooden Arm', 2, { removed: true }),
]

function renderTab(enableKpi = false, list = items) {
  return render(<KpiItemsTab sub={subs[0]} subs={subs} schemeId={SCHEME} enableKpi={enableKpi} items={list} skus={skus} specials={specials} />)
}
const click = (name: string | RegExp) => fireEvent.click(screen.getByRole('button', { name }))
const type = (name: string, value: string) => fireEvent.change(screen.getByRole('textbox', { name }), { target: { value } })
const bodyRows = () => within(screen.getByRole('table')).getAllByRole('row').slice(1)
const cells = (row: HTMLElement) => within(row).getAllByRole('cell').map(cell => cell.textContent)

beforeEach(() => {
  saveKpiItems.mockReset().mockResolvedValue({ saved: 1 })
  refresh.mockReset()
  push.mockReset()
})
afterEach(cleanup)

describe('Add-on / KPI Items', () => {
  it('lists the specials, then the SKUs, with how a bill counts each', () => {
    renderTab()
    expect(bodyRows().map(cells)).toEqual([
      ['HB Straight', 'Bed frame special', 'Per bed frame', '200.00', '01 Sep 2026'],
      ['AK-CS PILAkemi cushion pillow', 'SKU', 'Per unit', '50.00', '01 Aug 2026'],
    ])
  })

  it('says when the switch is off, and where it is', () => {
    renderTab(false)
    expect(screen.getByText('Off')).toBeInTheDocument()
    expect(screen.getByText(/The run pays none of the items below/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Rules › Scheme rules' })).toHaveAttribute('href', '/revenue/fair/rules?tab=scheme')
  })

  it("adds a bed frame special from its pool, at the finder's amount", async () => {
    renderTab(true)
    click('Edit items')
    const finder = screen.getByRole('group', { name: 'Add KPI items' })
    expect(within(finder).getByText('On the list')).toBeInTheDocument()
    type('KPI amount for the next item added', '120')
    click('Add No Side Panel')
    const [added] = bodyRows()
    expect(added).toHaveTextContent('NEW')
    expect(within(added).getByRole('textbox', { name: 'No Side Panel KPI amount' })).toHaveValue('120')
    click('Save 1 change')
    await waitFor(() => expect(saveKpiItems).toHaveBeenCalledWith(SCHEME, {
      adds: [{ source: 'option', optionPool: 'bedframe_specials', optionValue: 'No Side Panel', amount: '120', label: 'No Side Panel' }],
      changes: [],
      removes: [],
    }))
    expect(await screen.findByRole('status')).toHaveTextContent("This month's run pays them")
    expect(refresh).toHaveBeenCalled()
  })

  it('never offers a special the ERP removed', () => {
    renderTab()
    click('Edit items')
    click('Sofa specials')
    expect(screen.getByRole('button', { name: 'Add Nylon Fabric' })).toBeInTheDocument()
    expect(screen.queryByText('Wooden Arm')).not.toBeInTheDocument()
  })

  it('adds a SKU from the SKU Master, and wants its amount', async () => {
    renderTab()
    click('Edit items')
    click('SKU Master')
    fireEvent.change(screen.getByRole('searchbox', { name: 'Find a SKU' }), { target: { value: 'ak-cs' } })
    expect(screen.getByText('On the list')).toBeInTheDocument()
    fireEvent.change(screen.getByRole('searchbox', { name: 'Find a SKU' }), { target: { value: 'protector' } })
    click('Add PROT-K')
    click('Save 1 change')
    expect(screen.getByRole('alert')).toHaveTextContent('PROT-K: give it a KPI amount')
    expect(saveKpiItems).not.toHaveBeenCalled()
    type('PROT-K KPI amount', '80')
    click('Save 1 change')
    await waitFor(() => expect(saveKpiItems).toHaveBeenCalledWith(SCHEME, {
      adds: [{ source: 'sku', erpId: 'prot-k', amount: '80', label: 'PROT-K' }],
      changes: [],
      removes: [],
    }))
    expect(await screen.findByRole('status')).toHaveTextContent('KPI item allowance is off for Fair')
  })

  it('changes one amount and removes another in one save', async () => {
    renderTab()
    click('Edit items')
    type('HB Straight KPI amount', '250')
    const pillow = bodyRows()[1]
    fireEvent.click(within(pillow).getByRole('button', { name: 'Remove' }))
    expect(pillow).toHaveTextContent('REMOVED ON SAVE')
    click('Save 2 changes')
    await waitFor(() => expect(saveKpiItems).toHaveBeenCalledWith(SCHEME, {
      adds: [],
      changes: [{ id: HB, amount: '250', label: 'HB Straight' }],
      removes: [PILLOW],
    }))
  })

  it('counts no change for an amount typed back to what it was', () => {
    renderTab()
    click('Edit items')
    type('HB Straight KPI amount', '200.00')
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled()
  })

  it('invites the first item when there are none', () => {
    renderTab(false, [])
    expect(screen.getByText(/No KPI items for Fair yet/)).toBeInTheDocument()
  })

  // Regression (prod, 2026-09-27): cleared at once, the drafts gave way to the
  // list from before the save until the refresh landed.
  it('keeps what was saved on screen until the refreshed items arrive', async () => {
    const view = renderTab(true)
    click('Edit items')
    type('KPI amount for the next item added', '120')
    click('Add No Side Panel')
    click('Save 1 change')
    expect(await screen.findByRole('status')).toHaveTextContent('Saved.')
    expect(refresh).toHaveBeenCalled()
    expect(bodyRows()[0]).toHaveTextContent('No Side Panel')
    expect(within(bodyRows()[0]).getByRole('textbox', { name: 'No Side Panel KPI amount' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Saved' })).toBeDisabled()

    const saved: KpiItemSetting = { id: '33333333-3333-4333-8333-333333333333', source: 'option', erpId: null, code: null, name: null,
      optionPool: 'bedframe_specials', optionValue: 'No Side Panel', amount: 120, from: '2026-09-27', to: null }
    view.rerender(<KpiItemsTab sub={subs[0]} subs={subs} schemeId={SCHEME} enableKpi items={[...items, saved]} skus={skus} specials={specials} />)
    expect(screen.getByRole('button', { name: 'Edit items' })).toBeEnabled()
    expect(bodyRows().map(cells)).toEqual([
      ['HB Straight', 'Bed frame special', 'Per bed frame', '200.00', '01 Sep 2026'],
      ['No Side Panel', 'Bed frame special', 'Per bed frame', '120.00', '27 Sep 2026'],
      ['AK-CS PILAkemi cushion pillow', 'SKU', 'Per unit', '50.00', '01 Aug 2026'],
    ])
  })
})

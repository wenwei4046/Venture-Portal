import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { productBookFromRow } from '@/lib/marketing/products'

// 2026-10-23 — the Product Builder (`Product Builder.dc.html`, ③ of the handoff) for the manager who prices what
// Marketing sells: the list by status, a new product, the editor saving only what changed on the draft it was made on,
// the sum of actions as the price, the margin, a workflow made for an action, Publish, Retire. The database's side is
// tests/member-sql/validate-marketing-products.mjs.

const actions = vi.hoisted(() => ({
  saveMktProduct: vi.fn(),
  publishMktProduct: vi.fn(),
  setMktProductStatus: vi.fn(),
  saveMktWorkflow: vi.fn(),
  deleteMktProduct: vi.fn(),
}))
vi.mock('@/lib/marketing/actions', () => actions)
const router = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => router }))

import ProductBuilder from './ProductBuilder'

const SMA = {
  id: 'p1', code: 'PRD-26001', name: 'Social Media Package A', description: '', kind: 'recurring', status: 'active',
  groups: [{ name: 'Graphic design', items: [{ name: 'Image posts', qty: 4, price: 450, workflow: 'w1' }] }],
  intake: 'm1', price: 4800, cost: 3100, effectiveFrom: '2026-11-01', rev: 4, version: 3, changed: false, live: 6,
  history: [{ version: 3, at: '2026-10-01T01:00:00Z', note: '4 image posts / month', by: 'Sia Josiah' }],
}
const DRAFT = { id: 'p2', code: 'PRD-26002', name: 'Brand Book', description: '', kind: 'one', status: 'draft', groups: [], intake: null, price: null, cost: null,
  effectiveFrom: null, rev: 1, version: 0, changed: true, live: 0, history: [] }
const RETIRED = { ...SMA, id: 'p3', code: 'PRD-25009', name: 'Social Media Package B', status: 'retired', retiredOn: '2026-07-31', live: 2, version: 2, price: 3200 }
const BOOK = {
  products: [SMA, DRAFT, RETIRED],
  workflows: [{ id: 'w1', action: 'Design photo', tname: 'Simple', version: 1, stages: 2, days: 3, pic: 1 }],
  minutes: [{ id: 'm1', name: 'Kickoff', version: 2, fields: 9 }],
}

beforeEach(() => {
  for (const f of [...Object.values(actions), ...Object.values(router)]) f.mockReset()
  let rev = 4
  actions.saveMktProduct.mockImplementation(async (id: string | null) => ({ ok: true, id: id ?? 'p9', code: 'PRD-26003', rev: id ? ++rev : 1, book: null }))
})

const builder = (first: string | null = null) => render(<ProductBuilder initial={productBookFromRow(BOOK)} first={first} />)

describe('the Product Builder', () => {
  it('lists the products by status, prices only behind the lock', () => {
    builder()
    expect(screen.getByRole('tab', { name: /All\s*3/ })).toBeTruthy()
    fireEvent.click(screen.getByRole('tab', { name: /Retired\s*1/ }))
    expect(screen.getByText('Social Media Package B')).toBeTruthy()
    expect(screen.queryByText('Brand Book')).toBeNull()
    expect(screen.getByText(/Retired 31\/07\/2026 · 2 projects still running on v2/)).toBeTruthy()
    fireEvent.click(screen.getByRole('tab', { name: /All\s*3/ }))
    expect(screen.getByText('🔒 RM 4,800.00/mo')).toBeTruthy()
  })

  it('a new product opens with its code made', async () => {
    const made = { ...DRAFT, id: 'p9', code: 'PRD-26003', name: '' }
    actions.saveMktProduct.mockResolvedValue({ ok: true, id: 'p9', code: 'PRD-26003', rev: 1, book: productBookFromRow({ ...BOOK, products: [...BOOK.products, made] }) })
    builder()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '+ New product' }))
    })
    expect(actions.saveMktProduct).toHaveBeenCalledWith(null, null, { kind: 'one' })
    expect(await screen.findByText('PRD-26003')).toBeTruthy()
    expect(router.replace).toHaveBeenCalledWith('/marketing/products?p=p9', { scroll: false })
  })

  it('a change undone before its save goes sends nothing and says Saved', async () => {
    // 2026-10-23: an action added and removed within 0.7 s left *Saving…* up for good, Publish lit (the walk).
    builder('p1')
    fireEvent.click(screen.getByRole('button', { name: 'One more' }))
    expect(screen.getByText('Saving…')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'One less' }))
    await waitFor(() => expect(screen.getByText('Saved')).toBeTruthy(), { timeout: 3000 })
    expect(actions.saveMktProduct).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Publish v4' })).toHaveProperty('disabled', true)
  })

  it('saves only what changed, on the draft it was made on; the sum of actions as the price; the margin', async () => {
    builder('p1')
    expect(screen.getByText('35%')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'One more' }))
    await waitFor(() => expect(actions.saveMktProduct).toHaveBeenCalledTimes(1), { timeout: 3000 })
    const [id, rev, patch] = actions.saveMktProduct.mock.calls[0]
    expect([id, rev, Object.keys(patch)]).toEqual(['p1', 4, ['groups']])
    expect(patch.groups[0].items[0]).toEqual({ name: 'Image posts', qty: 5, price: 450, workflow: 'w1' })

    fireEvent.click(screen.getByRole('button', { name: /Use sum of actions \(RM 2,250\.00 \/ month\)/ }))
    await waitFor(() => expect(actions.saveMktProduct).toHaveBeenCalledTimes(2), { timeout: 3000 })
    expect(actions.saveMktProduct.mock.calls[1]).toEqual(['p1', 5, { price: 2250 }])
    expect(screen.getByText('-38%')).toBeTruthy()
  })

  it('+ New action workflow makes the action’s Standard template and links it', async () => {
    builder('p2')
    fireEvent.change(screen.getByRole('textbox', { name: 'New category' }), { target: { value: 'Brand' } })
    fireEvent.click(screen.getByRole('button', { name: '+ Add category' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Action' }), { target: { value: 'Brand book' } })
    actions.saveMktWorkflow.mockResolvedValue({ ok: true, id: 'w9', rev: 1, workflows: null })
    await act(async () => {
      fireEvent.change(screen.getByRole('combobox', { name: 'Workflow' }), { target: { value: '__new' } })
    })
    const [, , wf] = actions.saveMktWorkflow.mock.calls[0]
    expect([wf.action, wf.tname, wf.note]).toEqual(['Brand book', 'Standard', 'Used by “Brand book” in Brand Book'])
    expect((screen.getByRole('combobox', { name: 'Workflow' }) as HTMLSelectElement).value).toBe('w9')
    expect(screen.getByRole('link', { name: 'Open in Workflow Builder' }).getAttribute('href')).toBe('/marketing/workflows?w=w9')
  })

  it('publishes once every section is complete — the reason shows until then', async () => {
    builder('p2')
    expect(screen.getByRole('button', { name: 'Publish v1' })).toHaveProperty('disabled', true)
    expect(screen.getByText('Add what the product includes')).toBeTruthy()
  })

  it('publishes the draft as saved', async () => {
    builder('p1')
    fireEvent.click(screen.getByRole('button', { name: 'One more' }))
    actions.publishMktProduct.mockResolvedValue({ ok: true, version: 4, effectiveFrom: '2026-11-01', live: 6, book: null })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Publish v4' }))
    })
    await waitFor(() => expect(actions.publishMktProduct).toHaveBeenCalledWith('p1', 5))
    expect(await screen.findByText('Published Social Media Package A v4 · effective 01/11/2026')).toBeTruthy()
  })

  it('deletes a product still a draft, asked first — back to the list; one on sale is retired instead (answer 8)', async () => {
    actions.deleteMktProduct.mockResolvedValue({ ok: true, book: productBookFromRow({ ...BOOK, products: [SMA, RETIRED] }) })
    const { unmount } = builder('p1')
    expect(screen.queryByRole('button', { name: 'Delete draft' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Retire product' })).toBeTruthy()
    unmount()
    builder('p2')
    fireEvent.click(screen.getByRole('button', { name: 'Delete draft' }))
    await act(async () => {
      fireEvent.click(within(screen.getByRole('group', { name: 'Delete this product?' })).getByRole('button', { name: 'Delete' }))
    })
    expect(actions.deleteMktProduct).toHaveBeenCalledWith('p2', 1)
    expect(await screen.findByText('Deleted Brand Book')).toBeTruthy()
    expect(screen.getByRole('tab', { name: /All\s*2/ })).toBeTruthy()
    expect(router.replace).toHaveBeenLastCalledWith('/marketing/products', { scroll: false })
  })

  it('retired: read-only, Reactivate', async () => {
    builder('p3')
    expect(screen.getByText(/Retired on 31\/07\/2026\./)).toBeTruthy()
    expect(screen.getByRole('textbox', { name: 'Action' })).toHaveProperty('disabled', true)
    expect(screen.queryByRole('button', { name: /Publish/ })).toBeNull()
    actions.setMktProductStatus.mockResolvedValue({ ok: true, status: 'active', live: 2, book: null })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Reactivate' }))
    })
    expect(actions.setMktProductStatus).toHaveBeenCalledWith('p3', 'reactivate')
    expect(await screen.findByText('Social Media Package B is active again')).toBeTruthy()
    expect(within(document.body).queryByText('Not saved')).toBeNull()
  })
})

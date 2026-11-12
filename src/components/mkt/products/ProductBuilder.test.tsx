import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { useState } from 'react'
import { productBookFromRow, type ProductBook } from '@/lib/marketing/products'
import type { CatalogItem } from '@/lib/marketing/catalog'

// 2026-10-23 — the Product Builder (`Product Builder.dc.html`, ③ of the handoff) for the manager who prices what
// Marketing sells: the list by status, a new product, the editor saving only what changed on the draft it was made on,
// the sum of items as the price, the margin, a workflow made for an item, Publish, Retire. 2026-11-12
// (docs/design_handoff_product_builder/): ⧉ Duplicate, the right-click status menu (Active asks for a publish first),
// items picked from the Product List (price and workflow filled in, its days read from it; a new name added to it).
// The database's side is tests/member-sql/validate-marketing-products.mjs and validate-marketing-quotes.mjs.

const actions = vi.hoisted(() => ({
  saveMktProduct: vi.fn(),
  publishMktProduct: vi.fn(),
  setMktProductStatus: vi.fn(),
  saveMktWorkflow: vi.fn(),
  deleteMktProduct: vi.fn(),
  setMktProductAccount: vi.fn(),
}))
vi.mock('@/lib/marketing/actions', () => actions)
const quoteActions = vi.hoisted(() => ({ duplicateMktProduct: vi.fn(), setMktProductStatusTo: vi.fn() }))
vi.mock('@/lib/marketing/quote-actions', () => quoteActions)

import ProductBuilder from './ProductBuilder'

const SMA = {
  id: 'p1', code: 'PRD-26001', name: 'Social Media Package A', description: '', kind: 'recurring', status: 'active',
  groups: [{ name: 'Graphic design', items: [{ name: 'Image posts', qty: 4, price: 450, workflow: 'w1' }] }],
  intake: 'm1', price: 4800, cost: 3100, account: '5013', effectiveFrom: '2026-11-01', rev: 4, version: 3, changed: false, live: 6,
  history: [{ version: 3, at: '2026-10-01T01:00:00Z', note: '4 image posts / month', by: 'Sia Josiah' }],
}
const DRAFT = { id: 'p2', code: 'PRD-26002', name: 'Brand Book', description: '', kind: 'one', status: 'draft', groups: [], intake: null, price: null, cost: null,
  effectiveFrom: null, rev: 1, version: 0, changed: true, live: 0, history: [] }
const RETIRED = { ...SMA, id: 'p3', code: 'PRD-25009', name: 'Social Media Package B', status: 'retired', retiredOn: '2026-07-31', live: 2, version: 2, price: 3200 }
const BOOK = {
  products: [SMA, DRAFT, RETIRED],
  workflows: [{ id: 'w1', action: 'Design photo', tname: 'Simple', version: 1, stages: 2, days: 3, pic: 1 }, { id: 'w2', action: 'Reels', tname: 'Standard', version: 1, stages: 1, days: 2, pic: 0 }],
  minutes: [{ id: 'm1', name: 'Kickoff', version: 2, fields: 9 }],
  accounts: [{ code: '5012', name: 'Revenue - Lead Gen' }, { code: '5013', name: 'Video Shooting' }, { code: '5019', name: 'Design Income' }],
}
const ITEMS: CatalogItem[] = [
  { id: 'i1', cat: 'Graphic design', name: 'Image posts', desc: 'A static post', price: 450, cost: 200, days: 3, remarks: '', wf: 'w1', extra: {} },
  { id: 'i2', cat: 'Video', name: 'Reels video', desc: 'A 30s reel', price: 900, cost: null, days: 5, remarks: '', wf: 'w2', extra: {} },
]

const router = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => router }))
const onOpen = vi.fn()
const onAddItem = vi.fn()
const onItemFacts = vi.fn()
const onQuote = vi.fn()

/** The tab as the Product Builder hosts it: the book and the toast are the host's. */
function Harness({ initial, first }: { initial: ProductBook; first: string | null }) {
  const [book, setBook] = useState(initial)
  const [toast, setToast] = useState<string | null>(null)
  return (
    <>
      <ProductBuilder book={book} setBook={setBook} first={first} onOpen={onOpen} items={ITEMS} onAddItem={onAddItem} onItemFacts={onItemFacts} onQuote={onQuote} onPublished={() => {}} flash={setToast} />
      {toast ? <div role="status">{toast}</div> : null}
    </>
  )
}
const builder = (first: string | null = null, book = BOOK) => render(<Harness initial={productBookFromRow(book)} first={first} />)

beforeEach(() => {
  for (const f of [...Object.values(actions), ...Object.values(quoteActions), ...Object.values(router), onOpen, onAddItem, onItemFacts, onQuote]) f.mockReset()
  let rev = 4
  actions.saveMktProduct.mockImplementation(async (id: string | null) => ({ ok: true, id: id ?? 'p9', code: 'PRD-26003', rev: id ? ++rev : 1, book: null }))
})

describe('the Product Builder', () => {
  it('lists the products by status, prices only behind the lock', () => {
    builder()
    expect(screen.getByRole('tab', { name: /All\s*3/ })).toBeTruthy()
    fireEvent.click(screen.getByRole('tab', { name: /Retired\s*1/ }))
    expect(screen.getByText('Social Media Package B')).toBeTruthy()
    expect(screen.queryByText('Brand Book')).toBeNull()
    expect(screen.getByText(/Retired 31\/07\/2026 · 2 projects still running on v2/)).toBeTruthy()
    fireEvent.click(screen.getByRole('tab', { name: /All\s*3/ }))
    expect(screen.getByText('🔒 RM 4,800/mo')).toBeTruthy()
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
    expect(onOpen).toHaveBeenCalledWith('p9')
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

  it('saves only what changed, on the draft it was made on; the sum of items as the price; the margin', async () => {
    builder('p1')
    expect(screen.getByText('35%')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'One more' }))
    await waitFor(() => expect(actions.saveMktProduct).toHaveBeenCalledTimes(1), { timeout: 3000 })
    const [id, rev, patch] = actions.saveMktProduct.mock.calls[0]
    expect([id, rev, Object.keys(patch)]).toEqual(['p1', 4, ['groups']])
    expect(patch.groups[0].items[0]).toEqual({ name: 'Image posts', qty: 5, price: 450, workflow: 'w1' })

    fireEvent.click(screen.getByRole('button', { name: /Use sum of items \(RM 2,250 \/ month\)/ }))
    await waitFor(() => expect(actions.saveMktProduct).toHaveBeenCalledTimes(2), { timeout: 3000 })
    expect(actions.saveMktProduct.mock.calls[1]).toEqual(['p1', 5, { price: 2250 }])
    expect(screen.getByText('-38%')).toBeTruthy()
  })

  it('an item reads its days from the Product List, and picking one fills its price and workflow', async () => {
    builder('p2')
    fireEvent.change(screen.getByRole('textbox', { name: 'New category' }), { target: { value: 'Video' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add category' }))
    const name = screen.getByRole('textbox', { name: 'Item' })
    fireEvent.focus(name)
    const list = screen.getByRole('listbox', { name: 'The Product List' })
    // The catalogue matching the category comes first, tagged.
    expect(within(list).getAllByText(/Video|Graphic design/).map(n => n.textContent)).toEqual(['Video', 'Graphic design'])
    expect(within(list).getByText('this category')).toBeTruthy()
    fireEvent.mouseDown(within(list).getByRole('option', { name: /Reels video/ }))
    expect((screen.getByRole('textbox', { name: 'Item' }) as HTMLInputElement).value).toBe('Reels video')
    expect((screen.getByRole('textbox', { name: 'Unit price' }) as HTMLInputElement).value).toBe('900')
    expect((screen.getByRole('combobox', { name: 'Workflow' }) as HTMLSelectElement).value).toBe('w2')
    expect((screen.getByRole('textbox', { name: 'Est. days' }) as HTMLInputElement).value).toBe('5')
    // Not the Product List's workflow: said under it.
    fireEvent.change(screen.getByRole('combobox', { name: 'Workflow' }), { target: { value: 'w1' } })
    expect(screen.getByText('Not the Product List’s workflow')).toBeTruthy()
  })


  it('days and the manager’s columns set on an item are the Product List’s — sent there, the item’s name and category with them', () => {
    builder('p1')
    const days = screen.getByRole('textbox', { name: 'Est. days' }) as HTMLInputElement
    expect(days.value).toBe('3')
    fireEvent.change(days, { target: { value: '7' } })
    expect(onItemFacts).toHaveBeenLastCalledWith('Image posts', 'Graphic design', 450, 'w1', { days: 7 })
    fireEvent.change(days, { target: { value: '900' } })
    expect(onItemFacts).toHaveBeenLastCalledWith('Image posts', 'Graphic design', 450, 'w1', { days: 365 })
    fireEvent.change(days, { target: { value: '' } })
    expect(onItemFacts).toHaveBeenLastCalledWith('Image posts', 'Graphic design', 450, 'w1', { days: null })
  })

  it('a retired product’s days are the list’s to read only; an empty item has none to set', () => {
    builder('p3')
    expect((screen.getByRole('textbox', { name: 'Est. days' }) as HTMLInputElement).disabled).toBe(true)
  })
  it('a name not on the Product List says so, and is added there on leaving the box', () => {
    builder('p2')
    fireEvent.change(screen.getByRole('textbox', { name: 'New category' }), { target: { value: 'Events' } })
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'New category' }), { key: 'Enter' })
    const name = screen.getByRole('textbox', { name: 'Item' })
    fireEvent.focus(name)
    fireEvent.change(name, { target: { value: 'Roadshow booth' } })
    expect(screen.getByText('“Roadshow booth” isn’t in the Product List — it will be added under Events')).toBeTruthy()
    fireEvent.blur(name)
    expect(onAddItem).toHaveBeenCalledWith('Roadshow booth', 'Events', null, null)
  })

  it('+ New workflow makes the item’s Standard template and links it', async () => {
    builder('p2')
    fireEvent.change(screen.getByRole('textbox', { name: 'New category' }), { target: { value: 'Brand' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add category' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Item' }), { target: { value: 'Brand book' } })
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
    expect(onOpen).toHaveBeenLastCalledWith(null)
  })

  it('retired: read-only, Reactivate', async () => {
    builder('p3')
    expect(screen.getByText(/Retired on 31\/07\/2026\./)).toBeTruthy()
    expect(screen.getByRole('textbox', { name: 'Item' })).toHaveProperty('disabled', true)
    expect(screen.queryByRole('button', { name: /Publish/ })).toBeNull()
    actions.setMktProductStatus.mockResolvedValue({ ok: true, status: 'active', live: 2, book: null })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Reactivate' }))
    })
    expect(actions.setMktProductStatus).toHaveBeenCalledWith('p3', 'reactivate')
    expect(await screen.findByText('Social Media Package B is active again')).toBeTruthy()
    expect(within(document.body).queryByText('Not saved')).toBeNull()
  })

  it('⧉ Duplicate on a card makes a new draft and opens it', async () => {
    const copy = { ...SMA, id: 'p8', code: 'PRD-26004', name: 'Social Media Package A (copy)', status: 'draft', version: 0, rev: 1, history: [], live: 0 }
    quoteActions.duplicateMktProduct.mockResolvedValue({ ok: true, id: 'p8', book: productBookFromRow({ ...BOOK, products: [...BOOK.products, copy] }) })
    builder()
    const card = screen.getByText('Social Media Package A').closest('[role="button"]') as HTMLElement
    await act(async () => {
      fireEvent.click(within(card).getByRole('button', { name: '⧉ Duplicate' }))
    })
    expect(quoteActions.duplicateMktProduct).toHaveBeenCalledWith('p1')
    expect(onOpen).toHaveBeenCalledWith('p8')
    expect(await screen.findByText('Duplicated Social Media Package A — a new draft')).toBeTruthy()
  })

  it('right-click: the status at once — Draft for one on sale; Active for one never published asks for a publish first', async () => {
    quoteActions.setMktProductStatusTo.mockResolvedValue({ ok: true, book: null, quotes: null })
    builder()
    fireEvent.contextMenu(screen.getByText('Social Media Package A'))
    const menu = screen.getByRole('menu', { name: 'Social Media Package A' })
    expect(within(menu).getByRole('menuitemradio', { name: /Active/ }).getAttribute('aria-checked')).toBe('true')
    expect(within(menu).getByRole('menuitemradio', { name: /Draft/ }).getAttribute('title')).toBe('Hidden from quotations while you work on it')
    await act(async () => {
      fireEvent.click(within(menu).getByRole('menuitemradio', { name: /Draft/ }))
    })
    expect(quoteActions.setMktProductStatusTo).toHaveBeenCalledWith('p1', 'draft')
    expect(await screen.findByText('Social Media Package A moved to draft')).toBeTruthy()

    fireEvent.contextMenu(screen.getByText('Brand Book'))
    fireEvent.click(within(screen.getByRole('menu', { name: 'Brand Book' })).getByRole('menuitemradio', { name: /Active/ }))
    const dialog = screen.getByRole('dialog', { name: 'Publish before activating' })
    expect(within(dialog).getByText(/Please publish “Brand Book” before making it active\./)).toBeTruthy()
    expect(within(dialog).getByText('Add what the product includes')).toBeTruthy()
    expect(quoteActions.setMktProductStatusTo).toHaveBeenCalledTimes(1)
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Open product' }))
    })
    expect(onOpen).toHaveBeenLastCalledWith('p2')
  })

  it('a product on sale opens a quotation with it', () => {
    builder('p1')
    fireEvent.click(screen.getByRole('button', { name: '📄 New quotation' }))
    expect(onQuote).toHaveBeenCalledWith(expect.objectContaining({ id: 'p1' }))
  })

  // ②b-2h (2026-10-26): the revenue account Finance's import posts a product's billing to — Finance's list, set once.
  it('its revenue account: Finance’s list, saved the moment it is picked — no draft, no new version', async () => {
    builder('p1')
    const select = screen.getByRole('combobox', { name: 'Revenue account' }) as HTMLSelectElement
    expect(select.value).toBe('5013')
    expect([...select.options].map(o => o.textContent)).toEqual(['Pick an account…', '5012 · Revenue - Lead Gen', '5013 · Video Shooting', '5019 · Design Income'])
    actions.setMktProductAccount.mockResolvedValue({ ok: true, account: '5019' })
    await act(async () => {
      fireEvent.change(select, { target: { value: '5019' } })
    })
    expect(actions.setMktProductAccount).toHaveBeenCalledWith('p1', '5019')
    expect(actions.saveMktProduct).not.toHaveBeenCalled()
    expect(await screen.findByText('Revenue account saved · 5019 · Design Income')).toBeTruthy()
    expect(select.value).toBe('5019')
    actions.setMktProductAccount.mockResolvedValue({ ok: true, account: null })
    await act(async () => {
      fireEvent.change(select, { target: { value: '' } })
    })
    expect(actions.setMktProductAccount).toHaveBeenLastCalledWith('p1', null)
    expect(await screen.findByText('Revenue account cleared')).toBeTruthy()
  })

  it('an account Finance closed still shows as the product’s; a refusal is said; a retired product’s account is still set', async () => {
    const { unmount } = builder('p1', { ...BOOK, products: [{ ...SMA, account: '5016' }, DRAFT, RETIRED] })
    const select = screen.getByRole('combobox', { name: 'Revenue account' }) as HTMLSelectElement
    expect(select.value).toBe('5016')
    expect(select.options[1].textContent).toBe("5016 · no longer on Finance's list")
    actions.setMktProductAccount.mockResolvedValue({ ok: false, reason: 'Pick its revenue account from the list.' })
    await act(async () => {
      fireEvent.change(select, { target: { value: '5012' } })
    })
    expect(await screen.findByText('Pick its revenue account from the list.')).toBeTruthy()
    unmount()
    builder('p3')
    expect(screen.getByRole('combobox', { name: 'Revenue account' })).toHaveProperty('disabled', false)
  })
})

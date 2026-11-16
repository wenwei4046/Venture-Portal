import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { useState } from 'react'
import { listPrefsFromRow, type CatalogItem, type ItemColumn, type ListPrefs } from '@/lib/marketing/catalog'
import { productBookFromRow } from '@/lib/marketing/products'
import { quoteFromRow } from '@/lib/marketing/quotes'

// 2026-11-16 — the Product List v2 (docs/design_handoff_product_builder_v2/ §5): a row's right-click (Internal only,
// Delete item…), every item deleted out of drafts only, a column head's right-click (Item and Price locked, Cost always
// internal), a catalogue's icon, the Margin column.

const actions = vi.hoisted(() => ({
  deleteMktItem: vi.fn(), deleteMktItemColumn: vi.fn(), orderMktItemColumns: vi.fn(), renameMktCatalogue: vi.fn(),
  saveMktItem: vi.fn(), saveMktItemColumn: vi.fn(), saveMktListPrefs: vi.fn(), setMktItemInternal: vi.fn(),
}))
vi.mock('@/lib/marketing/quote-actions', () => actions)

import CatalogTab from './CatalogTab'

const item = (x: Partial<CatalogItem> & Pick<CatalogItem, 'id' | 'name'>): CatalogItem => ({
  cat: 'Graphic design', desc: '', price: 450, cost: 280, days: 2, remarks: '', wf: null, extra: {}, internal: false, ...x,
})
const ITEMS = [item({ id: 'i1', name: 'Image posts' }), item({ id: 'i2', name: 'Reels', cat: 'Video', price: 1200, cost: 1000 })]
const PRODUCTS = productBookFromRow({ products: [{ id: 'p1', code: 'PRD-26001', name: 'Pack', status: 'active', groups: [{ name: 'D', items: [{ name: 'Image posts', qty: 4, price: 450 }] }] }] }).products
const QUOTES = [
  quoteFromRow({ id: 'q1', no: 'QT-2611-001', status: 'draft', lines: [{ kind: 'item', key: 'a', item: 'i1', name: 'Image posts', list: 450, qty: 1 }] }),
  quoteFromRow({ id: 'q2', no: 'QT-2611-002', status: 'sent', lines: [{ kind: 'item', key: 'b', item: 'i1', name: 'Image posts', list: 450, qty: 1 }] }),
]
const flash = vi.fn()
const onRenamed = vi.fn()

function Harness() {
  const [items, setItems] = useState(ITEMS)
  const [columns, setColumns] = useState<ItemColumn[]>([])
  const [prefs, setPrefs] = useState<ListPrefs>(listPrefsFromRow({}))
  return (
    <CatalogTab items={items} setItems={fn => setItems(fn)} columns={columns} setColumns={fn => setColumns(fn)} prefs={prefs} setPrefs={fn => setPrefs(fn)}
      products={PRODUCTS} quotes={QUOTES} workflows={[]} onRenamed={onRenamed} flash={flash} />
  )
}

beforeEach(() => {
  for (const f of [...Object.values(actions), flash, onRenamed]) f.mockReset()
  actions.setMktItemInternal.mockResolvedValue({ ok: true })
  actions.saveMktListPrefs.mockResolvedValue({ ok: true })
})

const row = (name: string) => (screen.getByDisplayValue(name).closest('[style]') as HTMLElement)

describe('the Product List v2', () => {
  it('each catalogue its icon and jump chip; Margin worked out, red below 20%; no Save button', () => {
    render(<Harness />)
    expect(screen.getByRole('button', { name: 'Icon for Graphic design' }).textContent).toContain('🎨')
    expect(within(screen.getByRole('navigation', { name: 'Catalogues' })).getByRole('button', { name: /Video/ })).toBeTruthy()
    expect(within(row('Image posts')).getByText('38%')).toBeTruthy()
    expect(within(row('Reels')).getByText('17%').className).toMatch(/red/)
    expect(screen.queryByRole('button', { name: /^Save/ })).toBeNull()
    expect(screen.getByText('All changes saved')).toBeTruthy()
  })

  it('a row right-clicked: Internal only marks it and saves at once', async () => {
    render(<Harness />)
    fireEvent.contextMenu(row('Image posts'))
    const menu = screen.getByRole('menu', { name: 'Image posts' })
    await act(async () => {
      fireEvent.click(within(menu).getByRole('menuitemcheckbox', { name: /Internal only/ }))
    })
    expect(actions.setMktItemInternal).toHaveBeenCalledWith('i1', true)
    expect(within(row('Image posts')).getByTitle('Internal only · not shown to the client').textContent).toBe('🔒 Internal')
  })

  it('Delete item… says what it takes out of drafts and what keeps it; deleted, the books come back', async () => {
    actions.deleteMktItem.mockResolvedValue({ ok: true, drafts: ['QT-2611-001'], products: 1, book: null, productBook: null })
    render(<Harness />)
    fireEvent.contextMenu(row('Image posts'))
    fireEvent.click(within(screen.getByRole('menu', { name: 'Image posts' })).getByRole('menuitem', { name: 'Delete item…' }))
    const dialog = screen.getByRole('dialog', { name: 'Delete Image posts' })
    expect(within(dialog).getByText(/Removed from 1 package \(drafts; published versions keep it\)/)).toBeTruthy()
    expect(within(dialog).getByText(/Removed from 1 draft quotation · QT-2611-001/)).toBeTruthy()
    expect(within(dialog).getByText(/Kept in 1 sent \/ accepted quotation · QT-2611-002 — the client has seen it/)).toBeTruthy()
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Delete item' }))
    })
    expect(actions.deleteMktItem).toHaveBeenCalledWith('i1')
    expect(screen.queryByDisplayValue('Image posts')).toBeNull()
    expect(flash).toHaveBeenLastCalledWith('Deleted “Image posts” · removed from 1 draft quotation')
  })

  it('a column head right-clicked: Item and Price locked and required, Cost always internal; Remarks set internal or removed', async () => {
    render(<Harness />)
    const head = (name: string) => screen.getAllByText(name, { selector: 'span' })[0]
    fireEvent.contextMenu(head('Price'))
    let menu = screen.getByRole('menu', { name: 'Column Price' })
    expect(within(menu).getByRole('menuitemcheckbox', { name: /Internal only/ })).toHaveProperty('disabled', true)
    expect(within(menu).getByRole('menuitem', { name: /Delete column/ })).toHaveProperty('disabled', true)
    fireEvent.keyDown(window, { key: 'Escape' })
    fireEvent.contextMenu(head('Cost'))
    menu = screen.getByRole('menu', { name: 'Column Cost' })
    expect(within(menu).getByRole('menuitemcheckbox', { name: /Internal only/ }).getAttribute('aria-checked')).toBe('true')
    expect(within(menu).getByText('Always internal · cost is never shown')).toBeTruthy()
    fireEvent.keyDown(window, { key: 'Escape' })
    fireEvent.contextMenu(head('Remarks'))
    await act(async () => {
      fireEvent.click(within(screen.getByRole('menu', { name: 'Column Remarks' })).getByRole('menuitem', { name: 'Delete column' }))
    })
    expect(actions.saveMktListPrefs).toHaveBeenCalledWith('columns', expect.objectContaining({ remarks: { internal: false, hidden: true } }))
    expect(screen.queryAllByLabelText('Remarks')).toHaveLength(0)
  })

  it('a catalogue’s icon is picked from the popover and saved', async () => {
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: 'Icon for Video' }))
    const pop = screen.getByRole('dialog', { name: 'Icon for Video' })
    await act(async () => {
      fireEvent.click(within(pop).getByRole('option', { name: '🎤' }))
    })
    expect(actions.saveMktListPrefs).toHaveBeenCalledWith('icons', { Video: '🎤' })
    expect(screen.getByRole('button', { name: 'Icon for Video' }).textContent).toContain('🎤')
  })
})

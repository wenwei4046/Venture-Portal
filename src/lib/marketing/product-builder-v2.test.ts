import { describe, expect, it } from 'vitest'
import { catalogueIcon, deleteImpact, itemMargin, listPrefsFromRow, type CatalogItem } from './catalog'
import { itemsSummary, pricedOf, productDiff, type ProductGroup } from './products'
import { clientLines, clientShows, quoteTotals, withExtras, type QuoteLine } from './quotes'

// The Product Builder v2 (2026-11-16, docs/design_handoff_product_builder_v2/): the list price and cost follow the
// items, Publish shows what changed, an internal item is off the client's PDF but in every sum (the user's answer the
// same day), what deleting an item does, the Product List's settings.

const item = (x: Partial<CatalogItem> & Pick<CatalogItem, 'id' | 'name'>): CatalogItem => ({
  cat: 'Graphic design', desc: '', price: null, cost: null, days: null, remarks: '', wf: null, extra: {}, internal: false, ...x,
})
const POST = item({ id: 'i1', name: 'Image post', price: 450, cost: 200 })
const REEL = item({ id: 'i2', name: 'Reel', cat: 'Video', price: 900, cost: null })
const g = (name: string, items: [string, number, number | null][]): ProductGroup => ({
  key: name, name, items: items.map(([n, qty, price]) => ({ key: n, name: n, qty, price, workflow: null })),
})

describe('pricedOf — the list price and cost are the items’', () => {
  it('price Σ unit × qty; cost Σ the Product List’s cost × qty; an item with no cost is counted as missing', () => {
    expect(pricedOf([g('Design', [['Image post', 4, 450], ['Reel', 2, 900]])], [POST, REEL])).toEqual({ price: 3600, cost: 800, missing: 1 })
  })
  it('none while nothing is priced, none while no item has a cost', () => {
    expect(pricedOf([], [POST])).toEqual({ price: null, cost: null, missing: 0 })
    expect(pricedOf([g('Video', [['Reel', 1, 900]])], [REEL])).toEqual({ price: 900, cost: null, missing: 1 })
  })
})

describe('productDiff — the draft against the version last published', () => {
  const last = { version: 3, groups: [g('Design', [['Image post', 4, 450], ['Banner', 1, 300]])], price: 2100, cost: 900 }
  it('Added, Removed and Qty; the price and cost before → after, better or worse', () => {
    const d = productDiff({ groups: [g('Design', [['Image post', 5, 450]]), g('Video', [['Reel', 2, 900]])], price: 4050, cost: 1100, version: 3, last, changed: true })
    expect([d.from, d.to, d.same]).toEqual([3, 4, false])
    expect(d.items).toEqual([
      { name: 'Image post', from: 4, to: 5, tag: 'qty' },
      { name: 'Reel', from: null, to: 2, tag: 'added' },
      { name: 'Banner', from: 1, to: null, tag: 'removed' },
    ])
    expect(d.price).toEqual({ from: 2100, to: 4050, better: true })
    expect(d.cost).toEqual({ from: 900, to: 1100, better: false })
    expect(d.margin).toEqual({ from: 57, to: 73, better: true })
  })
  it('nothing changed: same', () => {
    expect(productDiff({ groups: last.groups, price: 2100, cost: 900, version: 3, last, changed: false }).same).toBe(true)
  })
  it('never published: every item Added', () => {
    const d = productDiff({ groups: [g('Design', [['Image post', 1, 450]])], price: 450, cost: null, version: 0, last: null, changed: true })
    expect(d.items).toEqual([{ name: 'Image post', from: null, to: 1, tag: 'added' }])
    expect([d.from, d.to, d.same]).toEqual([0, 1, false])
  })
  it('the Items header’s summary', () => {
    expect(itemsSummary([g('Design', [['Image post', 4, 450], ['Banner', 0, 300]]), g('Video', [['Reel', 2, 900]])])).toBe('4 image post + 2 reel')
  })
})

describe('an internal item: off the client’s PDF, in every sum (the user, 2026-11-16)', () => {
  const line = (id: string, name: string, list: number, cost: number | null): QuoteLine => ({
    key: id, kind: 'item', item: id, name, cat: '', list, cost, days: 3, qty: 1, price: null, eta: '2026-12-01', remark: 'two rounds',
  })
  const core = { discount: 0, lines: [line('i1', 'Image post', 450, 200), line('i2', 'Reel', 900, 300)] }
  const internal = [POST, { ...REEL, internal: true }]
  it('the line is left off the client’s document; the totals still count it', () => {
    const q = withExtras(core, internal, [])
    const shown = clientLines(q.lines, clientShows(null))
    expect(shown.map(x => x.shown.name)).toEqual(['Image post'])
    expect(quoteTotals(q).total).toBe(1350)
    expect(quoteTotals(q).cost).toBe(500)
  })
  it('a package keeps its whole price; only its internal items leave what it includes', () => {
    const pkg: QuoteLine = {
      key: 'p', kind: 'package', product: 'p1', name: 'Pack', code: 'PRD-26001', pkind: 'one', version: 1, list: 1800, cost: 800, months: 1,
      price: null, eta: null, remark: '', items: [{ name: 'Image post', group: 'D', base: 2, qty: 2, unit: 450 }, { name: 'Reel', group: 'V', base: 1, qty: 1, unit: 900 }],
    }
    const q = withExtras({ discount: 0, lines: [pkg] }, internal, [])
    const [{ line: whole, shown }] = clientLines(q.lines, clientShows(null))
    expect(shown.kind === 'package' && shown.items.map(i => i.name)).toEqual(['Image post'])
    expect(whole.kind === 'package' && whole.items.length).toBe(2)
  })
  it('a built-in column set internal: its remark or est. delivery off the client’s document', () => {
    const prefs = listPrefsFromRow({ columns: { remarks: { internal: true }, days: { hidden: true } } })
    const [{ shown }] = clientLines(core.lines, clientShows(prefs))
    expect([shown.remark, shown.eta]).toEqual(['', null])
    expect(clientLines(core.lines, clientShows(listPrefsFromRow({})))[0].shown.remark).toBe('two rounds')
  })
})

describe('deleting an item takes it out of drafts only', () => {
  it('products’ drafts and draft quotations lose it; sent and accepted quotations keep it', () => {
    const products = [{ groups: [g('D', [['Image post', 2, 450]])], status: 'active' }, { groups: [g('D', [['Image post', 1, 450]])], status: 'retired' }]
    const quotes = [
      { no: 'QT-2611-001', status: 'draft', lines: [{ kind: 'item', item: 'i1' }] },
      { no: 'QT-2611-002', status: 'sent', lines: [{ kind: 'item', item: 'i1' }] },
      { no: 'QT-2611-003', status: 'accepted', lines: [{ kind: 'package', items: [{ name: 'image post' }] }] },
      { no: 'QT-2611-004', status: 'draft', lines: [{ kind: 'package', items: [{ name: 'Image post' }] }] },
    ]
    expect(deleteImpact(POST, products, quotes)).toEqual({ products: 1, drafts: ['QT-2611-001'], kept: ['QT-2611-002', 'QT-2611-003'] })
  })
})

describe('the Product List’s settings', () => {
  it('a catalogue’s icon: the manager’s, else the design’s default, else 📁', () => {
    const prefs = listPrefsFromRow({ icons: { Video: '🎤' } })
    expect([catalogueIcon(prefs, 'Video'), catalogueIcon(prefs, 'graphic design'), catalogueIcon(prefs, 'Events')]).toEqual(['🎤', '🎨', '📁'])
  })
  it('an item’s margin: whole per cent, none without both', () => {
    expect([itemMargin(450, 200), itemMargin(450, null), itemMargin(0, 10)]).toEqual([56, null, null])
  })
})

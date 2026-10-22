import { describe, expect, it } from 'vitest'
import {
  editOfProduct, groupsPayload, includedText, itemsSum, margin, newGroup, productBookFromRow, productPatch, productProblems, productSections, ringgitOf,
  type Product,
} from './products'

// 2026-10-23 — the Product Builder (`Product Builder.dc.html`, ③ of the handoff): what the builder reads, sums, ticks
// and refuses, held to what mkt_product_publish refuses (tests/member-sql/validate-marketing-products.mjs).

const row = {
  products: [
    { id: 'p1', code: 'PRD-26001', name: 'Social Media Package A', description: 'Monthly social media.', kind: 'recurring', status: 'active',
      groups: [{ name: 'Graphic design', items: [{ name: 'Image posts', qty: 4, price: 450, workflow: 'w1' }, { name: 'Banners', qty: 0, price: '600.50', workflow: 'w1' }] },
        { name: 'Video', items: [{ name: 'Reels', qty: 2, price: 1200, workflow: 'w2' }] }],
      intake: 'm1', price: 4800, cost: 3100, effectiveFrom: '2026-11-01', rev: 4, version: 3, changed: false, live: 6,
      history: [{ version: 3, at: '2026-10-23T01:00:00Z', note: '4 image posts + 2 reels / month', by: 'Sia Josiah' }] },
  ],
  workflows: [{ id: 'w1', action: 'Design photo', tname: 'Simple', version: 1, stages: 2, days: 3, pic: 1 }, { id: 'w2', action: 'Reels video', tname: 'Standard', version: 0, stages: 5, days: 8, pic: 1 }],
  minutes: [{ id: 'm1', name: 'Kickoff', version: 2, fields: 9 }],
}
const book = productBookFromRow(row)
const p = book.products[0]

describe('what the builder reads', () => {
  it('each product with what it includes, its prices, its versions', () => {
    expect([p.code, p.kind, p.status, p.price, p.cost, p.version, p.live]).toEqual(['PRD-26001', 'recurring', 'active', 4800, 3100, 3, 6])
    expect(p.groups[0].items[1].price).toBe(600.5)
    expect(p.history[0]).toEqual({ version: 3, at: '2026-10-23T01:00:00Z', note: '4 image posts + 2 reels / month', by: 'Sia Josiah' })
    expect(book.workflows.map(w => w.version)).toEqual([1, 0])
    expect(book.minutes[0]).toEqual({ id: 'm1', name: 'Kickoff', version: 2, fields: 9 })
  })

  it('reads nothing as no products', () => {
    expect(productBookFromRow(null)).toEqual({ products: [], workflows: [], minutes: [] })
  })
})

describe('sums and words', () => {
  it('what it includes, without what it has none of', () => {
    expect(includedText(p.groups)).toBe('4 image posts + 2 reels')
    expect(includedText([newGroup('Video')].map(g => ({ ...g, items: [{ ...g.items[0], name: ' ' }] })))).toBe('Nothing added yet')
  })

  it('the sum of every action, a category’s too', () => {
    expect(itemsSum(p.groups)).toBe(4200)
  })

  it('the margin on the list price, whole per cent', () => {
    expect(margin(4800, 3100)).toBe(35)
    expect(margin(1500, 1250)).toBe(17)
    expect(margin(4800, null)).toBeNull()
    expect(margin(null, 100)).toBeNull()
  })

  it('typed ringgit: digits and two decimals', () => {
    expect(ringgitOf('RM 4,800')).toBe(4800)
    expect(ringgitOf('12.')).toBe(12)
    expect(ringgitOf('12.345')).toBeUndefined()
    expect(ringgitOf('')).toBeNull()
  })
})

describe('the five sections and publishing', () => {
  it('ticks each section once it is complete', () => {
    expect(productSections(p).map(s => s.done)).toEqual([true, true, true, true, true])
    const fresh: Product = { ...p, name: '', groups: [], intake: null, price: null, effectiveFrom: null }
    expect(productSections(fresh).map(s => s.done)).toEqual([false, false, false, false, false])
  })

  it('refuses what the database would', () => {
    expect(productProblems(p, book)).toEqual(['A linked workflow is not published yet'])
    const published = { ...book, workflows: book.workflows.map(w => ({ ...w, version: 1 })) }
    expect(productProblems(p, published)).toEqual([])
    expect(productProblems({ ...p, groups: [{ ...p.groups[0], items: [{ ...p.groups[0].items[0], workflow: null }] }] }, published)).toEqual(['Link a workflow to each action'])
    expect(productProblems({ ...p, intake: null, price: 0, effectiveFrom: null }, published)).toEqual(['Pick its intake minutes template', 'Set its list price', 'Pick the day it takes effect'])
    expect(productProblems({ ...p, status: 'retired' }, published)).toEqual(['A retired product is read-only — reactivate it first'])
  })
})

describe('only what changed is saved', () => {
  const saved = editOfProduct(p)

  it('nothing changed: nothing to send — the page’s keys are not the product', () => {
    expect(productPatch(saved, { ...saved, groups: saved.groups.map(g => ({ ...g, key: 'k', items: g.items.map(it => ({ ...it, key: 'k' })) })) })).toBeNull()
  })

  it('each part on its own', () => {
    expect(productPatch(saved, { ...saved, price: 5000, cost: null })).toEqual({ price: 5000, cost: null })
    const groups = [...saved.groups, newGroup('Ads')]
    expect(productPatch(saved, { ...saved, groups })).toEqual({ groups: groupsPayload(groups) })
    expect(groupsPayload([newGroup(' Ads ')])).toEqual([{ name: 'Ads', items: [{ name: '', qty: 1, price: null, workflow: null }] }])
  })
})

import { describe, expect, it } from 'vitest'
import { extrasOf, extraText, factsPayload, itemPatch, itemsCost, mergeFacts, pickerGroups, usedIn, withFacts, type CatalogItem, type ItemColumn } from './catalog'
import {
  addDays, buildTasks, coreOf, dmy, extrasWords, includedOf, itemLine, lineCalc, lineExtrasWords, packageLine, quoteCsv, quoteFromRow, quoteTotals, rm, sameCore,
  teamOf, termOf, withExtras,
  type PackageLine, type QuoteCore,
} from './quotes'

// 2026-11-12 — the Product Builder's quotations (docs/design_handoff_product_builder/): the design's money and days, a
// line's sums (as the database's mkt_quote_subtotal — tests/member-sql/validate-marketing-quotes.mjs runs the same
// figures), the totals and margin, "edited since", the CSV, the tasks an accepted quotation turns into; the Product
// List's picker and where an item is used.

const REEL: CatalogItem = { id: 'i1', cat: 'Video', name: 'Reel', desc: '', price: 800, cost: 300, days: 5, remarks: '2 rounds', wf: null, extra: {} }
const POST: CatalogItem = { id: 'i2', cat: 'Graphic design', name: 'Image post', desc: 'A post', price: 120, cost: null, days: null, remarks: '', wf: null, extra: {} }
const PACK = { id: 'p1', code: 'PRD-26001', name: 'Social Starter', kind: 'recurring' as const, version: 1, price: 1500, cost: 600,
  groups: [{ name: 'Video', items: [{ name: 'Reel', qty: 2, price: 800 }] }] }

describe("the design's money and days", () => {
  it('money as the design writes it', () => {
    expect([rm(4800), rm(1234.5), rm(null), rm(0)]).toEqual(['RM 4,800', 'RM 1,234.5', '—', 'RM 0'])
  })
  it('a day is a day — never through UTC', () => {
    expect(dmy('2026-11-12')).toBe('12/11/2026')
    expect(addDays('2026-12-30', 5)).toBe('2027-01-04')
    expect(addDays('2026-11-12', 0)).toBe('2026-11-12')
  })
})

describe('a quotation', () => {
  it('an item line: one at its list price, due its est. days after the quote date, its remarks', () => {
    const l = itemLine(REEL, '2026-11-12')
    expect([l.qty, l.price, l.list, l.eta, l.remark]).toEqual([1, null, 800, '2026-11-17', '2 rounds'])
    expect(itemLine(POST, '2026-11-12').eta).toBeNull()
  })

  it('sums as the database does: (2 × 800 + (1500 + 800) × 6) × 0.9 = 13,860', () => {
    const pack: PackageLine = { ...packageLine(PACK), items: [{ name: 'Reel', group: 'Video', base: 2, qty: 3, unit: 800 }] }
    const core: Pick<QuoteCore, 'lines' | 'discount'> = { discount: 10, lines: [{ ...itemLine(REEL, ''), qty: 2 }, pack] }
    const t = quoteTotals(core)
    expect([t.sub, t.list, t.total]).toEqual([15400, 10600, 13860])
    expect(t.monthly).toBe(2070)
    // A package's cost moves with its items at its own ratio (600 / 1500): (600 + 800 × .4) × 6 = 5,520; the reel 600.
    expect(t.cost).toBe(6120)
    expect(t.margin).toBe(56)
    expect(termOf(pack)).toBe('6 months × RM 2,300')
    expect(includedOf(pack)).toBe('3 reel per month')
  })

  it('a price set by hand wins; Reset brings the list back', () => {
    const pack = { ...packageLine(PACK), price: 1200 }
    expect(lineCalc(pack).amount).toBe(7200)
    expect(lineCalc({ ...pack, price: null }).amount).toBe(9000)
  })

  it('no cost on a line: no margin', () => {
    expect(quoteTotals({ discount: 0, lines: [itemLine(POST, '')] }).margin).toBeNull()
  })

  it('edited since: what was sent against what it is now, whatever the order of keys or an empty remark', () => {
    const q = quoteFromRow({ id: 'q', no: 'QT-2611-001', sub: 's', date: '2026-11-12', valid: 30, discount: 0, note: '', lines: [itemLine(REEL, '')], history: [] })
    const sent = JSON.parse(JSON.stringify(coreOf(q, 'Carres'))) as QuoteCore
    sent.lines = sent.lines.map(l => ({ ...l, remark: undefined as unknown as string }))
    expect(sameCore(coreOf({ ...q, lines: q.lines.map(l => ({ ...l, remark: '' })) }, 'Carres'), sent)).toBe(true)
    expect(sameCore(coreOf({ ...q, discount: 5 }, 'Carres'), sent)).toBe(false)
  })

  it('the internal pricing sheet as CSV — its columns, a package’s items, the totals', () => {
    const q = { ...quoteFromRow({ no: 'QT-2611-001', date: '2026-11-12', discount: 0, note: '' }), lines: [packageLine(PACK)], client: 'Carres' }
    const csv = quoteCsv(q, 'Carres', '3033 · AR - Carres').split('\n')
    expect(csv[0]).toBe('"Quotation","QT-2611-001"')
    expect(csv[2]).toBe('"Account","3033 · AR - Carres"')
    expect(csv[5]).toBe('"Product / item","Code","Term","Item","Qty","Unit price","List","Quoted","Cost","Profit","Margin %","Est. delivery","Remarks"')
    expect(csv[6]).toBe('"Social Starter","PRD-26001","6 months","","","","9000","9000","3600","5400","60","",""')
    expect(csv[7]).toBe('"","","","Reel","2","800"')
    expect(csv.at(-1)).toBe('"Total","","","","","","","9000","3600","5400","60"')
  })
})

describe('tasks from an accepted quotation', () => {
  it('an item one task, a package one per item with a quantity; the team by the catalogue; due = start + est. days', () => {
    const lines = [{ ...itemLine(REEL, '2026-11-12'), qty: 2 }, { ...packageLine(PACK), items: [{ name: 'Reel', group: 'Video', base: 2, qty: 2, unit: 800 }, { name: 'Image post', group: 'Graphic design', base: 1, qty: 0, unit: 120 }] }]
    const rows = buildTasks({ lines }, [REEL, POST], '2026-11-20', t => (t === 'Content' ? 'mei' : null))
    expect(rows.map(r => [r.name, r.from, r.team, r.who, r.start, r.due])).toEqual([
      ['Reel × 2', 'One-off item · 2 rounds', 'Content', 'mei', '2026-11-20', '2026-11-25'],
      ['Reel × 2', 'Social Starter · month 1', 'Content', 'mei', '2026-11-20', '2026-11-25'],
    ])
  })
  it('no est. days: the quoted delivery, else a week', () => {
    const rows = buildTasks({ lines: [{ ...itemLine(POST, ''), eta: '2026-12-01' }, itemLine(POST, '')] }, [POST], '2026-11-20', () => null)
    expect(rows.map(r => [r.team, r.who, r.due])).toEqual([['Design', null, '2026-12-01'], ['Design', null, '2026-11-27']])
  })
  it("the design's teams", () => {
    expect(['Video', 'Graphic design', 'Ads management', 'Brand book', 'Brand', 'Events'].map(teamOf)).toEqual(['Content', 'Design', 'Ads', 'Brand', 'Brand', 'Manager'])
  })
})

describe('the Product List', () => {
  it('the picker: the category’s catalogue first, tagged; typed narrows it unless it names an item', () => {
    expect(pickerGroups([POST, REEL], 'video', '').groups.map(g => [g.cat, g.here])).toEqual([['Video', true], ['Graphic design', false]])
    expect(pickerGroups([POST, REEL], 'Video', 'post').groups.map(g => g.items.map(i => i.name))).toEqual([['Image post']])
    const exact = pickerGroups([POST, REEL], 'Video', 'reel')
    expect([exact.exact, exact.groups.length]).toEqual([true, 2])
  })
  it('where an item is used — products by name, quotations by item or a package’s item', () => {
    const products = [{ groups: [{ key: 'g', name: 'Video', items: [{ key: 'k', name: 'reel', qty: 1, price: null, workflow: null }] }] }]
    const quotes = [{ lines: [itemLine(REEL, '')] }, { lines: [packageLine(PACK)] }, { lines: [itemLine(POST, '')] }]
    expect(usedIn(REEL, products, quotes).text).toBe('1 product · 2 quotes')
    expect(usedIn({ ...POST, id: 'x' }, [], []).text).toBe('Not used yet')
  })
})

describe("the Product List's own columns follow the item", () => {
  const COLS: ItemColumn[] = [
    { id: 'c1', name: 'Platform', kind: 'choice', options: ['Instagram', 'TikTok'], inProducts: true, inQuotes: true, client: true },
    { id: 'c2', name: 'Extra fee', kind: 'money', options: [], inProducts: true, inQuotes: true, client: false },
    { id: 'c3', name: 'Shoot needed', kind: 'check', options: [], inProducts: true, inQuotes: false, client: false },
  ]
  const reel: CatalogItem = { ...REEL, extra: { c1: 'Instagram', c2: 120, c3: true } }

  it('in words, by what each holds', () => {
    expect([extraText('money', 120), extraText('check', true), extraText('check', false), extraText('number', 1500), extraText('text', '')])
      .toEqual(['RM 120', 'Yes', null, '1,500', null])
    expect(extrasOf(reel, COLS, c => c.inProducts).map(x => x.text)).toEqual(['Instagram', 'RM 120', 'Yes'])
  })

  it('only what changed is saved; a value emptied is cleared', () => {
    expect(itemPatch(reel, { ...reel, extra: { c1: 'TikTok', c3: true } })).toEqual({ extra: { c1: 'TikTok', c2: null } })
    expect(itemPatch(reel, reel)).toBeNull()
  })

  it('a quotation shows the columns that follow quotations, live; the client PDF only the client’s', () => {
    const pack = { ...packageLine(PACK), items: [{ name: 'reel', group: 'Video', base: 2, qty: 2, unit: 800 }] }
    const q = withExtras({ lines: [itemLine(reel, ''), pack] }, [reel], COLS)
    const [item, p] = q.lines
    expect(item.kind === 'item' && item.extra?.map(x => x.name)).toEqual(['Platform', 'Extra fee'])
    expect(extrasWords(item.kind === 'item' ? item.extra : [])).toBe('Platform: Instagram · Extra fee: RM 120')
    expect(lineExtrasWords(item, true)).toBe('Platform: Instagram')
    expect(lineExtrasWords(p, true)).toBe('reel — Platform: Instagram')
  })

  it('the internal sheet gains a column each, after Remarks', () => {
    const core = { ...quoteFromRow({ no: 'QT-2611-001', date: '2026-11-12', discount: 0, note: '' }), client: 'Carres' }
    const csv = quoteCsv(withExtras({ ...core, lines: [itemLine(reel, '')] }, [reel], COLS), 'Carres', '').split('\n')
    expect(csv[5].endsWith('"Remarks","Platform","Extra fee"')).toBe(true)
    expect(csv[6].endsWith('"2 rounds","Instagram","RM 120"')).toBe(true)
  })

  it('a value changed on the Product List is no edit of the quotation', () => {
    const q = quoteFromRow({ id: 'q', no: 'QT-1', sub: 's', date: '2026-11-12', valid: 30, discount: 0, note: '', lines: [itemLine(REEL, '')], history: [] })
    const sent = withExtras(coreOf(q, 'Carres'), [reel], COLS)
    expect(sameCore(coreOf(q, 'Carres'), sent)).toBe(true)
  })
})

describe('an item changed from a product is the Product List’s (two-way)', () => {
  const reel: CatalogItem = { ...REEL, extra: { c1: 'Instagram', c2: 120 } }
  it('changes merge — the later wins, column by column; null clears', () => {
    const f = mergeFacts(mergeFacts({ days: 3, extra: { c1: 'TikTok' } }, { extra: { c2: null } }), { days: 9 })
    expect(f).toEqual({ days: 9, extra: { c1: 'TikTok', c2: null } })
    const after = withFacts(reel, f)
    expect([after.days, after.extra]).toEqual([9, { c1: 'TikTok' }])
    expect(factsPayload(f)).toEqual({ days: 9, extra: { c1: 'TikTok', c2: null } })
    expect(factsPayload({ extra: { c3: false } })).toEqual({ extra: { c3: null } })
  })
})

describe('a product’s internal cost from its items (2026-11-13)', () => {
  it('each item’s Product List cost × its quantity; an item with no cost is counted as missing', () => {
    const groups = [{ key: 'g', name: 'Video', items: [
      { key: 'a', name: 'reel', qty: 2, price: 800, workflow: null },
      { key: 'b', name: 'Image post', qty: 3, price: 120, workflow: null },
      { key: 'c', name: 'Not listed', qty: 1, price: 50, workflow: null },
      { key: 'd', name: 'reel', qty: 0, price: 800, workflow: null },
    ] }]
    expect(itemsCost(groups, [REEL, POST])).toEqual({ cost: 600, missing: 2 })
  })
})

import { describe, expect, it } from 'vitest'
import type { CatalogueModel, CatalogueSku } from '../load'
import { boardOrder, boardPage, brandingOf, modularBoard } from './modular-board'

function sku(branding: string | null): CatalogueSku {
  return { erpId: `sku-${branding}`, code: 'X', description: null, category: 'MATTRESS', modelId: null, modelCode: null, modelName: null, baseModel: null, moduleCode: null, sizeCode: null, sizeLabel: null, optionLabel: 'Q', branding, brand: null, active: true, removed: false, isNew: false, price: null, grid: null, offered: false, modelOffered: false, adopted: false }
}
function model(code: string, category: string | null, branding: string | null, extra: Partial<CatalogueModel> = {}): CatalogueModel {
  return { erpId: code, code, name: null, category, branding, active: true, removed: false, isNew: false, allowed: {}, configured: false, offered: false, enabled: {}, gift: false, giftOverride: null, calcCategory: 'Mattress', calcOverride: null, brand: null, brandOverride: null, derivedBrand: null, skus: [], ...extra }
}
const brands = [
  { code: 'AKEMI', name: 'Akemi' },
  { code: 'ERGOTEX', name: 'Ergotex' },
  { code: 'ZANOTTI', name: 'Zanotti' },
  { code: 'DUNLOP', name: 'Dunlopillo' },
]
const categories = ['SOFA', 'BEDFRAME', 'MATTRESS']
const codes = (models: CatalogueModel[]) => models.map(m => m.code)

describe('brandingOf', () => {
  it("names a branding by the register's code when the register knows it, by code or by name", () => {
    expect(brandingOf(model('APEX', 'MATTRESS', 'AKEMI'), brands)).toEqual({ key: 'AKEMI', label: 'AKEMI' })
    expect(brandingOf(model('AMIRA', 'MATTRESS', 'DUNLOPILLO'), brands)).toEqual({ key: 'DUNLOP', label: 'DUNLOP' })
    expect(brandingOf(model('CLOUD', 'MATTRESS', ' ergotex '), brands)).toEqual({ key: 'ERGOTEX', label: 'ERGOTEX' })
  })

  it("keeps the ERP's word for a branding the register does not know", () => {
    expect(brandingOf(model('AURORA', 'MATTRESS', 'MyLatex'), brands)).toEqual({ key: 'MYLATEX', label: 'MYLATEX' })
    expect(brandingOf(model('ARIZONA', 'BEDFRAME', 'BEDFRAME'), brands)).toEqual({ key: 'BEDFRAME', label: 'BEDFRAME' })
  })

  it("falls back to the SKUs' branding, as derivedBrand does, and returns null for none", () => {
    expect(brandingOf(model('HAPPI SLEEP ZEN COOL', 'MATTRESS', null, { skus: [sku(null), sku('AKEMI')] }), brands)).toEqual({ key: 'AKEMI', label: 'AKEMI' })
    expect(brandingOf(model('ALAMANDA', 'MATTRESS', '  ', { skus: [sku(null), sku(' ')] }), brands)).toBeNull()
    expect(brandingOf(model('ALAMANDA', 'MATTRESS', null), brands)).toBeNull()
  })
})

describe('modularBoard', () => {
  const models = [
    model('ALAMANDA', 'MATTRESS', null),
    model('AMIRA', 'MATTRESS', 'DUNLOPILLO'),
    model('APEX', 'MATTRESS', 'AKEMI'),
    model('AURORA', 'MATTRESS', 'MYLATEX'),
    model('CLOUDREST', 'MATTRESS', 'ERGOTEX'),
    model('HAPPI SLEEP ZEN COOL', 'MATTRESS', null, { skus: [sku('AKEMI')] }),
    model('ZENITHAL', 'MATTRESS', 'AKEMI'),
    model('5530', 'SOFA', 'ZANOTTI'),
    model('1122', 'SOFA', null),
    model('ARIZONA', 'BEDFRAME', 'BEDFRAME'),
    model('SPARE', null, null),
  ]
  const board = modularBoard(models, categories, brands)

  it('orders categories the ERP way, a model with no category last', () => {
    expect(board.map(c => c.category)).toEqual(['SOFA', 'BEDFRAME', 'MATTRESS', ''])
    expect(board.map(c => c.count)).toEqual([2, 1, 7, 1])
  })

  it('groups a category by branding A→Z, the unbranded together at the end, the ERP order inside each', () => {
    const mattress = board.find(c => c.category === 'MATTRESS')!
    expect(mattress.branded).toBe(true)
    expect(mattress.groups.map(g => g.branding?.label ?? null)).toEqual(['AKEMI', 'DUNLOP', 'ERGOTEX', 'MYLATEX', null])
    expect(mattress.groups.map(g => codes(g.models))).toEqual([['APEX', 'HAPPI SLEEP ZEN COOL', 'ZENITHAL'], ['AMIRA'], ['CLOUDREST'], ['AURORA'], ['ALAMANDA']])
    expect(board[0].groups.map(g => g.branding?.label ?? null)).toEqual(['ZANOTTI', null])
  })

  it('does not move a model when the portal gives it another margin ladder', () => {
    const moved = modularBoard([model('AURORA', 'MATTRESS', 'MYLATEX', { brand: 'AKEMI', brandOverride: 'AKEMI' })], categories, brands)
    expect(moved[0].groups[0].branding?.label).toBe('MYLATEX')
  })

  it('draws no branding headings for a category where nothing is branded', () => {
    const plain = modularBoard([model('CUSHION', 'ACCESSORY', null), model('THROW', 'ACCESSORY', null)], ['ACCESSORY'], brands)
    expect(plain[0].branded).toBe(false)
    expect(plain[0].groups).toHaveLength(1)
    expect(codes(plain[0].groups[0].models)).toEqual(['CUSHION', 'THROW'])
  })

  it('steps through the models in the order they are drawn', () => {
    expect(codes(boardOrder(board))).toEqual(['5530', '1122', 'ARIZONA', 'APEX', 'HAPPI SLEEP ZEN COOL', 'ZENITHAL', 'AMIRA', 'CLOUDREST', 'AURORA', 'ALAMANDA', 'SPARE'])
  })
})

describe('boardPage', () => {
  const board = modularBoard([
    model('5530', 'SOFA', 'ZANOTTI'),
    model('5531', 'SOFA', 'ZANOTTI'),
    model('1122', 'SOFA', null),
    model('APEX', 'MATTRESS', 'AKEMI'),
  ], categories, brands)

  it('cuts the board after the first N cards, keeping every heading its whole count', () => {
    const page = boardPage(board, 1)
    expect(page).toHaveLength(1)
    expect(page[0].count).toBe(3)
    expect(page[0].groups).toHaveLength(1)
    expect(codes(page[0].groups[0].cards)).toEqual(['5530'])
    expect(page[0].groups[0].models).toHaveLength(2)
  })

  it('continues into the next group and category as the limit grows', () => {
    const page = boardPage(board, 3)
    expect(page.map(c => c.groups.map(g => codes(g.cards)))).toEqual([[['5530', '5531'], ['1122']]])
    expect(boardPage(board, 200).map(c => c.groups.flatMap(g => codes(g.cards)))).toEqual([['5530', '5531', '1122'], ['APEX']])
  })
})

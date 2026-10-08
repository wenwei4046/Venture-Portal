import { describe, expect, it } from 'vitest'
import {
  EMPTY_LAYOUT,
  MAX_COLUMN_WIDTH,
  MIN_COLUMN_WIDTH,
  clampWidth,
  dropSide,
  isEmptyLayout,
  layoutsFromCookies,
  moveColumn,
  orderColumns,
  sanitizeLayout,
  stepColumn,
} from './column-layout'

const cols = [
  { key: 'code' },
  { key: 'description' },
  { key: 'model' },
  { key: 'size:24', movable: false },
  { key: 'size:26', movable: false },
]
const keys = (list: { key: string }[]) => list.map(c => c.key)

describe('column layout', () => {
  it('keeps the table order when nothing was stored, fixed columns last', () => {
    expect(keys(orderColumns(cols, []))).toEqual(['code', 'description', 'model', 'size:24', 'size:26'])
    expect(keys(orderColumns([{ key: 'a', movable: false }, { key: 'b' }], []))).toEqual(['b', 'a'])
  })

  it('follows the stored order, forgets gone columns and appends new ones in the table order', () => {
    expect(keys(orderColumns(cols, ['model', 'code', 'description']))).toEqual(['model', 'code', 'description', 'size:24', 'size:26'])
    expect(keys(orderColumns(cols, ['brand', 'model', 'model', 'size:24']))).toEqual(['model', 'code', 'description', 'size:24', 'size:26'])
  })

  it('moves a column to where the target stood: after it rightwards, before it leftwards', () => {
    const order = ['a', 'b', 'c', 'd']
    expect(moveColumn(order, 'a', 'c')).toEqual(['b', 'c', 'a', 'd'])
    expect(dropSide(order, 'a', 'c')).toBe('after')
    expect(moveColumn(order, 'd', 'b')).toEqual(['a', 'd', 'b', 'c'])
    expect(dropSide(order, 'd', 'b')).toBe('before')
    expect(moveColumn(order, 'a', 'a')).toEqual(order)
    expect(moveColumn(order, 'x', 'a')).toEqual(order)
  })

  it('steps one place and stops at either end', () => {
    expect(stepColumn(['a', 'b', 'c'], 'b', -1)).toEqual(['b', 'a', 'c'])
    expect(stepColumn(['a', 'b', 'c'], 'b', 1)).toEqual(['a', 'c', 'b'])
    expect(stepColumn(['a', 'b', 'c'], 'a', -1)).toEqual(['a', 'b', 'c'])
    expect(stepColumn(['a', 'b', 'c'], 'c', 1)).toEqual(['a', 'b', 'c'])
  })

  it('clamps widths to a usable range', () => {
    expect(clampWidth(10)).toBe(MIN_COLUMN_WIDTH)
    expect(clampWidth(99_999)).toBe(MAX_COLUMN_WIDTH)
    expect(clampWidth(150.6)).toBe(151)
  })

  it('picks the layouts out of the request cookies, however they arrive', () => {
    const json = JSON.stringify({ order: ['model'], widths: {} })
    expect(layoutsFromCookies([
      { name: 'vp-cols.sku-master', value: encodeURIComponent(json) },
      { name: 'vp-cols.costing-gaps', value: json },
      { name: 'vp-cols.broken', value: '%7Bnot' },
      { name: 'vp-cols.malformed', value: '%E0%A4%A' },
      { name: 'sb-access-token', value: '{"order":[]}' },
    ])).toEqual({ 'sku-master': json, 'costing-gaps': json })
  })

  it('reads only what it can trust from storage', () => {
    expect(sanitizeLayout(null)).toBe(EMPTY_LAYOUT)
    expect(sanitizeLayout('nonsense')).toBe(EMPTY_LAYOUT)
    expect(sanitizeLayout([1, 2])).toBe(EMPTY_LAYOUT)
    expect(sanitizeLayout({ order: 'code', widths: [] })).toBe(EMPTY_LAYOUT)
    expect(sanitizeLayout({
      order: ['model', 7, '', 'model', 'code'],
      widths: { model: 5, code: 'wide', description: Infinity, brand: 180.4, '': 100 },
    })).toEqual({ order: ['model', 'code'], widths: { model: MIN_COLUMN_WIDTH, brand: 180 } })
    expect(isEmptyLayout(sanitizeLayout({ order: [], widths: {} }))).toBe(true)
  })
})

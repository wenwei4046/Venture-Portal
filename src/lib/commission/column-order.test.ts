import { describe, expect, it } from 'vitest'
import { backspaceResetsColumns, isDefaultOrder, moveColumn, normaliseOrder } from './column-order'

const DEFAULTS = ['status', 'ref', 'date', 'venue', 'brand'] as const

describe('moveColumn', () => {
  it('moves a column right onto the target’s place', () => {
    expect(moveColumn(DEFAULTS, 'ref', 'venue')).toEqual(['status', 'date', 'venue', 'ref', 'brand'])
  })
  it('moves a column left onto the target’s place', () => {
    expect(moveColumn(DEFAULTS, 'brand', 'ref')).toEqual(['status', 'brand', 'ref', 'date', 'venue'])
  })
  it('leaves the order alone for a drop on itself or an unknown key', () => {
    expect(moveColumn(DEFAULTS, 'ref', 'ref')).toEqual([...DEFAULTS])
    expect(moveColumn(DEFAULTS, 'ref', 'nope' as never)).toEqual([...DEFAULTS])
  })
})

describe('normaliseOrder', () => {
  it('falls back to the default for nothing stored', () => {
    expect(normaliseOrder(null, DEFAULTS)).toEqual([...DEFAULTS])
    expect(normaliseOrder('junk', DEFAULTS)).toEqual([...DEFAULTS])
  })
  it('drops unknown keys and repeats', () => {
    expect(normaliseOrder(['brand', 'gone', 'brand', 'status', 'ref', 'date', 'venue'], DEFAULTS))
      .toEqual(['brand', 'status', 'ref', 'date', 'venue'])
  })
  it('puts a column added since back beside its default neighbour', () => {
    expect(normaliseOrder(['brand', 'status', 'date', 'venue'], DEFAULTS))
      .toEqual(['brand', 'status', 'ref', 'date', 'venue'])
    expect(normaliseOrder(['venue', 'ref'], ['status', 'ref', 'venue']))
      .toEqual(['status', 'venue', 'ref'])
  })
})

describe('isDefaultOrder', () => {
  it('tells the default from a moved order', () => {
    expect(isDefaultOrder([...DEFAULTS], DEFAULTS)).toBe(true)
    expect(isDefaultOrder(moveColumn(DEFAULTS, 'ref', 'brand'), DEFAULTS)).toBe(false)
  })
})

describe('backspaceResetsColumns', () => {
  const on = (tagName: string, extra: object = {}) => ({ key: 'Backspace', target: { tagName, ...extra } as unknown as EventTarget })
  it('resets on a plain Backspace on the page', () => {
    expect(backspaceResetsColumns(on('BODY'))).toBe(true)
    expect(backspaceResetsColumns(on('TH'))).toBe(true)
  })
  it('never while typing', () => {
    expect(backspaceResetsColumns(on('INPUT'))).toBe(false)
    expect(backspaceResetsColumns(on('TEXTAREA'))).toBe(false)
    expect(backspaceResetsColumns(on('SELECT'))).toBe(false)
    expect(backspaceResetsColumns(on('DIV', { isContentEditable: true }))).toBe(false)
  })
  it('not for other keys or with a modifier', () => {
    expect(backspaceResetsColumns({ key: 'Delete', target: null })).toBe(false)
    expect(backspaceResetsColumns({ key: 'Backspace', ctrlKey: true, target: null })).toBe(false)
  })
})

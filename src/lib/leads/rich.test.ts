import { describe, expect, it } from 'vitest'
import { richPieces, wrapMark } from './rich'

describe('bold and italic words (2026-10-29)', () => {
  it('reads *bold* and _italic_ as Messenger does', () => {
    expect(richPieces('Sofa *RM2,990* only, _this month_!')).toEqual([
      { text: 'Sofa ' }, { text: 'RM2,990', bold: true }, { text: ' only, ' }, { text: 'this month', italic: true }, { text: '!' },
    ])
    expect(richPieces('*全部* RM2990')).toEqual([{ text: '全部', bold: true }, { text: ' RM2990' }])
  })
  it('leaves links, sums and loose marks alone', () => {
    expect(richPieces('https://waze.com/ul/hw_2838nc1q_x')).toEqual([{ text: 'https://waze.com/ul/hw_2838nc1q_x' }])
    expect(richPieces('2*3*4 = 24')).toEqual([{ text: '2*3*4 = 24' }])
    expect(richPieces('a * b * c')).toEqual([{ text: 'a * b * c' }])
    expect(richPieces('')).toEqual([])
  })
  it('wraps the selection, spaces outside, or puts a pair at the cursor', () => {
    expect(wrapMark('Buy now', 0, 3, '*')).toEqual({ text: '*Buy* now', caret: 5 })
    expect(wrapMark('Buy now', 3, 7, '_')).toEqual({ text: 'Buy _now_', caret: 9 })
    expect(wrapMark('Hi ', 3, 3, '*')).toEqual({ text: 'Hi **', caret: 4 })
  })
})

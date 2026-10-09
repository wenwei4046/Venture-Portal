import { describe, expect, it } from 'vitest'
import { netByAccountFromLines } from './cfo-reports'

// 2026-10-10 — the Trial Balance by segment (the user's Claude Design
// handoff puts Segment on its control row). A journal entry carries one
// segment, so one segment's lines balance on their own: each account's
// Dr − Cr from that segment's lines dated on or before the day.

const line = (account_code: string, debit: number, credit: number, date: string, segment: string) => ({ account_code, debit, credit, date, segment })

describe('one segment’s balances', () => {
  const lines = [
    line('1010', 500, 0, '2026-09-30', 'marketing'),
    line('4000', 0, 500, '2026-09-30', 'marketing'),
    line('1010', 200, 0, '2026-10-05', 'marketing'),
    line('4000', 0, 200, '2026-10-05', 'marketing'),
    line('1010', 0, 80, '2026-10-12', 'marketing'),
    line('6000', 80, 0, '2026-10-12', 'marketing'),
    line('1010', 900, 0, '2026-10-01', 'hr'),
    line('2100', 0, 900, '2026-10-01', 'hr'),
  ]

  it('sums Dr − Cr of the segment’s lines up to the day', () => {
    const net = netByAccountFromLines(lines, '2026-10-09', ['marketing'])
    expect(Object.fromEntries(net)).toEqual({ '1010': 700, '4000': -700 })
  })

  it('reads Venture as corporate and treasury together', () => {
    const net = netByAccountFromLines(
      [line('1010', 100, 0, '2026-10-01', 'corporate'), line('2100', 0, 100, '2026-10-01', 'treasury'), line('1010', 5, 0, '2026-10-01', 'hr')],
      '2026-10-09',
      ['corporate', 'treasury'],
    )
    expect(Object.fromEntries(net)).toEqual({ '1010': 100, '2100': -100 })
  })

  it('rounds each balance to the sen', () => {
    const net = netByAccountFromLines([line('1010', 0.1, 0, '2026-10-01', 'hr'), line('1010', 0.2, 0, '2026-10-01', 'hr')], '2026-10-09', ['hr'])
    expect(net.get('1010')).toBe(0.3)
  })
})

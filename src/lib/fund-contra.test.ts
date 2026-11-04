import { describe, expect, it } from 'vitest'
import { contraLines, contraProblem, sideTotal, type ContraDeal } from './fund-contra'

const deals = new Map<string, ContraDeal>([
  ['L1', { id: 'L1', label: 'CAR [LO#1]', outstanding: 145_000 }],
  ['L2', { id: 'L2', label: 'CAR [LO#2]', outstanding: 91_666.67 }],
  ['S1', { id: 'S1', label: 'HC', outstanding: 220_000 }],
])
const today = '2026-11-04'
const line = (id: string, principal: string, interest = '') => ({ key: id, id, principal, interest })

describe('fund contra — what the dialog checks before it is sent', () => {
  it('takes many to one: two loans against one fund source, principal and interest each', () => {
    const loans = contraLines('loan', [line('L1', '10,000', '1,200'), line('L2', '5,000')])
    const sources = contraLines('source', [line('S1', '15,000', '1,200')])
    expect(sideTotal(loans)).toBe(16_200)
    expect(sideTotal(sources)).toBe(16_200)
    expect(contraProblem({ date: today, today, loans, sources, deals })).toBeNull()
  })

  it('refuses unequal sides, saying both totals', () => {
    const p = contraProblem({ date: today, today, loans: contraLines('loan', [line('L1', '100', '50')]), sources: contraLines('source', [line('S1', '100')]), deals })
    expect(p).toBe('The two sides must be equal — Fund OUT RM 150.00, Fund IN RM 100.00')
  })

  it('refuses a principal over what the deal owes, a future date, a side left empty, a deal twice', () => {
    const one = contraLines('source', [line('S1', '200000')])
    expect(contraProblem({ date: today, today, loans: contraLines('loan', [line('L1', '200000')]), sources: one, deals })).toBe('CAR [LO#1] owes RM 145,000.00 in principal')
    expect(contraProblem({ date: '2026-11-05', today, loans: contraLines('loan', [line('L1', '1')]), sources: contraLines('source', [line('S1', '1')]), deals })).toBe('The date cannot be in the future')
    expect(contraProblem({ date: today, today, loans: [], sources: one, deals })).toBe('Add at least one Fund OUT loan')
    expect(contraProblem({ date: today, today, loans: contraLines('loan', [line('L1', '1'), line('L1', '1')]), sources: contraLines('source', [line('S1', '2')]), deals })).toBe('CAR [LO#1] is in the contra twice')
  })

  it('a principal-only contra is fine — the interest is paid in cash as before', () => {
    expect(contraProblem({ date: today, today, loans: contraLines('loan', [line('L1', '10000', '0')]), sources: contraLines('source', [line('S1', '10000')]), deals })).toBeNull()
  })

  it('drops a blank line, and a line with no amount says so', () => {
    expect(contraLines('loan', [line('', ''), line('L1', '1')])).toHaveLength(1)
    expect(contraProblem({ date: today, today, loans: contraLines('loan', [line('L1', '0', '0')]), sources: contraLines('source', [line('S1', '1')]), deals })).toBe('CAR [LO#1] needs a principal or an interest amount')
  })
})

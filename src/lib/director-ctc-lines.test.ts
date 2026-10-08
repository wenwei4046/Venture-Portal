import { describe, expect, it } from 'vitest'
import { directorCtcInvoiceLines } from './director-ctc-lines'

// HR's director CTC for a subsidiary, as get_director_ctc_by_company returns it.
const HC = { basic: 22800, kpi: 0, allowance: 0, epf: 2736, socso: 208.3, eis: 23.8 }
const CO2990 = { basic: 2500, kpi: 0, allowance: 6769.38, epf: 325, socso: 42.85, eis: 4.9 }

// 2026-10-06 (user: "director 要 bill back 的我要拆 detail 可以吗？" → "可以").
describe('directorCtcInvoiceLines', () => {
  it('itemises the CTC as Salary / EPF / SOCSO / EIS, leaving the zero components out', () => {
    expect(directorCtcInvoiceLines(HC, 25768.1, '2026-09-01', '5050')).toEqual([
      { description: "Salary - Sep'26", amount: 22800, categoryCode: '5050' },
      { description: "EPF - Sep'26", amount: 2736, categoryCode: '5050' },
      { description: "SOCSO - Sep'26", amount: 208.3, categoryCode: '5050' },
      { description: "EIS - Sep'26", amount: 23.8, categoryCode: '5050' },
    ])
  })

  it('lists the allowance, and a KPI when HR keyed one, after the salary', () => {
    const lines = directorCtcInvoiceLines({ ...CO2990, kpi: 1000 }, 10642.13, '2026-09', '5050')
    expect(lines?.map((l) => [l.description, l.amount])).toEqual([
      ["Salary - Sep'26", 2500],
      ["KPI - Sep'26", 1000],
      ["Allowance - Sep'26", 6769.38],
      ["EPF - Sep'26", 325],
      ["SOCSO - Sep'26", 42.85],
      ["EIS - Sep'26", 4.9],
    ])
  })

  it('refuses an amount that is not the CTC total to the sen — Finance changed it, so the split cannot be read', () => {
    expect(directorCtcInvoiceLines(HC, 25000, '2026-09-01', '5050')).toBeNull()
    expect(directorCtcInvoiceLines(HC, 25768.11, '2026-09-01', '5050')).toBeNull()
  })

  it('adds the components in sen, so a total that only looks equal in floating point still matches', () => {
    // 0.1 + 0.2 style drift: these six sum to 9,642.13 exactly in sen.
    expect(directorCtcInvoiceLines(CO2990, 9642.13, '2026-09-01', '5050')).toHaveLength(5)
  })
})

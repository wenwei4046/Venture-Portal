import { describe, expect, it } from 'vitest'
import { directorCtcParts } from './director-ctc-lines'

// HR's director CTC for a subsidiary, as get_director_ctc_by_company returns it.
const HC = { basic: 22800, kpi: 0, allowance: 0, epf: 2736, socso: 208.3, eis: 23.8 }
const CO2990 = { basic: 2500, kpi: 0, allowance: 6769.38, epf: 325, socso: 42.85, eis: 4.9 }

// 2026-10-06 (user: "director 要 bill back 的我要拆 detail 可以吗？" → "可以").
describe('directorCtcParts', () => {
  it('itemises the CTC as Salary / EPF / SOCSO / EIS, each with its kind, leaving the zero components out', () => {
    expect(directorCtcParts(HC, '2026-09-01')).toEqual([
      { kind: 'Salary', description: "Salary - Sep'26", amount: 22800 },
      { kind: 'EPF', description: "EPF - Sep'26", amount: 2736 },
      { kind: 'SOCSO', description: "SOCSO - Sep'26", amount: 208.3 },
      { kind: 'EIS', description: "EIS - Sep'26", amount: 23.8 },
    ])
  })

  it('lists the allowance, and a KPI when HR keyed one, after the salary', () => {
    expect(directorCtcParts({ ...CO2990, kpi: 1000 }, '2026-09').map((l) => [l.kind, l.description, l.amount])).toEqual([
      ['Salary', "Salary - Sep'26", 2500],
      ['KPI', "KPI - Sep'26", 1000],
      ['Allowance', "Allowance - Sep'26", 6769.38],
      ['EPF', "EPF - Sep'26", 325],
      ['SOCSO', "SOCSO - Sep'26", 42.85],
      ['EIS', "EIS - Sep'26", 4.9],
    ])
  })
})

import { describe, expect, it } from 'vitest'
import { departmentOfSegment, linesByDepartment } from './invoice-departments'

// HV-INV-202610-0058 (2026-11-05): HOUZS Century's October payroll — five lines for one department, five for Director
// Office — read as two groups with their subtotals, on the page as in the PDF.
const line = (description: string, amount: number, segment: string | null) => ({ description, amount, segment })

describe('an invoice’s lines by department', () => {
  it('groups by segment in the order each first appears, each with its subtotal', () => {
    const groups = linesByDepartment([
      line('Salary - Oct\'26', 9930, 'hr'),
      line('Allowance - Oct\'26', 669.2, 'hr'),
      line('EPF - Oct\'26', 1273.4, 'hr'),
      line('Salary - Oct\'26', 1200.63, 'director_office'),
      line('EIS - Oct\'26', 2.6, 'director_office'),
    ])!
    expect(groups.map((g) => [g.label, g.lines.length, g.subtotal])).toEqual([
      ['HR', 3, 11_872.6],
      ['Director Office', 2, 1203.23],
    ])
  })

  it('does not group an invoice whose lines carry no department', () => {
    expect(linesByDepartment([line('Marketing service', 500, null)])).toBeNull()
  })

  it('names an unknown segment by itself, a blank one Other', () => {
    expect(departmentOfSegment('revenue_department')).toBe('Revenue Department')
    expect(departmentOfSegment('corporate')).toBe('Venture Office')
    expect(departmentOfSegment('new_dept')).toBe('new_dept')
    expect(departmentOfSegment(null)).toBe('Other')
  })
})

import { describe, it, expect } from 'vitest'
import { parseInfotechGrid } from './infotech-payroll'

// Golden grid based on the actual Carres Mar 2026 export the user provided.
// Minimal subset — just enough to exercise every code path.
const CARRES_GRID: (string | number | null)[][] = [
  ['Carres Sdn Bhd', null, null, null, null, null, null, null, null, null, null, null],
  [null],
  ['Monthly PayRoll Summary Detailed Report (By Department) End Pay - MONTH [March- 2026]'],
  [null],
  ['Date : 17/04/2026'],
  [null, null, null, null, null, 'Allow', 'Rest/PH', 'Allowance', 'Deduction'],
  ['No.', 'Code', 'Emp. Name', 'Tot. Sal', 'OT Amt', 'Shift', 'Amount', 'Add', 'No Pay', 'Bonus', 'Gross', 'Ded', 'Emplyr', 'Emp', 'Total'],
  ['Company Name : Carres Sdn Bhd'],
  ['Code :CR-BD    Department:CR - BUSINESS DEVELOPMENT'],
  [1, '  CR002', 'ANG KHAI HERNG', 5000, 0, 0, 0, 1679.96, 0, 0, 6679.96, 0, 650, 550, 1200],
  [2, '  CR013', 'YONG LEE LEE', 0, 0, 0, 0, 500.27, 0, 0, 500.27, 0, 0, 0, 0],
  [null],
  [null, null, 'Sub Total:', 5000, 0, 0, 0, 2180.23, 0, 0, 7180.23, 0, 650, 550, 1200],
  ['Code :CR-MGT    Department:CR - MANAGEMENT'],
  [1, '  CR010', 'CHOW JIA QING', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [null],
  [null, null, 'Sub Total:', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  ['Code :CR-OPS    Department:CR - OPERATIONS'],
  [1, '  CR001', 'LIM CHAI CHIEW', 15000, 0, 0, 0, 395.75, 0, 0, 15395.75, 0, 1800, 1650, 3450],
  [2, '  CR008', 'NURSHAFIQA IZZATI BINTI MOHAMAD ZAINI', 2300, 0, 0, 0, 0, -14.91, 0, 2285.09, 0, 299, 253, 552],
  [null, null, 'Sub Total:', 17300, 0, 0, 0, 395.75, -14.91, 0, 17680.84],
  ['Code :CR-SLS    Department:CR - SALES'],
  [1, '  CR005', 'CHAN ZHI XUAN', 2500, 96.6, 0, 0, 3094.72, -688.4, 0, 5002.92, 0, 640, 542, 1182],
  [null],
  [null, null, 'Grand Total:', 24800, 96.6, 0, 0, 5170.43, -703.31, 0, 29363.72],
]

describe('parseInfotechGrid', () => {
  it('extracts 6 employees from the Carres sample grid', () => {
    const result = parseInfotechGrid(CARRES_GRID)
    expect(result.rows).toHaveLength(6)
  })

  it('captures every department section header', () => {
    const result = parseInfotechGrid(CARRES_GRID)
    expect(result.departments).toEqual([
      'CR - BUSINESS DEVELOPMENT',
      'CR - MANAGEMENT',
      'CR - OPERATIONS',
      'CR - SALES',
    ])
  })

  it('maps ANG KHAI HERNG row correctly', () => {
    const result = parseInfotechGrid(CARRES_GRID)
    const ang = result.rows.find(r => r.employeeCode === 'CR002')
    expect(ang).toEqual({
      employeeCode: 'CR002',
      employeeName: 'ANG KHAI HERNG',
      basicSalary: 5000,
      otAmount: 0,
      nonStatutoryAllowance: 1679.96,
      noPayDeduction: 0,
    })
  })

  it('trims leading whitespace from employee codes', () => {
    const result = parseInfotechGrid(CARRES_GRID)
    const codes = result.rows.map(r => r.employeeCode)
    codes.forEach(c => expect(c).not.toMatch(/^\s/))
  })

  it('flips negative No Pay to positive deduction magnitude', () => {
    const result = parseInfotechGrid(CARRES_GRID)
    const chan = result.rows.find(r => r.employeeCode === 'CR005')
    expect(chan?.noPayDeduction).toBe(688.4)
  })

  it('captures OT for CHAN ZHI XUAN', () => {
    const result = parseInfotechGrid(CARRES_GRID)
    const chan = result.rows.find(r => r.employeeCode === 'CR005')
    expect(chan?.otAmount).toBe(96.6)
  })

  it('includes zero-basic employees (CHOW JIA QING) without filtering them out', () => {
    const result = parseInfotechGrid(CARRES_GRID)
    const chow = result.rows.find(r => r.employeeCode === 'CR010')
    expect(chow).toBeDefined()
    expect(chow?.basicSalary).toBe(0)
  })

  it('skips Sub Total and Grand Total rows', () => {
    const result = parseInfotechGrid(CARRES_GRID)
    // No row named "Sub Total:" or "Grand Total:" should end up in rows[]
    result.rows.forEach(r => {
      expect(r.employeeName).not.toContain('Total')
    })
  })

  it('grossSum equals the sum of per-row gross values', () => {
    const result = parseInfotechGrid(CARRES_GRID)
    expect(result.grossSum).toBeCloseTo(
      6679.96 + 500.27 + 0 + 15395.75 + 2285.09 + 5002.92,
      1,
    )
  })

  it('empty grid returns empty result', () => {
    const result = parseInfotechGrid([])
    expect(result.rows).toHaveLength(0)
    expect(result.departments).toHaveLength(0)
    expect(result.grossSum).toBe(0)
  })

  it('grid with no "No. | Code" header produces 0 rows (dataStarted stays false)', () => {
    const result = parseInfotechGrid([
      ['Some random header'],
      [1, 'ABC', 'Fake Name', 1000],
    ])
    expect(result.rows).toHaveLength(0)
  })
})

import { describe, it, expect } from 'vitest'
import { utils, write } from 'xlsx'
import { parseInfotechGrid, parseInfotechPayroll } from './infotech-payroll'

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
      bonus: 0,
      gross: 6679.96,
      deduction: 0,
      epfEr: 650,
      epfEe: 550,
      // Grid truncated after EPF Total — missing cells parse as 0.
      socsoEr: 0,
      socsoEe: 0,
      eisEr: 0,
      eisEe: 0,
      pcb: 0,
      net: 0,
    })
  })

  it('verbatim-maps a full-width row (HV007 from the HVenture March export)', () => {
    // Real row from "HVenture PayrollSummary Mar.xlsx" — all 26 columns.
    const grid: (string | number | null)[][] = [
      ['No.', 'Code', 'Emp. Name', 'Tot. Sal', 'OT Amt', 'Shift', 'Amount', 'Add', 'No Pay', 'Bonus', 'Gross', 'Ded', 'Emplyr', 'Emp', 'Total', 'Emplyr', 'Emp', 'Total', 'Emplyr', 'Emp', 'Total', 'HRDF', 'Zakat', 'PCB', 'CP38 Amount', 'NettWgs'],
      ['Code :H-DO    Department:H - DIRECTOR OFFICE'],
      [1, '  HV007', 'CHOW WAI MAN', 4800, 0, 0, 0, 200, 0, 0, 5000, 0, 624, 528, 1152, 83.15, 23.75, 106.9, 9.5, 9.5, 19, 0, 0, 80.75, 0, 4358],
    ]
    const result = parseInfotechGrid(grid)
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0]).toEqual({
      employeeCode: 'HV007',
      employeeName: 'CHOW WAI MAN',
      basicSalary: 4800,
      otAmount: 0,
      nonStatutoryAllowance: 200,
      noPayDeduction: 0,
      bonus: 0,
      gross: 5000,
      deduction: 0,
      epfEr: 624,
      epfEe: 528,
      socsoEr: 83.15,
      socsoEe: 23.75,
      eisEr: 9.5,
      eisEe: 9.5,
      pcb: 80.75,
      net: 4358,
    })
  })

  // Regression for the June 2026 import: InfoTech added a new SKBBK column
  // after the EIS block, shifting HRDF/Zakat/PCB/CP38/NettWgs one position
  // right. The old positional parser read Zakat as PCB and CP38 as NettWgs —
  // every June row landed in the DB with pcb=0 and net=0.
  it('reads PCB/NettWgs by header name when a new SKBBK column shifts the tail', () => {
    const grid: (string | number | null)[][] = [
      ['No.', 'Code', 'Emp. Name', 'Tot. Sal', 'OT Amt', 'Shift', 'Amount', 'Add', 'No Pay', 'Bonus', 'Gross', 'Ded', 'Emplyr', 'Emp', 'Total', 'Emplyr', 'Emp', 'Total', 'Emplyr', 'Emp', 'Total', 'SKBBK', 'HRDF', 'Zakat', 'PCB', 'CP38 Amount', 'NettWgs'],
      ['Code :H-DO    Department:H - DIRECTOR OFFICE'],
      [1, '  HV001', 'TAN MEI LING', 11000, 0, 0, 0, 0, 0, 0, 11000, 0, 1320, 1210, 2530, 34.9, 29.75, 64.65, 11.9, 11.9, 23.8, 10, 0, 0, 733.35, 0, 9005],
    ]
    const result = parseInfotechGrid(grid)
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0].epfEe).toBe(1210)
    expect(result.rows[0].socsoEe).toBe(29.75)
    expect(result.rows[0].eisEe).toBe(11.9)
    expect(result.rows[0].pcb).toBe(733.35)
    expect(result.rows[0].net).toBe(9005)
  })

  // Regression for LING HONG XIANG (June 2026): month-end joiner whose 5-day
  // pro-rata (633.33) was fully withheld — file shows Gross 633.33, Ded 633.33,
  // NettWgs 0. The Ded column must land in `deduction` so the import can write
  // deduction_amount + gross = Gross − Ded (keeping his 633.33 out of the CTC
  // total that Finance funds).
  it('parses the Ded column into deduction (withheld pay)', () => {
    const grid: (string | number | null)[][] = [
      ['No.', 'Code', 'Emp. Name', 'Tot. Sal', 'OT Amt', 'Shift', 'Amount', 'Add', 'No Pay', 'Bonus', 'Gross', 'Ded', 'Emplyr', 'Emp', 'Total', 'Emplyr', 'Emp', 'Total', 'Emplyr', 'Emp', 'Total', 'HRDF', 'Zakat', 'PCB', 'CP38 Amount', 'NettWgs'],
      ['Code :H-HR    Department:H - HUMAN RESOURCES'],
      [1, '  HV026', 'LING HONG XIANG', 633.33, 0, 0, 0, 0, 0, 0, 633.33, 633.33, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    ]
    const result = parseInfotechGrid(grid)
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0].gross).toBe(633.33)
    expect(result.rows[0].deduction).toBe(633.33)
    expect(result.rows[0].net).toBe(0)
  })

  it('folds Shift and Rest/PH amounts into otAmount', () => {
    const grid: (string | number | null)[][] = [
      ['No.', 'Code', 'Emp. Name', 'Tot. Sal', 'OT Amt', 'Shift', 'Amount', 'Add', 'No Pay', 'Bonus', 'Gross'],
      ['Code :X    Department:X - TEST'],
      [1, 'X001', 'SHIFT WORKER', 3000, 100, 50, 25, 0, 0, 0, 3175],
    ]
    const result = parseInfotechGrid(grid)
    expect(result.rows[0].otAmount).toBe(175) // 100 OT + 50 shift + 25 rest/PH
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

// ── Sheet selection (regression for the 2026-06-26 "why got Lin Xiao Ling"
//    bug): a May file carried the March tab first; the old parser blindly took
//    SheetNames[0] and imported March, including a since-resigned employee.
describe('parseInfotechPayroll — sheet selection by period', () => {
  function reportGrid(monthLabel: string, names: string[]): (string | number | null)[][] {
    return [
      ['HOUZS VENTURE HOLDING SDN BHD'],
      [`Monthly PayRoll Summary Detailed Report (By Department) End Pay - MONTH [${monthLabel}]`],
      ['Date : 25/05/2026'],
      ['No.', 'Code', 'Emp. Name', 'Tot. Sal', 'OT Amt', 'Shift', 'Amount', 'Add', 'No Pay', 'Bonus', 'Gross'],
      ['Code :H-HR    Department:H - HUMAN RESOURCES'],
      ...names.map((n, i) => [i + 1, `HV${100 + i}`, n, 4600, 0, 0, 0, 0, 0, 0, 4600]),
    ]
  }

  function workbook(sheets: { name: string; grid: (string | number | null)[][] }[]): ArrayBuffer {
    const wb = utils.book_new()
    for (const s of sheets) utils.book_append_sheet(wb, utils.aoa_to_sheet(s.grid), s.name)
    return write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
  }

  const buf = workbook([
    { name: 'HVH - Mar Ori', grid: reportGrid('March- 2026', ['TAMMY KHOO', 'LIN XIAO LING']) },
    { name: 'HVH - May', grid: reportGrid('May- 2026', ['TAMMY KHOO']) },
    { name: 'INFOTECH', grid: [['PERIOD', 'employee code'], ['052026', 'HV100']] }, // not a report tab
  ])

  it('picks the May tab (not the first March tab) for a May period', () => {
    const result = parseInfotechPayroll(buf, '2026-05-01')
    expect(result.sheetName).toBe('HVH - May')
    expect(result.sheetPeriodLabel).toBe('May 2026')
    expect(result.periodMismatch).toBe(false)
    expect(result.rows.map(r => r.employeeName)).not.toContain('LIN XIAO LING')
  })

  it('picks the March tab for a March period', () => {
    const result = parseInfotechPayroll(buf, '2026-03-01')
    expect(result.sheetName).toBe('HVH - Mar Ori')
    expect(result.rows.map(r => r.employeeName)).toContain('LIN XIAO LING')
  })

  it('flags periodMismatch and falls back to the first report tab when no tab matches', () => {
    const result = parseInfotechPayroll(buf, '2026-07-01')
    expect(result.periodMismatch).toBe(true)
    expect(result.sheetName).toBe('HVH - Mar Ori')
  })

  it('ignores non-report tabs (INFOTECH) when selecting', () => {
    const result = parseInfotechPayroll(buf, '2026-05-01')
    expect(result.sheetName).not.toBe('INFOTECH')
  })
})

/**
 * Parser for InfoTech HRMS "PayRoll Summary Detailed Report (By Department)"
 * export. The user confirmed 2026-04-17 this is the single supported
 * import format — no column mapper, columns are positional.
 *
 * Structure (1-indexed by column position):
 *   Header rows before data:
 *     - Company name
 *     - Report title
 *     - Date
 *     - Column headers (multi-row: section row + field row)
 *     - "Company Name :" row
 *     - Department section header ("Code :XX  Department:YY")
 *   Data rows:
 *     - No. | Code | Emp. Name | Tot. Sal | OT Amt | Shift | Rest/PH Amt |
 *       Allowance Add | No Pay | Bonus | Gross | Ded | EPF ER | EPF EE |
 *       EPF Total | SOCSO ER | SOCSO EE | SOCSO Total | EIS ER | EIS EE |
 *       EIS Total | HRDF | Zakat | PCB | CP38 | NettWgs
 *   Sub-total rows (between departments): "Sub Total:" in col 2
 *   Grand total row (last): "Grand Total:" in col 2
 *
 * Our mapping (InfoTech col → hr_monthly_payroll field):
 *   col 1 Code          → matches hr_staff_costs.employee_code (primary match)
 *   col 2 Emp. Name     → matches hr_staff_costs.employee_name (fallback fuzzy)
 *   col 3 Tot. Sal      → basic_salary
 *   col 4 OT Amt        → ot_amount
 *   col 7 Allowance Add → non_statutory_allowance
 *     (our schema treats InfoTech's "Allowance" as non-statutory; HR adjusts
 *      statutory_allowance manually on the grid if needed.)
 *   col 8 No Pay        → unpaid_leave_amount (informational, not stored; HR
 *                         can enter unpaid_leave_days on the grid).
 *   other cols (OT hours, Bonus, EPF/SOCSO/EIS values, PCB, NettWgs): NOT
 *     imported. DB trigger recomputes statutory + net from the inputs so
 *     the grid is always the source of truth.
 */

import { read, utils, type WorkBook } from 'xlsx'

export interface InfotechRow {
  employeeCode: string
  employeeName: string
  basicSalary: number
  otAmount: number
  nonStatutoryAllowance: number
  noPayDeduction: number // informational (negative in source, positive here)
}

export interface InfotechParseResult {
  rows: InfotechRow[]
  /** Department section found in the file, for display only. */
  departments: string[]
  /** Lines we skipped with the reason — useful for sanity banners. */
  skipped: Array<{ excelRow: number; reason: string }>
  /** Sum of basic + OT + allowance across all rows — sanity-check vs Grand Total. */
  grossSum: number
}

const HEADER_MARKER = 'No.'
const SUBTOTAL_MARKER = 'Sub Total:'
const GRAND_TOTAL_MARKER = 'Grand Total:'
const DEPT_SECTION_MARKER = 'Department:'

/** Parse a File / ArrayBuffer / Uint8Array. Auto-detects xlsx vs CSV. */
export function parseInfotechPayroll(
  buffer: ArrayBuffer | Uint8Array,
): InfotechParseResult {
  const workbook: WorkBook = read(buffer, { type: 'array' })
  const sheetName = workbook.SheetNames[0]
  if (!sheetName) {
    return { rows: [], departments: [], skipped: [], grossSum: 0 }
  }
  const sheet = workbook.Sheets[sheetName]
  // Read as array-of-arrays so positional access is deterministic regardless
  // of multi-row header shenanigans.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const grid: any[][] = utils.sheet_to_json(sheet, { header: 1, blankrows: false, defval: null })
  return parseInfotechGrid(grid)
}

/** Pure parser over a 2-D grid — exported for unit tests. */
export function parseInfotechGrid(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  grid: any[][],
): InfotechParseResult {
  const rows: InfotechRow[] = []
  const departments: string[] = []
  const skipped: Array<{ excelRow: number; reason: string }> = []
  let grossSum = 0
  let dataStarted = false

  for (let i = 0; i < grid.length; i++) {
    const row = grid[i] ?? []
    const excelRow = i + 1
    const col0 = cellStr(row[0])
    const col2 = cellStr(row[2])

    // Department section header — "Code :CR-BD  Department:CR - BUSINESS DEVELOPMENT"
    if (col0.includes(DEPT_SECTION_MARKER)) {
      const match = /Department:\s*(.+?)$/.exec(col0)
      if (match) departments.push(match[1].trim())
      continue
    }

    // Field-name header row ("No. | Code | Emp. Name | ...")
    if (col0 === HEADER_MARKER && cellStr(row[1]) === 'Code') {
      dataStarted = true
      continue
    }

    // Sub Total / Grand Total rows
    if (col2 === SUBTOTAL_MARKER || col2 === GRAND_TOTAL_MARKER) {
      continue
    }

    // Pre-data header rows
    if (!dataStarted) continue

    // Blank or meaningless row (col 0 not a row-number integer)
    const rowNo = Number(col0)
    if (!Number.isFinite(rowNo) || rowNo < 1) {
      skipped.push({ excelRow, reason: `not a data row (col0="${col0}")` })
      continue
    }

    const code = cellStr(row[1]).trim()
    const name = cellStr(row[2]).trim()
    if (!code && !name) {
      skipped.push({ excelRow, reason: 'missing both code and name' })
      continue
    }

    const basic = num(row[3])
    const ot = num(row[4])
    const allow = num(row[7])
    const noPay = num(row[8]) // negative in file; store as positive magnitude
    const gross = num(row[10])

    rows.push({
      employeeCode: code,
      employeeName: name,
      basicSalary: basic,
      otAmount: ot,
      nonStatutoryAllowance: allow,
      noPayDeduction: Math.abs(noPay),
    })
    grossSum += gross
  }

  return { rows, departments, skipped, grossSum }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function cellStr(v: any): string {
  if (v == null) return ''
  return String(v)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function num(v: any): number {
  if (v == null || v === '') return 0
  const n = typeof v === 'number' ? v : parseFloat(String(v))
  return Number.isFinite(n) ? n : 0
}

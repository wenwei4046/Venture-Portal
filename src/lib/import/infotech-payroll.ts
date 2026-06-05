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
 * Our mapping (InfoTech col → hr_monthly_payroll field). Updated 2026-06-05
 * (user decision: the file is the single source of truth — EVERYTHING is
 * imported verbatim, including statutory + gross + net; the system does NOT
 * recompute on import. The earlier 2026-04-26 "never write basic" rule is
 * superseded):
 *   col  1 Code          → matches hr_staff_costs.employee_code (primary match)
 *   col  2 Emp. Name     → matches hr_staff_costs.employee_name (fallback fuzzy)
 *   col  3 Tot. Sal      → basic_salary (per-month figure, verbatim)
 *   col  4 OT Amt        → ot_amount (+ Shift col 5 + Rest/PH col 6 folded in —
 *                          hourly-work earnings; schema has no separate columns)
 *   col  7 Allowance Add → non_statutory_allowance
 *   col  8 No Pay        → parsed for display; NOT converted to leave days —
 *                          the file's gross/net already reflect it
 *   col  9 Bonus         → commission_amount
 *   col 10 Gross         → gross (verbatim)
 *   col 12/13 EPF ER/EE  → epf_er / epf_ee (verbatim)
 *   col 15/16 SOCSO      → socso_er / socso_ee (verbatim)
 *   col 18/19 EIS        → eis_er / eis_ee (verbatim)
 *   col 23 PCB           → pcb (verbatim)
 *   col 25 NettWgs       → net (verbatim)
 *   (col 11 Ded / 21 HRDF / 22 Zakat / 24 CP38 — parsed but no schema column;
 *    HRDF is an employer levy outside payslips, the others are zero in HV data.)
 */

import { read, utils, type WorkBook } from 'xlsx'

export interface InfotechRow {
  employeeCode: string
  employeeName: string
  basicSalary: number
  otAmount: number
  nonStatutoryAllowance: number
  noPayDeduction: number // informational (negative in source, positive here)
  bonus: number
  gross: number
  epfEr: number
  epfEe: number
  socsoEr: number
  socsoEe: number
  eisEr: number
  eisEe: number
  pcb: number
  net: number
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
    // OT + Shift + Rest/PH all land in ot_amount — hourly-work earnings with
    // no dedicated schema columns. Zero in HV data except OT itself.
    const ot = num(row[4]) + num(row[5]) + num(row[6])
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
      bonus: num(row[9]),
      gross,
      epfEr: num(row[12]),
      epfEe: num(row[13]),
      socsoEr: num(row[15]),
      socsoEe: num(row[16]),
      eisEr: num(row[18]),
      eisEe: num(row[19]),
      pcb: num(row[23]),
      net: num(row[25]),
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

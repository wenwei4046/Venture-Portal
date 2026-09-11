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
 *   Code          → matches hr_staff_costs.infotech_code (primary match —
 *                   InfoTech's own number; the portal's employee_code is an
 *                   HV sequence of its own since 2026-09-12, see
 *                   lib/import/staff-match.ts)
 *   Emp. Name     → matches hr_staff_costs.employee_name (fallback fuzzy)
 *   Tot. Sal      → basic_salary (per-month figure, verbatim)
 *   OT Amt        → ot_amount (+ Shift + Rest/PH Amount folded in —
 *                   hourly-work earnings; schema has no separate columns)
 *   Allowance Add → non_statutory_allowance
 *   No Pay        → parsed for display; NOT converted to leave days —
 *                   the file's gross/net already reflect it
 *   Bonus         → commission_amount
 *   Gross         → gross (verbatim; the import writes Gross − Ded, see below)
 *   Ded           → deduction_amount (added 2026-07-02: withheld pay, e.g. a
 *                   month-end joiner whose pro-rata is held to the next cycle.
 *                   InfoTech's Gross is BEFORE Ded and NettWgs is AFTER; our
 *                   schema's gross is after-deduction so CTC excludes it —
 *                   the import therefore writes gross = Gross − Ded.)
 *   EPF ER/EE     → epf_er / epf_ee (verbatim)
 *   SOCSO ER/EE   → socso_er / socso_ee (verbatim)
 *   EIS ER/EE     → eis_er / eis_ee (verbatim)
 *   PCB           → pcb (verbatim)
 *   NettWgs       → net (verbatim — already reflects Ded AND SKBBK)
 *   SKBBK         → skbbk_amount (added 2026-07-03: net-only employee
 *                   deduction — InfoTech's NettWgs is already after it, so
 *                   gross/statutory are untouched; we store it so the grid
 *                   and payslip can show the line.)
 *   (HRDF / Zakat / CP38 — no schema column; HRDF is an employer levy
 *    outside payslips, the others are zero or already inside net.)
 *
 * Columns are located BY HEADER NAME, not fixed position (fix 2026-07-02:
 * the June 2026 export added a new SKBBK column which shifted PCB/NettWgs one
 * position right — the old positional parser silently imported pcb=0 / net=0
 * for the whole month). The statutory blocks all share the same field headers
 * (Emplyr | Emp | Total), so those are mapped by triplet order, which InfoTech
 * fixes as EPF → SOCSO → EIS.
 */

import { read, utils, type WorkBook } from 'xlsx'

export interface InfotechRow {
  employeeCode: string
  employeeName: string
  /** Department section the row sat under ("Department:XX" header), '' if none. */
  department: string
  basicSalary: number
  otAmount: number
  nonStatutoryAllowance: number
  noPayDeduction: number // informational (negative in source, positive here)
  bonus: number
  gross: number
  /** InfoTech "Ded" column — withheld pay, maps to deduction_amount. */
  deduction: number
  /** InfoTech "SKBBK" column — net-only employee deduction, maps to skbbk_amount. */
  skbbk: number
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
  /** Workbook sheet (tab) actually parsed — surfaced so the user can see we
   *  picked the right month when a file carries several monthly tabs. */
  sheetName?: string
  /** Month/year detected in that sheet's title, e.g. "May 2026" (display). */
  sheetPeriodLabel?: string
  /** True when a target period was requested but NO tab in the file matched
   *  it — we fell back to the first report tab, which may be the wrong month.
   *  Drives a "check you imported the right month" warning. */
  periodMismatch?: boolean
}

const HEADER_MARKER = 'No.'
const SUBTOTAL_MARKER = 'Sub Total:'
const GRAND_TOTAL_MARKER = 'Grand Total:'
const DEPT_SECTION_MARKER = 'Department:'

const MONTH_ABBR: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
}
const MONTH_NAME = [
  '', 'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

/** A report tab has the "No. | Code | Emp. Name | …" header row. The machine
 *  INFOTECH tab and the pivot "Details" tab don't, so they're never parsed. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isReportSheet(grid: any[][]): boolean {
  return grid.some(
    (r) => cellStr(r?.[0]) === HEADER_MARKER && cellStr(r?.[1]) === 'Code',
  )
}

/** Pull the month/year a report tab covers from its title
 *  ("… MONTH [May- 2026]") or the "Date : DD/MM/YYYY" line. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function detectSheetPeriod(grid: any[][]): { year: number; month: number; label: string } | null {
  const head = grid.slice(0, 8).map((r) => (r ?? []).map(cellStr).join(' '))
  for (const line of head) {
    const m = /MONTH\s*\[\s*([A-Za-z]{3,})\s*-?\s*(\d{4})\s*\]/i.exec(line)
    if (m) {
      const month = MONTH_ABBR[m[1].slice(0, 3).toLowerCase()]
      if (month) return { year: Number(m[2]), month, label: `${MONTH_NAME[month]} ${m[2]}` }
    }
  }
  for (const line of head) {
    const d = /Date\s*:\s*\d{1,2}\/(\d{1,2})\/(\d{4})/.exec(line)
    if (d) {
      const month = Number(d[1])
      if (month >= 1 && month <= 12) {
        return { year: Number(d[2]), month, label: `${MONTH_NAME[month]} ${d[2]}` }
      }
    }
  }
  return null
}

/**
 * Parse a File / ArrayBuffer / Uint8Array. Auto-detects xlsx vs CSV.
 *
 * Sheet selection (fix 2026-06-26): a workbook may carry several monthly tabs
 * (e.g. "HVH - Mar Ori", "HVH - May", "INFOTECH"). We no longer blindly take
 * the first tab — that imported March (incl. since-resigned staff) for a May
 * file. When `period` is given we pick the report tab whose title month/year
 * matches it; otherwise the first report tab. If a period is requested but no
 * tab matches, we fall back to the first report tab and flag `periodMismatch`.
 */
export function parseInfotechPayroll(
  buffer: ArrayBuffer | Uint8Array,
  period?: string,
): InfotechParseResult {
  const workbook: WorkBook = read(buffer, { type: 'array' })
  if (workbook.SheetNames.length === 0) {
    return { rows: [], departments: [], skipped: [], grossSum: 0 }
  }

  const gridOf = (name: string): any[][] => // eslint-disable-line @typescript-eslint/no-explicit-any
    utils.sheet_to_json(workbook.Sheets[name], { header: 1, blankrows: false, defval: null })

  // Only report-format tabs are parseable. Keep them in workbook order.
  const candidates = workbook.SheetNames
    .map((name) => ({ name, grid: gridOf(name) }))
    .filter((c) => isReportSheet(c.grid))
    .map((c) => ({ ...c, sheetPeriod: detectSheetPeriod(c.grid) }))

  if (candidates.length === 0) {
    // No recognisable report tab — preserve the old behaviour (first sheet).
    return { ...parseInfotechGrid(gridOf(workbook.SheetNames[0])), sheetName: workbook.SheetNames[0] }
  }

  let chosen = candidates[0]
  let periodMismatch = false
  if (period) {
    const year = Number(period.slice(0, 4))
    const month = Number(period.slice(5, 7))
    const match = candidates.find(
      (c) => c.sheetPeriod?.year === year && c.sheetPeriod?.month === month,
    )
    if (match) chosen = match
    else periodMismatch = true
  }

  return {
    ...parseInfotechGrid(chosen.grid),
    sheetName: chosen.name,
    sheetPeriodLabel: chosen.sheetPeriod?.label,
    periodMismatch,
  }
}

/** Column indices resolved from the "No. | Code | Emp. Name | …" header row.
 *  -1 = column absent in this file; num(row[-1]) safely yields 0. */
interface ColumnMap {
  code: number
  name: number
  basic: number
  ot: number
  shift: number
  restPh: number
  allow: number
  noPay: number
  bonus: number
  gross: number
  ded: number
  skbbk: number
  epfEr: number
  epfEe: number
  socsoEr: number
  socsoEe: number
  eisEr: number
  eisEe: number
  pcb: number
  net: number
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildColumnMap(headerRow: any[]): ColumnMap {
  const headers = headerRow.map((c) => cellStr(c).trim())
  const at = (label: string, from = 0): number => {
    const i = headers.findIndex((h, idx) => idx >= from && h === label)
    return i
  }

  const shift = at('Shift')
  // The Rest/PH block's field header is just "Amount" — take the first one
  // after Shift ("CP38 Amount" never matches, comparison is exact).
  const restPh = at('Amount', shift + 1)

  // EPF / SOCSO / EIS all use the same field headers (Emplyr | Emp | Total).
  // InfoTech's block order is fixed: 1st triplet EPF, 2nd SOCSO, 3rd EIS.
  const emplyrs = headers
    .map((h, i) => (h === 'Emplyr' ? i : -1))
    .filter((i) => i >= 0)
  const [epf = -1, socso = -1, eis = -1] = emplyrs
  const ee = (er: number) => (er === -1 ? -1 : er + 1)

  return {
    code: at('Code'),
    name: at('Emp. Name'),
    basic: at('Tot. Sal'),
    ot: at('OT Amt'),
    shift,
    restPh,
    allow: at('Add'),
    noPay: at('No Pay'),
    bonus: at('Bonus'),
    gross: at('Gross'),
    ded: at('Ded'),
    skbbk: at('SKBBK'),
    epfEr: epf,
    epfEe: ee(epf),
    socsoEr: socso,
    socsoEe: ee(socso),
    eisEr: eis,
    eisEe: ee(eis),
    pcb: at('PCB'),
    net: at('NettWgs'),
  }
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
  let cols: ColumnMap | null = null
  let currentDept = ''

  for (let i = 0; i < grid.length; i++) {
    const row = grid[i] ?? []
    const excelRow = i + 1
    const col0 = cellStr(row[0])
    const col2 = cellStr(row[2])

    // Department section header — "Code :CR-BD  Department:CR - BUSINESS DEVELOPMENT"
    if (col0.includes(DEPT_SECTION_MARKER)) {
      const match = /Department:\s*(.+?)$/.exec(col0)
      if (match) {
        currentDept = match[1].trim()
        departments.push(currentDept)
      }
      continue
    }

    // Field-name header row ("No. | Code | Emp. Name | ...") — resolve the
    // column layout from it (repeats per page in some exports; re-resolving
    // is harmless and tracks any mid-file drift).
    if (col0 === HEADER_MARKER && cellStr(row[1]) === 'Code') {
      cols = buildColumnMap(row)
      continue
    }

    // Sub Total / Grand Total rows
    if (col2 === SUBTOTAL_MARKER || col2 === GRAND_TOTAL_MARKER) {
      continue
    }

    // Pre-data header rows
    if (!cols) continue

    // Blank or meaningless row (col 0 not a row-number integer)
    const rowNo = Number(col0)
    if (!Number.isFinite(rowNo) || rowNo < 1) {
      skipped.push({ excelRow, reason: `not a data row (col0="${col0}")` })
      continue
    }

    const code = cellStr(row[cols.code]).trim()
    const name = cellStr(row[cols.name]).trim()
    if (!code && !name) {
      skipped.push({ excelRow, reason: 'missing both code and name' })
      continue
    }

    const basic = num(row[cols.basic])
    // OT + Shift + Rest/PH all land in ot_amount — hourly-work earnings with
    // no dedicated schema columns. Zero in HV data except OT itself.
    const ot = num(row[cols.ot]) + num(row[cols.shift]) + num(row[cols.restPh])
    const allow = num(row[cols.allow])
    const noPay = num(row[cols.noPay]) // negative in file; store as positive magnitude
    const gross = num(row[cols.gross])

    rows.push({
      employeeCode: code,
      employeeName: name,
      department: currentDept,
      basicSalary: basic,
      otAmount: ot,
      nonStatutoryAllowance: allow,
      noPayDeduction: Math.abs(noPay),
      bonus: num(row[cols.bonus]),
      gross,
      deduction: num(row[cols.ded]),
      skbbk: num(row[cols.skbbk]),
      epfEr: num(row[cols.epfEr]),
      epfEe: num(row[cols.epfEe]),
      socsoEr: num(row[cols.socsoEr]),
      socsoEe: num(row[cols.socsoEe]),
      eisEr: num(row[cols.eisEr]),
      eisEe: num(row[cols.eisEe]),
      pcb: num(row[cols.pcb]),
      net: num(row[cols.net]),
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

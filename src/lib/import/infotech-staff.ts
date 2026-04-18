/**
 * Parser for InfoTech HRMS "Active, Newly Joined & Resigned Employees List
 * (By Department)" xlsx export — used for onboarding a batch of staff
 * into the portal from InfoTech's employee master.
 *
 * File shape (positional):
 *   Row 0   Report title
 *   Row 2   Column headers: No | Code | Employee Name | Department |
 *           Designation | (blank) | Basic | Join Date | Termination/Birth Date |
 *           Nric / PPNo | Bank | Branch | A/C No
 *   Row 3   Date banner
 *   Row 4   "ACTIVE EMPLOYEES"
 *   Row 5   "Department Code: H-DO" | "Name: H - DIRECTOR OFFICE"
 *   Row 6+  Employee rows (col 0 = row number within department, integer)
 *   ...     More dept sections under ACTIVE
 *   "NEWLY JOINED EMPLOYEES"   also to be imported — these are active too
 *   "RESIGNED EMPLOYEES"       skipped; resigned rows don't belong in live staff
 *
 * We read dept code from the "Department Code" header to associate each
 * employee with a department. Dept code → portal's `departments.name` is a
 * lookup layer handled server-side (see import/actions.ts).
 */

import { read, utils, type WorkBook } from 'xlsx'

export interface InfotechStaffRow {
  excelRow: number
  employeeCode: string
  employeeName: string
  deptCode: string
  deptName: string
  designation: string | null
  basicSalary: number
  hireDate: string | null
  nric: string | null
  bankCode: string | null
  bankAccountNo: string | null
}

export interface InfotechStaffParseResult {
  rows: InfotechStaffRow[]
  skipped: Array<{ excelRow: number; reason: string }>
  resignedCount: number
}

const ACTIVE_MARKER = 'ACTIVE EMPLOYEES'
const NEWLY_JOINED_MARKER = 'NEWLY JOINED EMPLOYEES'
const RESIGNED_MARKER = 'RESIGNED EMPLOYEES'
const DEPT_HEADER_PREFIX = 'Department Code'

export function parseInfotechStaffXlsx(
  buffer: ArrayBuffer | Uint8Array,
): InfotechStaffParseResult {
  const workbook: WorkBook = read(buffer, { type: 'array' })
  const sheetName = workbook.SheetNames[0]
  if (!sheetName) return { rows: [], skipped: [], resignedCount: 0 }
  const sheet = workbook.Sheets[sheetName]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const grid: any[][] = utils.sheet_to_json(sheet, { header: 1, defval: null })
  return parseInfotechStaffGrid(grid)
}

export function parseInfotechStaffGrid(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  grid: any[][],
): InfotechStaffParseResult {
  const rows: InfotechStaffRow[] = []
  const skipped: Array<{ excelRow: number; reason: string }> = []
  let resignedCount = 0
  let section: 'none' | 'active' | 'joined' | 'resigned' = 'none'
  let currentDeptCode = ''
  let currentDeptName = ''

  for (let i = 0; i < grid.length; i++) {
    const row = grid[i] ?? []
    const excelRow = i + 1
    const col0 = cellStr(row[0]).trim()

    if (col0 === ACTIVE_MARKER) { section = 'active'; continue }
    if (col0 === NEWLY_JOINED_MARKER) { section = 'joined'; continue }
    if (col0 === RESIGNED_MARKER) { section = 'resigned'; continue }

    if (col0.startsWith(DEPT_HEADER_PREFIX)) {
      const codeMatch = /Department Code:\s*(\S+)/.exec(col0)
      if (codeMatch) currentDeptCode = codeMatch[1]
      const nameCell = cellStr(row[1]).trim()
      const nameMatch = /Name:\s*(.+)$/.exec(nameCell)
      currentDeptName = nameMatch ? nameMatch[1].trim() : ''
      continue
    }

    if (section === 'resigned') {
      const rowNo = Number(col0)
      if (Number.isFinite(rowNo) && rowNo >= 1 && cellStr(row[1]).trim()) {
        resignedCount++
      }
      continue
    }

    if (section !== 'active' && section !== 'joined') continue

    const rowNo = Number(col0)
    if (!Number.isFinite(rowNo) || rowNo < 1) continue

    const code = cellStr(row[1]).trim()
    const name = cellStr(row[2]).trim()
    if (!code || !name) {
      skipped.push({ excelRow, reason: 'missing code or name' })
      continue
    }

    rows.push({
      excelRow,
      employeeCode: code,
      employeeName: name,
      deptCode: currentDeptCode,
      deptName: currentDeptName,
      designation: cellStr(row[4]).trim() || null,
      basicSalary: num(row[6]),
      hireDate: parseDDMMYYYY(cellStr(row[7])),
      nric: cellStr(row[9]).trim() || null,
      bankCode: cellStr(row[10]).trim() || null,
      bankAccountNo: cellStr(row[12]).trim() || null,
    })
  }

  return { rows, skipped, resignedCount }
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

function parseDDMMYYYY(s: string): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s.trim())
  if (!m) return null
  const [, dd, mm, yyyy] = m
  // Loose sanity — accept anything that fits DD/MM/YYYY; InfoTech is consistent.
  return `${yyyy}-${mm}-${dd}`
}

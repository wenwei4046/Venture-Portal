/**
 * One-off: import HOUZS Venture staff master (EmpList Mar) + March 2026
 * payroll snapshot (PayrollSummary Mar) from InfoTech exports. Skips
 * HV001-HV004 directors (they live in the director_salary module).
 */
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { read, utils } from 'xlsx'

const EMPLIST = 'C:/Users/User/Downloads/HVenture EmpList Mar.xlsx'
const PAYROLL = 'C:/Users/User/Downloads/HVenture PayrollSummary Mar.xlsx'
const PERIOD = '2026-03-01'
const DAYS_IN_MONTH = 31

const BANK_CODES = {
  '7747': 'Hong Leong Bank',
  '7798': 'Maybank',
  '7830': 'CIMB',
  '7844': 'Alliance Bank',
  '7766': 'Public Bank',
  '7832': 'RHB',
  '7725': 'AmBank',
}

const DEPT_MAP = {
  'H-DO': 'Director Office',
  'H-FIN': 'Finance',
  'H-HR': 'HR',
  'H-MK': 'Marketing',
}

const supa = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
)

function readSheet(path) {
  const buf = fs.readFileSync(path)
  const wb = read(buf, { type: 'buffer' })
  return utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: null })
}

function parseDate(ddmmyyyy) {
  if (!ddmmyyyy) return null
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(ddmmyyyy))
  if (!m) return null
  return `${m[3]}-${m[2]}-${m[1]}`
}

function parseEmpList(grid) {
  const rows = []
  let deptCode = null
  for (const row of grid) {
    const c0 = row[0] == null ? '' : String(row[0])
    // Detect department header: "Department Code: H-XX | Name: ..."
    const deptMatch = /Department Code:\s*(H-[A-Z]+)/.exec(c0)
    if (deptMatch) {
      deptCode = deptMatch[1]
      continue
    }
    const rowNo = Number(c0)
    if (!Number.isFinite(rowNo) || rowNo < 1) continue
    const code = String(row[1] ?? '').trim()
    if (!code) continue
    rows.push({
      code,
      name: String(row[2] ?? '').trim(),
      deptCode,
      designation: String(row[4] ?? '').trim() || null,
      basic: Number(row[6] ?? 0),
      joinDate: parseDate(row[7]),
      birthDate: parseDate(row[8]),
      nric: String(row[9] ?? '').replace(/[-\s]/g, '') || null,
      bankCode: String(row[10] ?? '').trim() || null,
      accountNo: String(row[12] ?? '').trim() || null,
    })
  }
  return rows
}

function parsePayroll(grid) {
  const rows = []
  let dataStarted = false
  for (const row of grid) {
    const c0 = row[0] == null ? '' : String(row[0])
    const c2 = row[2] == null ? '' : String(row[2])
    if (c0 === 'No.' && String(row[1]) === 'Code') { dataStarted = true; continue }
    if (c2 === 'Sub Total:' || c2 === 'Grand Total:') continue
    if (!dataStarted) continue
    const rowNo = Number(c0)
    if (!Number.isFinite(rowNo) || rowNo < 1) continue
    const code = String(row[1] ?? '').trim()
    if (!code) continue
    rows.push({
      code,
      name: String(row[2] ?? '').trim(),
      totSal: Number(row[3] ?? 0),
      otAmt: Number(row[4] ?? 0),
      allowance: Number(row[7] ?? 0),
      noPay: Number(row[8] ?? 0),
    })
  }
  return rows
}

async function main() {
  // 1. Ensure Director Office dept exists
  let { data: doDept } = await supa.from('departments').select('id').eq('name', 'Director Office').maybeSingle()
  if (!doDept) {
    const { data: created, error } = await supa.from('departments').insert({ name: 'Director Office' }).select('id').single()
    if (error) throw error
    doDept = created
    console.log('Created department: Director Office')
  }

  const { data: allDepts } = await supa.from('departments').select('id, name')
  const deptIdByName = new Map(allDepts.map(d => [d.name, d.id]))

  // 2. Find the HR user to be created_by
  const { data: hr } = await supa.from('users').select('id').eq('role', 'hr').eq('is_active', true).limit(1).single()

  // 3. Parse both files
  const empList = parseEmpList(readSheet(EMPLIST))
  const payroll = parsePayroll(readSheet(PAYROLL))
  const payrollByCode = new Map(payroll.map(p => [p.code, p]))

  // 4. Filter out directors (HV001-HV004 in H-DRT)
  const staffToImport = empList.filter(e => e.deptCode !== 'H-DRT')
  console.log(`\nStaff to import: ${staffToImport.length} (skipped ${empList.length - staffToImport.length} directors)`)

  // 5. Insert hr_staff_costs
  const inserted = []
  for (const e of staffToImport) {
    const deptName = DEPT_MAP[e.deptCode]
    if (!deptName) { console.warn('Unknown dept code, skipping:', e.code, e.deptCode); continue }
    const deptId = deptIdByName.get(deptName)
    const bankName = BANK_CODES[e.bankCode] ?? e.bankCode

    const { data, error } = await supa.from('hr_staff_costs').insert({
      employee_name: e.name,
      employee_code: e.code,
      department_id: deptId,
      basic_salary: e.basic,
      allowances: 0,                // statutory (attracts EPF) — default 0, HR sets on grid
      non_statutory_allowance: 0,   // default 0 here; set from payroll below
      hire_date: e.joinDate,
      nric: e.nric,
      bank_name: bankName,
      bank_account_no: e.accountNo,
      status: 'active',
      created_by: hr.id,
    }).select('id, employee_code, basic_salary').single()

    if (error) { console.error('  [FAIL]', e.code, error.message); continue }
    inserted.push({ ...data, empListRow: e })
  }
  console.log(`Inserted ${inserted.length} hr_staff_costs rows`)

  // 6. Insert hr_monthly_payroll for March — basic from EmpList (contract), other fields from PayrollSummary
  let payrollCount = 0
  for (const s of inserted) {
    const p = payrollByCode.get(s.employee_code)
    if (!p) { console.warn('  [SKIP] no payroll row for', s.employee_code); continue }

    // unpaid_leave_days from No Pay deduction: abs(noPay) / (contract_basic / days_in_month)
    const contractBasic = Number(s.basic_salary)
    const dailyBasic = contractBasic > 0 ? contractBasic / DAYS_IN_MONTH : 0
    const unpaidDays = dailyBasic > 0 ? Math.abs(p.noPay) / dailyBasic : 0
    // Round to 0.5
    const unpaidRounded = Math.round(unpaidDays * 2) / 2

    const { error } = await supa.from('hr_monthly_payroll').insert({
      staff_id: s.id,
      period_month: PERIOD,
      basic_salary: contractBasic,  // trigger will pro-rate based on hire_date
      statutory_allowance: 0,
      non_statutory_allowance: p.allowance,
      ot_amount: p.otAmt,
      commission_amount: 0,
      unpaid_leave_days: unpaidRounded,
      source: 'imported',
      status: 'draft',
      created_by: hr.id,
    })
    if (error) { console.error('  [FAIL]', s.employee_code, error.message); continue }
    payrollCount++
  }
  console.log(`Inserted ${payrollCount} hr_monthly_payroll rows for ${PERIOD}`)

  // 7. Summary
  const { data: finalStaff } = await supa.from('hr_staff_costs').select('id, employee_code', { count: 'exact' })
  const { data: finalPayroll } = await supa.from('hr_monthly_payroll').select('id, basic_salary, gross, net', { count: 'exact' }).eq('period_month', PERIOD)
  const totalGross = finalPayroll.reduce((s, r) => s + Number(r.gross), 0)
  const totalNet = finalPayroll.reduce((s, r) => s + Number(r.net), 0)
  console.log(`\n==== Done ====`)
  console.log(`hr_staff_costs rows      : ${finalStaff.length}`)
  console.log(`hr_monthly_payroll rows  : ${finalPayroll.length}`)
  console.log(`March gross total        : RM ${totalGross.toFixed(2)}`)
  console.log(`March net total          : RM ${totalNet.toFixed(2)}`)
  console.log(`InfoTech PayrollSummary Grand Total (reference): Gross RM 167,560.40 · Net RM 141,353.15`)
  console.log(`(Expected difference: our import excludes 4 directors)`)
}

main().catch(e => { console.error(e); process.exit(1) })

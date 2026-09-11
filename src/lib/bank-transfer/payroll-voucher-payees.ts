import type { PayslipPayee } from './alliance-bank'

export interface SalaryBankLine {
  payroll_row_id: string
  employee_name: string
  employee_code: string | null
  salary_component: 'net' | 'basic' | 'commission'
  bank_name: string | null
  bank_account_no: string | null
  net: number | string
  payment_vouchers: { id: string; voucher_no: string; status: string; payment_date: string | null }
}

/** The bank file pays the generated PV snapshots, never a second whole net. */
export function salaryBankPayees(lines: SalaryBankLine[], periodLabel: string): PayslipPayee[] {
  if (!lines.length) throw new Error('Generate salary PVs before downloading their bank file')
  const covered = new Map<string, Set<string>>()
  return lines.map(line => {
    const voucher = line.payment_vouchers
    if (!['pending_approval', 'approved', 'paid'].includes(voucher.status)) throw new Error('Only live generated salary PVs can be exported')
    const components = covered.get(line.payroll_row_id) ?? new Set<string>()
    if (components.has(line.salary_component) || components.has('net') || (line.salary_component === 'net' && components.size)) {
      throw new Error('Overlapping salary PVs were found. Resolve duplicate payment coverage before exporting')
    }
    components.add(line.salary_component)
    covered.set(line.payroll_row_id, components)
    if (!line.bank_name?.trim() || /^\d+$/.test(line.bank_name.trim()) || !line.bank_account_no || !/^\d+$/.test(line.bank_account_no)) {
      throw new Error('A selected salary PV has no valid saved recipient account. Historical PVs without bank snapshots cannot be exported here')
    }
    const amount = Number(line.net)
    if (!Number.isFinite(amount) || amount <= 0) throw new Error('The salary PV has an invalid payment amount')
    if (!voucher.payment_date || !/^\d{4}-\d{2}-\d{2}$/.test(voucher.payment_date)) throw new Error('The salary PV needs a payment date')
    return {
      employeeName: line.employee_name, employeeCode: line.employee_code,
      bankName: line.bank_name, bankAccountNo: line.bank_account_no,
      amount, voucherNo: voucher.voucher_no, paymentDate: voucher.payment_date,
      periodLabel: `${periodLabel}${line.salary_component === 'net' ? '' : line.salary_component === 'basic' ? ' Basic' : ' Commission'}`,
    }
  })
}

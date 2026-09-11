/**
 * Alliance Bank bulk payment CSV generator.
 *
 * Two-step HV salary flow:
 *   1. Finance transfers the month's payroll total from HL Bank → Alliance
 *      Bank as one lump sum. That's the payroll_bank_transfer voucher;
 *      accounting-wise, the cash consolidates into HR Department Pool
 *      (dept_pools, department = HR) post-Stage-6.
 *   2. HR exports THIS CSV from the payroll grid and uploads it to the
 *      Alliance Bank portal to disburse to each employee.
 *
 * So this file is the Step-2 CSV — Alliance Bank's bulk payment format,
 * uploaded by HR, paying out of the Alliance account.
 *
 * Schema below is a pragmatic approximation. Verify against an actual
 * Alliance Bank bulk-payment sample file before going live; column names
 * and order typically differ slightly from this template.
 *
 *   PAYMENT_DATE,CURRENCY,AMOUNT,BENEFICIARY_BANK,BENEFICIARY_ACCOUNT,
 *   BENEFICIARY_NAME,PAYER_REFERENCE,BENEFICIARY_REFERENCE
 *
 * - PAYMENT_DATE: DDMMYYYY
 * - CURRENCY: always MYR
 * - AMOUNT: decimal with 2 places, no thousands separator
 * - BENEFICIARY_BANK: free text
 * - BENEFICIARY_ACCOUNT: digits only
 * - BENEFICIARY_NAME: 1-40 chars, ASCII-safe
 * - PAYER_REFERENCE: our reference shown on Alliance statement (voucher_no or emp code)
 * - BENEFICIARY_REFERENCE: shown on employee's statement (e.g. "Salary Apr 2026")
 *
 * Any row missing bank_account_no is skipped with a `missingBank` entry
 * in the result so the caller can surface those to HR before upload.
 */

export interface PayslipPayee {
  employeeName: string
  employeeCode: string | null
  bankName: string | null
  bankAccountNo: string | null
  amount: number
  voucherNo: string | null
  /** The period label for the beneficiary's reference, e.g. "Apr 2026" */
  periodLabel: string
  /** Salary PV date, frozen independently for each component/batch. */
  paymentDate?: string | null
}

export interface AllianceBankResult {
  csv: string
  rowCount: number
  missingBank: Array<{ employeeName: string; reason: 'missing_account' | 'missing_bank' }>
  totalAmount: number
}

const HEADERS = [
  'PAYMENT_DATE',
  'CURRENCY',
  'AMOUNT',
  'BENEFICIARY_BANK',
  'BENEFICIARY_ACCOUNT',
  'BENEFICIARY_NAME',
  'PAYER_REFERENCE',
  'BENEFICIARY_REFERENCE',
]

function formatPaymentDate(date: Date): string {
  const d = String(date.getUTCDate()).padStart(2, '0')
  const m = String(date.getUTCMonth() + 1).padStart(2, '0')
  const y = String(date.getUTCFullYear())
  return `${d}${m}${y}`
}

function csvEscape(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

function sanitiseName(name: string): string {
  // Alliance Bank's bulk upload rejects non-ASCII in the beneficiary name field.
  // Strip diacritics, drop other non-ASCII, collapse whitespace, truncate to 40.
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    // eslint-disable-next-line no-control-regex
    .replace(/[^\x20-\x7E]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 40)
}

export function generateAllianceBankCsv(
  payees: PayslipPayee[],
  paymentDate: Date,
): AllianceBankResult {
  const rows: string[] = [HEADERS.join(',')]
  const missingBank: AllianceBankResult['missingBank'] = []
  let totalAmount = 0
  let rowCount = 0

  const dateStr = formatPaymentDate(paymentDate)

  for (const p of payees) {
    if (!p.bankAccountNo) {
      missingBank.push({ employeeName: p.employeeName, reason: 'missing_account' })
      continue
    }
    if (!p.bankName) {
      missingBank.push({ employeeName: p.employeeName, reason: 'missing_bank' })
      continue
    }
    const amount = p.amount.toFixed(2)
    totalAmount += p.amount
    rowCount++

    const cells = [
      p.paymentDate ? formatPaymentDate(new Date(`${p.paymentDate}T00:00:00Z`)) : dateStr,
      'MYR',
      amount,
      csvEscape(p.bankName),
      csvEscape(p.bankAccountNo),
      csvEscape(sanitiseName(p.employeeName)),
      csvEscape(p.voucherNo ?? p.employeeCode ?? ''),
      csvEscape(`Salary ${p.periodLabel}`),
    ]
    rows.push(cells.join(','))
  }

  return {
    csv: rows.join('\r\n') + '\r\n',
    rowCount,
    missingBank,
    totalAmount: Number(totalAmount.toFixed(2)),
  }
}

/**
 * Hong Leong Connect bulk payment CSV generator.
 *
 * HV uses Hong Leong as the main bank; HR exports this file from the
 * payroll grid and uploads it to the HL Connect portal to execute
 * the month's salary transfers in one go.
 *
 * Schema (approximation — the real HL Connect upload template varies
 * slightly over time; regenerate against the portal's latest sample
 * when a new format is published):
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
 * - PAYER_REFERENCE: our reference shown on HV's statement (voucher_no)
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
}

export interface HlConnectResult {
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
  // HL Connect rejects non-ASCII characters in the beneficiary name field.
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

export function generateHlConnectCsv(
  payees: PayslipPayee[],
  paymentDate: Date,
): HlConnectResult {
  const rows: string[] = [HEADERS.join(',')]
  const missingBank: HlConnectResult['missingBank'] = []
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
      dateStr,
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

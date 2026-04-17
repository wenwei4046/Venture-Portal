import { describe, it, expect } from 'vitest'
import { generateAllianceBankCsv, type PayslipPayee } from './alliance-bank'

const PAYMENT_DATE = new Date(Date.UTC(2026, 3, 28)) // 28 April 2026 → 28042026

const baseline: PayslipPayee = {
  employeeName: 'Aini binti Rahman',
  employeeCode: 'EMP-001',
  bankName: 'Maybank',
  bankAccountNo: '1234567890',
  amount: 3926.3,
  voucherNo: 'HV-PV-202604-0002',
  periodLabel: 'Apr 2026',
}

describe('generateAllianceBankCsv', () => {
  it('emits header row + one row per complete payee', () => {
    const result = generateAllianceBankCsv([baseline], PAYMENT_DATE)
    const lines = result.csv.trim().split('\r\n')
    expect(lines).toHaveLength(2)
    expect(lines[0]).toBe(
      'PAYMENT_DATE,CURRENCY,AMOUNT,BENEFICIARY_BANK,BENEFICIARY_ACCOUNT,BENEFICIARY_NAME,PAYER_REFERENCE,BENEFICIARY_REFERENCE',
    )
    expect(lines[1]).toBe(
      '28042026,MYR,3926.30,Maybank,1234567890,Aini binti Rahman,HV-PV-202604-0002,Salary Apr 2026',
    )
  })

  it('formats payment date as DDMMYYYY', () => {
    const result = generateAllianceBankCsv([baseline], new Date(Date.UTC(2026, 0, 5)))
    expect(result.csv).toContain('05012026')
  })

  it('formats amount with 2 decimal places', () => {
    const result = generateAllianceBankCsv([{ ...baseline, amount: 5000 }], PAYMENT_DATE)
    expect(result.csv).toContain(',5000.00,')
  })

  it('rowCount + totalAmount reflect emitted rows only', () => {
    const payees: PayslipPayee[] = [
      baseline,
      { ...baseline, employeeName: 'Ali', amount: 4747.9 },
      { ...baseline, employeeName: 'Chong', amount: 3213.8 },
    ]
    const result = generateAllianceBankCsv(payees, PAYMENT_DATE)
    expect(result.rowCount).toBe(3)
    expect(result.totalAmount).toBe(3926.3 + 4747.9 + 3213.8)
    expect(result.missingBank).toHaveLength(0)
  })

  it('skips payees missing bank_account_no and reports them', () => {
    const payees: PayslipPayee[] = [
      baseline,
      { ...baseline, employeeName: 'David', bankAccountNo: null },
    ]
    const result = generateAllianceBankCsv(payees, PAYMENT_DATE)
    expect(result.rowCount).toBe(1)
    expect(result.missingBank).toEqual([
      { employeeName: 'David', reason: 'missing_account' },
    ])
  })

  it('skips payees missing bank_name and reports them', () => {
    const payees: PayslipPayee[] = [
      baseline,
      { ...baseline, employeeName: 'Mei Ling', bankName: null },
    ]
    const result = generateAllianceBankCsv(payees, PAYMENT_DATE)
    expect(result.rowCount).toBe(1)
    expect(result.missingBank).toEqual([
      { employeeName: 'Mei Ling', reason: 'missing_bank' },
    ])
  })

  it('escapes fields containing commas or quotes', () => {
    const payee: PayslipPayee = {
      ...baseline,
      employeeName: 'Smith, Jr.',
      bankName: 'Hong "Leong" Bank',
    }
    const result = generateAllianceBankCsv([payee], PAYMENT_DATE)
    expect(result.csv).toContain('"Hong ""Leong"" Bank"')
    expect(result.csv).toContain('"Smith, Jr."')
  })

  it('strips diacritics from the beneficiary name (Alliance rejects non-ASCII)', () => {
    const payee: PayslipPayee = { ...baseline, employeeName: 'Nadège Müller-Őstböö' }
    const result = generateAllianceBankCsv([payee], PAYMENT_DATE)
    expect(result.csv).toContain('Nadege Muller-Ostboo')
  })

  it('truncates beneficiary name to 40 chars', () => {
    const longName = 'Tan Hock Seng Bin Abdullah And A Very Long Tail'
    const payee: PayslipPayee = { ...baseline, employeeName: longName }
    const result = generateAllianceBankCsv([payee], PAYMENT_DATE)
    const line = result.csv.split('\r\n')[1]
    const nameField = line.split(',')[5]
    expect(nameField.length).toBeLessThanOrEqual(40)
  })

  it('ends with CRLF', () => {
    const result = generateAllianceBankCsv([baseline], PAYMENT_DATE)
    expect(result.csv.endsWith('\r\n')).toBe(true)
  })

  it('handles empty payee list — headers only', () => {
    const result = generateAllianceBankCsv([], PAYMENT_DATE)
    expect(result.csv.trim().split('\r\n')).toHaveLength(1)
    expect(result.rowCount).toBe(0)
    expect(result.totalAmount).toBe(0)
  })
})

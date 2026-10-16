// @vitest-environment node
import React from 'react'
import { beforeAll, describe, expect, it } from 'vitest'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import PDFParser, { type Output } from 'pdf2json'
import { renderPdfBuffer } from '@/lib/export/pdf'
import { VoucherDocPdf, voucherHeadline, type SalaryPaymentData, type StatutoryCoverageData, type VoucherDocData } from './voucher-doc-pdf'

function line(index: number, longName = false): StatutoryCoverageData {
  return {
    id: `line-${index}`, scope: 'staff', payroll_row_id: `row-${index}`,
    employee_name: longName ? `Test Employee ${index} With A Long Family Name For Page Wrapping` : `Test Employee ${index}`,
    employee_code: `TEST${String(index).padStart(3, '0')}`, department_name: 'Original Finance Department',
    period_month: '2026-08-01', scheme: 'KWSP', amount: (index + 1) * 100.10,
  }
}

function voucher(id: string, coverage?: StatutoryCoverageData[]): VoucherDocData {
  const amount = coverage?.reduce((sum, row) => sum + row.amount, 0) ?? 125
  return {
    id, voucher_no: `TEST-PV-${id}`, voucher_type: 'payment', direction: 'debit', status: 'pending_approval',
    amount, payment_date: '2026-09-15', created_at: '2026-09-11T00:00:00Z',
    payee_name: coverage ? 'KWSP' : 'Ordinary Payee', payee_kind: null, method: 'Bank transfer',
    bank: { name: 'Test Bank', number: '1234' }, description: 'Test fixture for voucher layout.', notes: null,
    payment_reference: null, sources: [{ pool_label: 'HR Dept Pool', account_label: 'Contribution payable', amount }],
    statutory_coverage: coverage,
  }
}

function parse(buffer: Buffer): Promise<Output> {
  return new Promise((resolve, reject) => {
    const parser = new PDFParser()
    parser.on('pdfParser_dataReady', resolve)
    parser.on('pdfParser_dataError', (error) => reject(error.parserError ?? error))
    parser.parseBuffer(Buffer.from(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)))
  })
}

let document: Output
const largeCoverage = Array.from({ length: 60 }, (_, index) => line(index, true))
const text = (page: Output['Pages'][number]) => page.Texts.map((item) => item.R.map((run) => decodeURIComponent(run.T)).join('')).join(' ').replace(/\s+/g, ' ')

beforeAll(async () => {
  const buffer = await renderPdfBuffer(<VoucherDocPdf vouchers={[voucher('THREE', [line(0), line(1), line(2)]), voucher('LARGE', largeCoverage), voucher('ORDINARY')]} />)
  if (process.env.VOUCHER_PDF_QA_DIR) {
    await mkdir(process.env.VOUCHER_PDF_QA_DIR, { recursive: true })
    await writeFile(path.join(process.env.VOUCHER_PDF_QA_DIR, 'statutory-coverage.pdf'), buffer)
  }
  document = await parse(buffer)
}, 30000)

describe('statutory coverage PDF layout', () => {
  it('prints the exact three selected employees, recorded department, scheme and contribution total', () => {
    const page = document.Pages[1]
    const content = text(page)
    expect(content).toContain('Statutory contribution details')
    expect(content).toContain('August 2026')
    expect(content).toContain('3 people')
    for (const index of [0, 1, 2]) expect(content).toContain(`TEST00${index}`)
    expect(content).not.toContain('TEST003')
    expect(content).toContain('Original Finance Department')
    expect(content).toContain('KWSP')
    expect(content).toContain('600.60')
    const employee = page.Texts.find((item) => item.R.some((run) => decodeURIComponent(run.T) === 'Test Employee 0'))!
    const department = page.Texts.find((item) => item.R.some((run) => decodeURIComponent(run.T).startsWith('Original Finance')) )!
    const amount = page.Texts.find((item) => item.R.some((run) => decodeURIComponent(run.T) === 'RM 100.10'))!
    expect(employee.x).toBeLessThan(department.x)
    expect(department.x).toBeLessThan(amount.x)
  })

  it('paginates a large department with each recorded employee once, repeated headings and no footer collisions', () => {
    const pages = document.Pages.slice(3, -1)
    expect(pages.length).toBeGreaterThan(1)
    const content = pages.map(text).join(' ')
    for (let i = 0; i < largeCoverage.length; i++) {
      expect(content.match(new RegExp(`TEST${String(i).padStart(3, '0')}`, 'g'))).toHaveLength(1)
    }
    expect(content).toContain('183,183.00')
    for (const page of pages) {
      const pageContent = text(page)
      expect(pageContent).toContain('Statutory contribution details')
      expect(pageContent).toContain('Contribution')
      const footer = page.Texts.find((item) => item.R.some((run) => decodeURIComponent(run.T).includes('· Statutory contribution details')) )!
      // Everything but the footer and its page count sits above the footer.
      const tableItems = page.Texts.filter((item) => item.R.every((run) => !/· Statutory contribution details|^Page \d+ of \d+$/.test(decodeURIComponent(run.T))))
      expect(Math.max(...tableItems.map((item) => item.y))).toBeLessThan(footer.y - 0.5)
    }
  })

  it('keeps an ordinary voucher on its existing document page with no contribution appendix', () => {
    const content = text(document.Pages.at(-1)!)
    expect(content).toContain('Ordinary Payee')
    expect(content).toContain('Payment voucher')
    expect(content).toContain('125.00')
    expect(content).not.toContain('Statutory contribution details')
  })
})

describe('salary receiving account PDF snapshots', () => {
  let salaryDocument: Output
  const salaryLine = (index: number, override: Partial<SalaryPaymentData> = {}): SalaryPaymentData => ({
    id: `salary-${index}`, scope: 'staff', payroll_row_id: `salary-row-${index}`,
    employee_name: `Synthetic Salary Employee ${index} With A Long Family Name`, employee_code: `SAL${String(index).padStart(3, '0')}`,
    department_name: 'Original Revenue Department', period_month: '2026-09-01', net: 100,
    salary_component: 'commission', recipient_account: 'account_2', bank_name: 'Recorded Hong Leong Bank', bank_account_no: `009876543210${String(index).padStart(2, '0')}`,
    ...override,
  })
  const salaryVoucher = (id: string, lines: SalaryPaymentData[]): VoucherDocData => ({
    ...voucher(id), payee_name: 'Synthetic Salary Recipients', amount: lines.reduce((sum, item) => sum + item.net, 0), salary_payments: lines,
    sources: [{ pool_label: 'HR Dept Pool', account_label: 'Salary payable', amount: lines.reduce((sum, item) => sum + item.net, 0) }],
  })

  beforeAll(async () => {
    const buffer = await renderPdfBuffer(<VoucherDocPdf vouchers={[
      salaryVoucher('SPLIT', [
        salaryLine(0, { payroll_row_id: 'split-person', employee_name: 'Synthetic Split Employee', employee_code: 'SPLIT001', salary_component: 'basic', recipient_account: 'account_1', bank_name: 'Recorded Maybank', bank_account_no: '0012345678', net: 4302.70 }),
        salaryLine(1, { payroll_row_id: 'split-person', employee_name: 'Synthetic Split Employee', employee_code: 'SPLIT001', bank_name: 'Recorded CIMB', bank_account_no: '0098765432', net: 4253.45 }),
      ]),
      salaryVoucher('LARGE-SALARY', Array.from({ length: 60 }, (_, index) => salaryLine(index))),
      salaryVoucher('LEGACY-SALARY', [salaryLine(99, { salary_component: 'net', recipient_account: null, bank_name: null, bank_account_no: null })]),
    ]} />)
    if (process.env.VOUCHER_PDF_QA_DIR) {
      await mkdir(process.env.VOUCHER_PDF_QA_DIR, { recursive: true })
      await writeFile(path.join(process.env.VOUCHER_PDF_QA_DIR, 'salary-recipient-snapshots.pdf'), buffer)
    }
    salaryDocument = await parse(buffer)
  }, 30000)

  it('prints both chosen banks, complete account numbers, net basic and commission amounts', () => {
    const content = text(salaryDocument.Pages[1])
    for (const expected of ['Salary payment details', '1 person', 'Basic salary (net)', 'Commission', 'Account 1', 'Account 2', 'Recorded Maybank', 'Recorded CIMB', '0012345678', '0098765432', '4,302.70', '4,253.45', '8,556.15']) {
      expect(content).toContain(expected)
    }
  })

  it('paginates compiled salary payments with complete snapshots and repeated headings', () => {
    const pages = salaryDocument.Pages.filter(page => text(page).includes('TEST-PV-LARGE-SALARY · Salary payment details'))
    expect(pages.length).toBeGreaterThan(1)
    const all = pages.map(text).join(' ')
    for (let i = 0; i < 60; i++) {
      expect(all.match(new RegExp(`SAL${String(i).padStart(3, '0')}`, 'g'))).toHaveLength(1)
      expect(all).toContain(`009876543210${String(i).padStart(2, '0')}`)
    }
    expect(all).toContain('6,000.00')
    for (const page of pages) {
      expect(text(page)).toContain('Receiving account')
      const footer = page.Texts.find(item => item.R.some(run => decodeURIComponent(run.T).includes('· Salary payment details')))!
      const rest = page.Texts.filter(item => item.R.every(run => !/· Salary payment details|^Page \d+ of \d+$/.test(decodeURIComponent(run.T))))
      expect(Math.max(...rest.map(item => item.y))).toBeLessThan(footer.y - 0.5)
    }
  })

  it('keeps legacy net payments visible without guessing their historical bank', () => {
    const content = text(salaryDocument.Pages.at(-1)!)
    expect(content).toContain('Net salary')
    expect(content).toContain('Bank details not recorded')
    expect(content).not.toContain('Recorded Hong Leong Bank')
    expect(content).not.toContain('Account 1')
    expect(content).not.toContain('Account 2')
  })
})

// The Finance revamp v2's sheet (2026-10-15, README §3 — P02 a receipt, P03 a
// payment voucher): their own words, the approval list, the signature lines.
describe('a receipt and a payment voucher, as the design draws them', () => {
  let sheets: Output
  // pdf2json reads the en dash before a negative amount as "– " (the page draws "–RM").
  const words = (page: Output['Pages'][number]) => text(page).replace(/– RM/g, '–RM')
  beforeAll(async () => {
    const base = { voucher_type: 'payment', created_at: '2026-10-06T01:12:00Z', notes: null, target_pool_label: null }
    sheets = await parse(await renderPdfBuffer(<VoucherDocPdf vouchers={[
      {
        ...base, id: 'or', voucher_no: 'HV-OR-202610-0020', direction: 'credit', status: 'paid', amount: 150000, payment_date: '2026-10-07',
        payee_name: 'HOUZS Bedding (HB)', payee_kind: 'Group company', method: 'Bank transfer', bank: { name: 'Alliance Bank', number: '1200-4410-0091' },
        description: 'Advance repayment', payment_reference: 'IBG-HB-071026-88',
        sources: [{ pool_label: 'Venture Pool', account_label: '1200 · Loans to Subsidiaries', amount: 150000 }],
        approval: { created: { by: 'Aina Rahman', at: '2026-10-07T01:00:00Z' }, submitted: null, approved: null, paid: null },
      },
      {
        ...base, id: 'pv', voucher_no: 'HV-PV-202610-0044', direction: 'debit', status: 'approved', amount: 25000, payment_date: '2026-10-06',
        payee_name: 'Meta Platforms Ireland', payee_kind: null, method: 'Bank transfer', bank: { name: 'Hong Leong Bank', number: '5123-0098-77' },
        description: 'FB ads top-up', payment_reference: null, sources: [{ pool_label: 'Marketing Pool', account_label: '6100 · Advertising', amount: 25000 }],
        approval: { created: { by: 'Aina', at: '2026-10-06T01:12:00Z' }, submitted: { by: 'Aina', at: '2026-10-06T01:30:00Z' }, approved: { by: 'Loo K.W.', at: '2026-10-06T06:08:00Z' }, paid: null },
      },
    ]} />))
  }, 30000)

  it('a receipt: paid on its day, credited to its pool, Received by · Company stamp', () => {
    const content = words(sheets.Pages[0])
    for (const w of [
      'Receipt', 'Receipt number', 'HV-OR-202610-0020', 'Date paid', '7 October 2026', 'Payment method', 'Bank transfer · Alliance Bank 1200-4410-0091', 'Reference', 'IBG-HB-071026-88',
      'HOUZS Venture Holding Sdn Bhd', 'Internal banking · Shared services', 'hello@houzsventure.com',
      'Received from', 'HOUZS Bedding (HB)', 'Group company', 'RM 150,000.00 paid on 7 October 2026',
      'Description', 'Credited to', 'Advance repayment', '1200 · Loans to Subsidiaries', 'Venture Pool', 'Total', 'Amount paid', 'RM 150,000.00',
      'Received by · Aina Rahman', 'Company stamp', 'HV-OR-202610-0020 · RM 150,000.00 paid on 7 October 2026', 'Page 1 of 1',
    ]) {
      expect(content, w).toContain(w)
    }
  })

  it('a payment voucher: to pay on its day, deducted from its pool, the approval step by step, three signatures', () => {
    const content = words(sheets.Pages[1])
    for (const w of [
      'Payment voucher', 'Voucher number', 'HV-PV-202610-0044', 'Payment date', '6 October 2026', 'Pay from', 'Hong Leong Bank · 5123-0098-77', 'Status', 'Approved',
      'HOUZS Venture Holding Sdn Bhd', 'hello@houzsventure.com',
      'Pay to', 'Meta Platforms Ireland', 'Bank transfer', 'RM 25,000.00 to pay on 6 October 2026', 'FB ads top-up',
      'Deducted from', 'Account', 'Marketing Pool', '6100 · Advertising', 'Total RM 25,000.00',
      'Approval', 'Created Aina · 6 Oct 2026, 09:12', 'Submitted Aina · 6 Oct 2026, 09:30', 'Approved Loo K.W. · 6 Oct 2026, 14:08', 'Paid Not yet',
      'Prepared by · Aina', 'Approved by · Loo K.W.', 'Received by', 'HV-PV-202610-0044 · RM 25,000.00 to Meta Platforms Ireland',
    ]) {
      expect(content, w).toContain(w)
    }
  })

  it('the headline says paid once it is, voided when it is', () => {
    expect(voucherHeadline({ direction: 'debit', status: 'paid', amount: 10, payment_date: '2026-10-06' })).toBe('RM 10.00 paid on 6 October 2026')
    expect(voucherHeadline({ direction: 'debit', status: 'draft', amount: 10, payment_date: null })).toBe('RM 10.00 to pay')
    expect(voucherHeadline({ direction: 'credit', status: 'voided', amount: 10, payment_date: '2026-10-06' })).toBe('RM 10.00 voided')
  })
})

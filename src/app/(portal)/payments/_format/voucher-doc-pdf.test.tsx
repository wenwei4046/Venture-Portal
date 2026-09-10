// @vitest-environment node
import React from 'react'
import { beforeAll, describe, expect, it } from 'vitest'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import PDFParser, { type Output } from 'pdf2json'
import { renderPdfBuffer } from '@/lib/export/pdf'
import { VoucherDocPdf, type StatutoryCoverageData, type VoucherDocData } from './voucher-doc-pdf'

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
    payee_name: coverage ? 'KWSP' : 'Ordinary Payee', payee_sub: null,
    bank_label: 'Test Bank - 1234', description: 'Test fixture for voucher layout.', notes: null,
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
    const amount = page.Texts.find((item) => item.R.some((run) => decodeURIComponent(run.T) === '100.10'))!
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
      expect(pageContent).toContain('CONTRIBUTION (RM)')
      const footer = page.Texts.find((item) => item.R.some((run) => decodeURIComponent(run.T).includes('Statutory contribution details -')) )!
      const tableItems = page.Texts.filter((item) => item !== footer)
      expect(Math.max(...tableItems.map((item) => item.y))).toBeLessThan(footer.y - 0.5)
    }
  })

  it('keeps an ordinary voucher on its existing document page with no contribution appendix', () => {
    const content = text(document.Pages.at(-1)!)
    expect(content).toContain('Ordinary Payee')
    expect(content).toContain('PAYMENT VOUCHER')
    expect(content).toContain('125.00')
    expect(content).not.toContain('Statutory contribution details')
  })
})

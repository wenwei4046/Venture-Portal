// @vitest-environment node
import React from 'react'
import { beforeAll, describe, expect, it } from 'vitest'
import PDFParser, { type Output } from 'pdf2json'
import { renderPdfBuffer } from '@/lib/export/pdf'
import { InvoiceDocPdf, invoiceHeadline, type InvoiceDocData } from './invoice-doc-pdf'

// An invoice's document (2026-10-15, the Finance revamp v2 — README §3, P01):
// rendered for real and read back — what it says and where it landed.

function parse(buffer: Buffer): Promise<Output> {
  return new Promise((resolve, reject) => {
    const parser = new PDFParser()
    parser.on('pdfParser_dataReady', resolve)
    parser.on('pdfParser_dataError', (error) => reject(error.parserError ?? error))
    parser.parseBuffer(Buffer.from(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)))
  })
}
type PdfPage = Output['Pages'][number]
const words = (page: PdfPage) => page.Texts.map((item) => item.R.map((run) => decodeURIComponent(run.T)).join(''))
// pdf2json reads the en dash before a negative amount as "– " (the page draws "–RM").
const text = (page: PdfPage) => words(page).join(' ').replace(/\s+/g, ' ').replace(/– RM/g, '–RM')
const at = (page: PdfPage, w: string) => page.Texts.find((item) => item.R.map((run) => decodeURIComponent(run.T)).join('') === w)!

const ISSUED: InvoiceDocData = {
  id: 'i24', invoice_no: 'HV-INV-202610-0024', status: 'issued', period_month: '2026-10-01', invoice_date: '2026-10-12', due_date: '2026-10-15',
  reference_no: null, description: 'Director Remuneration & Operation Management Fees', billing_mode_label: 'Venture (HV) OPEX',
  bill_to: { name: 'Hookka', kind: 'Subsidiary · HK', contact: [] },
  lines: [{ description: 'Director Remuneration', amount: 50000 }, { description: 'Operation Management Fees', amount: 13440 }],
  total: 63440, credited: 0, received: 0, remaining: 63440, paid_on: null,
}

let doc: Output
beforeAll(async () => {
  doc = await parse(
    await renderPdfBuffer(
      <InvoiceDocPdf
        invoices={[
          ISSUED,
          // Part-paid, credited: what it still asks for.
          { ...ISSUED, id: 'i13', invoice_no: 'HV-INV-202610-0013', total: 2204, credited: 100, received: 500, remaining: 1604, lines: [] , description: 'HR shared service — Oct' },
          // A consolidated payroll invoice, its departments grouped.
          {
            ...ISSUED, id: 'i60', invoice_no: 'HV-INV-202609-0060', status: 'paid', billing_mode_label: 'Payroll (consolidated)', total: 4085, received: 4085, remaining: 0, paid_on: '2026-10-09',
            bill_to: { name: 'Marketing', kind: 'Department pool', contact: [] },
            lines: [{ description: 'Salary', amount: 3000, segment: 'hr' }, { description: 'Salary', amount: 1085, segment: 'finance' }],
          },
          // Someone outside the group, with how to reach them; a draft.
          {
            ...ISSUED, id: 'i9', invoice_no: null, status: 'draft', reference_no: 'Q-77', bill_to: { name: 'Rygis Private Gym', kind: 'External party', contact: ['Lot 12, Jalan Kenari 5', 'hello@rygis.my'] },
          },
        ]}
      />,
    ),
  )
}, 30000)

describe('an invoice’s document', () => {
  it('says the design’s words, top to bottom', () => {
    const page = doc.Pages[0]
    const content = text(page)
    for (const w of [
      'Invoice', 'Invoice number', 'HV-INV-202610-0024', 'Date of issue', '12 October 2026', 'Date due', '15 October 2026', 'Period', 'October 2026',
      'HOUZS Venture Holding Sdn. Bhd.', 'Internal banking · Shared services', 'Director salary distribution', 'hello@houzsventure.com',
      'Bill to', 'Hookka', 'Subsidiary · HK', 'Venture (HV) OPEX',
      'RM 63,440.00 due 15 October 2026', 'Director Remuneration & Operation Management Fees',
      'Description', 'Qty', 'Unit price', 'Amount', 'Director Remuneration', 'Oct 1 – Oct 31, 2026', 'RM 50,000.00', 'RM 13,440.00',
      'Subtotal', 'Total', 'Amount due', 'RM 63,440.00',
      'Payment details', 'Account name', 'Houzs Venture Holding Sdn Bhd', 'Hong Leong Bank Berhad', '23600599248', 'Kindly quote the invoice number as your payment reference.',
      'HV-INV-202610-0024 · RM 63,440.00 due 15 October 2026', 'Page 1 of 1',
    ]) {
      expect(content, w).toContain(w)
    }
    // The issuer is Holding, no s, its email (the user's, 2026-10-16) the last line under its
    // lines of work, in its column; no status on an issued one.
    expect(content).not.toContain('Holdings')
    const issuer = at(page, 'HOUZS Venture Holding Sdn. Bhd.')
    const mail = at(page, 'hello@houzsventure.com')
    expect(mail.x).toBeCloseTo(issuer.x, 2)
    expect(mail.y).toBeGreaterThan(at(page, 'Director salary distribution').y)
    expect(content.match(/@/g)).toHaveLength(1)
    expect(content).not.toContain('Status')
  })

  it('lays the line out in its columns, the footer under everything, on the page', () => {
    const page = doc.Pages[0]
    const row = ['Director Remuneration', '1'].map((w) => at(page, w))
    const money = page.Texts.filter((item) => words({ ...page, Texts: [item] })[0] === 'RM 50,000.00')
    expect(money).toHaveLength(2) // the unit price and the amount
    const [desc, qty] = row
    const [unit, amount] = money.sort((a, b) => a.x - b.x)
    expect(desc.x).toBeLessThan(qty.x)
    expect(qty.x).toBeLessThan(unit.x)
    expect(unit.x).toBeLessThan(amount.x)
    const footer = at(page, 'HV-INV-202610-0024 · RM 63,440.00 due 15 October 2026')
    const count = at(page, 'Page 1 of 1')
    expect(Math.abs(footer.y - count.y)).toBeLessThan(0.2)
    expect(count.x).toBeGreaterThan(footer.x)
    const rest = page.Texts.filter((item) => item !== footer && item !== count)
    expect(Math.max(...rest.map((item) => item.y))).toBeLessThan(footer.y - 0.5)
    // On the sheet: pdf2json's page is 841.89pt tall in its own units.
    expect(footer.y).toBeGreaterThan(0)
    expect(footer.y).toBeLessThan(page.Height)
  })

  it('a part-paid invoice asks for what is left, its credit notes and payments said', () => {
    const content = text(doc.Pages[1])
    expect(content).toContain('RM 1,604.00 due 15 October 2026')
    expect(content).toContain('Credit notes –RM 100.00')
    expect(content).toContain('Paid –RM 500.00')
    expect(content).toContain('Amount due RM 1,604.00')
    // A simple invoice is its own one line.
    expect(content).toContain('HR shared service — Oct')
  })

  it('a consolidated payroll invoice groups its lines by department; a paid one says when', () => {
    const content = text(doc.Pages[2])
    expect(content).toContain('RM 4,085.00 paid on 9 October 2026')
    for (const w of ['HR', 'HR subtotal', 'Finance', 'Finance subtotal', 'RM 3,000.00', 'RM 1,085.00', 'Amount due RM 0.00', 'Marketing', 'Department pool']) expect(content, w).toContain(w)
  })

  it('a draft says so; an outside party carries its contact; each invoice counts its own pages', () => {
    const content = text(doc.Pages[3])
    for (const w of ['Draft', 'Reference', 'Q-77', 'Status', 'Draft — not issued', 'Rygis Private Gym', 'External party', 'Lot 12, Jalan Kenari 5', 'hello@rygis.my', 'Page 1 of 1']) {
      expect(content, w).toContain(w)
    }
    expect(doc.Pages).toHaveLength(4)
  })
})

describe('the headline', () => {
  it('says what it asks for and by when, or that it is paid or voided', () => {
    expect(invoiceHeadline({ status: 'issued', total: 100, remaining: 40, due_date: '2026-11-06', paid_on: null })).toBe('RM 40.00 due 6 November 2026')
    expect(invoiceHeadline({ status: 'draft', total: 100, remaining: 100, due_date: null, paid_on: null })).toBe('RM 100.00 due')
    expect(invoiceHeadline({ status: 'paid_via_netting', total: 100, remaining: 0, due_date: '2026-11-06', paid_on: null })).toBe('RM 100.00 paid')
    expect(invoiceHeadline({ status: 'voided', total: 100, remaining: 0, due_date: '2026-11-06', paid_on: null })).toBe('RM 100.00 voided')
  })
})

// @vitest-environment node
import React from 'react'
import { beforeAll, describe, expect, it } from 'vitest'
import PDFParser, { type Output } from 'pdf2json'
import { renderPdfBuffer } from '@/lib/export/pdf'
import { CreditNoteDocPdf, creditNoteHeadline, type CreditNoteDocData } from './credit-note-doc-pdf'

// A credit note's document (2026-10-15, the Finance revamp v2 — README §3,
// P04): rendered for real and read back.

function parse(buffer: Buffer): Promise<Output> {
  return new Promise((resolve, reject) => {
    const parser = new PDFParser()
    parser.on('pdfParser_dataReady', resolve)
    parser.on('pdfParser_dataError', (error) => reject(error.parserError ?? error))
    parser.parseBuffer(Buffer.from(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)))
  })
}
// pdf2json reads the en dash before a negative amount as "– " (the page draws "–RM").
const text = (page: Output['Pages'][number]) =>
  page.Texts.map((item) => item.R.map((run) => decodeURIComponent(run.T)).join(''))
    .join(' ')
    .replace(/\s+/g, ' ')
    .replace(/– RM/g, '–RM')

const APPROVED: CreditNoteDocData = {
  id: 'cn2', credit_note_no: 'HV-CN-202610-0002', status: 'approved', amount: 220.4, reason: 'Overbilled 1 staff — left in Sep',
  issued_at: '2026-10-10T02:00:00Z', category_label: 'Salary Income', credit_to: { name: 'HOUZS Bedding (HB)', kind: 'Subsidiary · HB' },
  invoice_no: 'HV-INV-202609-0008', invoice_period: '2026-09-01', invoice_summary: 'HR shared service — Sep', invoice_total: 1542.8, other_credits: 0,
}

let doc: Output
beforeAll(async () => {
  doc = await parse(
    await renderPdfBuffer(
      <CreditNoteDocPdf creditNotes={[APPROVED, { ...APPROVED, id: 'cn3', credit_note_no: null, status: 'draft', amount: 100, other_credits: 220.4, issued_at: '2026-10-14T03:00:00Z' }]} />,
    ),
  )
}, 30000)

describe('a credit note’s document', () => {
  it('says the design’s words: the credit, the invoice it credits, the revised amount', () => {
    const content = text(doc.Pages[0])
    for (const w of [
      'Credit note', 'Credit note number', 'HV-CN-202610-0002', 'Date of issue', '10 October 2026', 'Original invoice', 'HV-INV-202609-0008', 'Period', 'September 2026',
      'HOUZS Venture Holding Sdn. Bhd.', 'Internal banking · Shared services', 'hello@houzsventure.com', 'Credit to', 'HOUZS Bedding (HB)', 'Subsidiary · HB',
      'RM 220.40 credited on 10 October 2026', 'Overbilled 1 staff — left in Sep',
      'Description', 'Qty', 'Unit price', 'Amount', 'HR shared service — Sep', 'Salary Income', '–RM 220.40',
      'Original invoice RM 1,542.80', 'This credit –RM 220.40', 'Revised amount RM 1,322.40',
      'HV-CN-202610-0002 · RM 220.40 credited against HV-INV-202609-0008', 'Page 1 of 1',
    ]) {
      expect(content, w).toContain(w)
    }
    // The receipt, voucher and credit note carry the issuer's first line only; a customer's document no GL code.
    expect(content).not.toContain('Director salary distribution')
    expect(content).not.toContain('5020')
  })

  it('a draft waits for approval — the revised amount takes only the approved credits', () => {
    const content = text(doc.Pages[1])
    for (const w of ['Draft', 'Status', 'Draft — awaiting approval', 'RM 100.00 to credit once approved', 'Other credit notes –RM 220.40', 'This credit –RM 100.00', 'Revised amount RM 1,322.40', 'to credit against HV-INV-202609-0008']) {
      expect(content, w).toContain(w)
    }
  })
})

describe('the headline', () => {
  it('credited on its day, waiting, or voided', () => {
    expect(creditNoteHeadline({ status: 'approved', amount: 50, issued_at: '2026-10-09T17:30:00Z' })).toBe('RM 50.00 credited on 10 October 2026') // the office's day
    expect(creditNoteHeadline({ status: 'draft', amount: 50, issued_at: null })).toBe('RM 50.00 to credit once approved')
    expect(creditNoteHeadline({ status: 'voided', amount: 50, issued_at: null })).toBe('RM 50.00 credit voided')
  })
})

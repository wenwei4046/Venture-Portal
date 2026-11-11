import React from 'react'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { REPORT_CJK_CHARS } from './fonts/report-cjk'
import { renderPdfBuffer } from './pdf'
import { BrandBillingPdf } from './brand-billing-pdf'
import { brandBillingReport, type ExportLine } from '@/lib/commission/brand-billing'

// The PDF's Chinese is drawn from a subset font (`tools/build-report-cjk-font.mjs`):
// a word added to the report without rebuilding the font would print blank.
describe('the Sales by Brand & Billing PDF', () => {
  it('the font holds every Chinese character the report prints', () => {
    const source = readFileSync('src/lib/commission/brand-billing.ts', 'utf8')
      + readFileSync('src/lib/export/brand-billing-pdf.tsx', 'utf8')
    const used = new Set(source.match(/[　-〿㐀-鿿＀-￯]/gu) ?? [])
    const missing = [...used].filter(ch => !REPORT_CJK_CHARS.includes(ch))
    expect(missing, 'run: node tools/build-report-cjk-font.mjs').toEqual([])
  })

  it('renders', async () => {
    const line: ExportLine = {
      staffId: 's1', name: 'ADRIAN', type: 'sales', erpNo: 'HC-SO-2609-069', refNo: 'ZNT6724', date: '2026-09-14',
      venue: 'MID VALLEY', customer: 'Nik', brandCode: 'ZANOTTI', wholeTotal: 3500, sharePct: 1, sales: 3500,
      rate: 0.06, commission: 210, source: 'ERP', note: '',
    }
    const report = brandBillingReport([line], [{ code: 'ZANOTTI', name: 'Zanotti', refPrefixes: ['ZNT'], hcBillPct: 0.13 }], '2026-09-01', 'Fair')
    const buf = await renderPdfBuffer(<BrandBillingPdf report={report} />)
    expect(buf.subarray(0, 5).toString()).toBe('%PDF-')
  }, 30000)
})

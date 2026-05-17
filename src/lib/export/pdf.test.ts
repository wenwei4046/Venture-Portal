import { describe, it, expect } from 'vitest'
import React from 'react'
import { renderPdfBuffer, PdfDocument, PdfTable } from './pdf'

describe('renderPdfBuffer', () => {
  it('produces a PDF buffer whose first 4 bytes are %PDF', async () => {
    const element = React.createElement(
      PdfDocument,
      { title: 'Test', periodLabel: 'May 2026' },
      React.createElement(PdfTable, {
        columns: [
          { label: 'Account', width: 200 },
          { label: 'Debit',   width: 100, align: 'right' },
          { label: 'Credit',  width: 100, align: 'right' },
        ],
        rows: [['3000 Cash', 1000, null], ['4000 AP', null, 1000]],
        numberFormat: 'money',
      }),
    )
    const buf = await renderPdfBuffer(element)
    expect(buf.length).toBeGreaterThan(100)
    // PDF files start with the magic bytes '%PDF'.
    expect(buf.slice(0, 4).toString('ascii')).toBe('%PDF')
  })
})

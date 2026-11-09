import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { PdfExportButton, pdfHref } from './PdfExport'

describe('pdfHref', () => {
  it('asks for the attachments only when ticked', () => {
    expect(pdfHref('/payments/voucher-doc?id=v1', false)).toBe('/payments/voucher-doc?id=v1')
    expect(pdfHref('/payments/voucher-doc?id=v1', true)).toBe('/payments/voucher-doc?id=v1&attachments=1')
    expect(pdfHref('/x', true)).toBe('/x?attachments=1')
  })
})

describe('PdfExportButton', () => {
  it('asks first, nothing ticked; Export PDF opens the document as it was', () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null)
    render(<PdfExportButton href="/payments/voucher-doc?id=v1" what="voucher">Print</PdfExportButton>)
    fireEvent.click(screen.getByRole('button', { name: 'Print' }))
    const ask = screen.getByRole('dialog')
    expect(within(ask).getByRole('checkbox', { name: 'Include attachments' })).not.toBeChecked()
    expect(ask).toHaveTextContent('Only the vouchers themselves.')
    fireEvent.click(within(ask).getByRole('button', { name: 'Export PDF' }))
    expect(open).toHaveBeenCalledWith('/payments/voucher-doc?id=v1', '_blank', 'noopener,noreferrer')
    open.mockRestore()
  })

  it('ticked: each voucher followed by its own files', () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null)
    render(<PdfExportButton href="/payments/voucher-doc?ids=a,b" what="voucher" />)
    fireEvent.click(screen.getByRole('button', { name: 'PDF' }))
    const ask = screen.getByRole('dialog')
    fireEvent.click(within(ask).getByRole('checkbox', { name: 'Include attachments' }))
    expect(ask).toHaveTextContent('Each voucher is followed by its own attachments')
    fireEvent.click(within(ask).getByRole('button', { name: 'Export PDF' }))
    expect(open).toHaveBeenCalledWith('/payments/voucher-doc?ids=a,b&attachments=1', '_blank', 'noopener,noreferrer')
    open.mockRestore()
  })
})

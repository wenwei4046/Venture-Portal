import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, within } from '@testing-library/react'

// Copy as a new draft (2026-10-16): the desktop opens the copy on its edit
// page (copyPaymentVoucher redirects there); the Finance phone app is answered
// in words and opens the copy itself — it never lands on the portal's page.

const mocks = vi.hoisted(() => ({ copy: vi.fn(), copyInWords: vi.fn() }))
vi.mock('../../actions', () => ({ copyPaymentVoucher: mocks.copy, copyPaymentVoucherInWords: mocks.copyInWords }))

import { CopyVoucherDialog } from './CopyAsDraft'

afterEach(() => vi.clearAllMocks())

describe('Copy as a new draft', () => {
  it('in the app: the copy is answered, the dialog closes and the app opens it', async () => {
    mocks.copyInWords.mockResolvedValue({ ok: true, id: 'pv-new', voucherNo: 'HV-PV-202610-0600' })
    const onClose = vi.fn()
    const onCopied = vi.fn()
    render(<CopyVoucherDialog open onClose={onClose} voucherId="pv-1" voucherNo="HV-PV-202610-0533" onCopied={onCopied} />)
    const ask = screen.getByRole('dialog', { name: 'Copy HV-PV-202610-0533?' })
    // It opens in the app with its form — not on the portal's edit page (2026-10-16).
    expect(ask).toHaveTextContent('It opens as a new draft, its form open to be changed before it is submitted.')
    expect(ask).not.toHaveTextContent('edit page')
    await act(async () => {
      fireEvent.click(within(ask).getByRole('button', { name: 'Copy as a new draft' }))
    })
    expect((mocks.copyInWords.mock.calls[0][0] as FormData).get('voucher_id')).toBe('pv-1')
    expect(mocks.copy).not.toHaveBeenCalled()
    expect(onClose).toHaveBeenCalled()
    expect(onCopied).toHaveBeenCalledWith({ id: 'pv-new', voucherNo: 'HV-PV-202610-0600' })
  })

  it('in the app, a refusal is said in the dialog', async () => {
    mocks.copyInWords.mockResolvedValue({ ok: false, reason: 'Source voucher not found' })
    const onCopied = vi.fn()
    render(<CopyVoucherDialog open onClose={vi.fn()} voucherId="pv-1" voucherNo="HV-PV-202610-0533" onCopied={onCopied} />)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy as a new draft' }))
    })
    expect(screen.getByText('Source voucher not found')).toBeInTheDocument()
    expect(onCopied).not.toHaveBeenCalled()
  })

  it('on the desktop: the page’s own copy, which opens the edit page', async () => {
    mocks.copy.mockResolvedValue(undefined)
    render(<CopyVoucherDialog open onClose={vi.fn()} voucherId="pv-1" voucherNo="HV-PV-202610-0533" />)
    expect(screen.getByRole('dialog')).toHaveTextContent('It opens on the edit page as a new draft, to be changed before it is submitted.')
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy as a new draft' }))
    })
    expect(mocks.copy).toHaveBeenCalled()
    expect(mocks.copyInWords).not.toHaveBeenCalled()
  })
})

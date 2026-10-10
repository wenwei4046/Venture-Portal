import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { ReactElement } from 'react'
import { FinViewProvider } from '@/components/layout/fin-view'

const mocks = vi.hoisted(() => ({
  copyPaymentVoucher: vi.fn(async () => undefined),
  reassignVoucherGlAccount: vi.fn(async () => ({ changed: 2 }) as { error?: string; changed?: number }),
  uploadVoucherAttachment: vi.fn(async () => ({ count: 1 })),
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))
vi.mock('../../actions', () => mocks)

import CopyVoucherButton from './CopyVoucherButton'
import ReassignGlAccountButton from './ReassignGlAccountButton'
import AttachmentUploader from './AttachmentUploader'

const fin = (ui: ReactElement) => render(<FinViewProvider value={true}>{ui}</FinViewProvider>)
const noChinese = () => expect(document.body.innerHTML).not.toMatch(/[㐀-鿿]/)

beforeEach(() => vi.clearAllMocks())

// 2026-10-10 — the handoff (audit 2026-10-09 l, item 8): the voucher page is
// English throughout on the Finance view — the controls it holds as well.
describe('the voucher page’s controls on the Finance view', () => {
  it('Copy asks in English before it copies', () => {
    const ask = vi.fn(() => false)
    vi.stubGlobal('confirm', ask)
    fin(<CopyVoucherButton voucherId="v-1" voucherNo="HV-PV-202610-0040" />)
    const copy = screen.getByRole('button', { name: 'Copy' })
    expect(copy).toHaveAttribute('title', 'Copy into a new draft to edit')
    fireEvent.click(copy)
    expect(ask).toHaveBeenCalledWith(expect.stringMatching(/^Copy HV-PV-202610-0040 into a new draft\?/))
    expect(mocks.copyPaymentVoucher).not.toHaveBeenCalled()
    noChinese()
    vi.unstubAllGlobals()
  })

  it('Change GL account, its dialog and its checks', async () => {
    fin(<ReassignGlAccountButton voucherId="v-1" fromOptions={[{ code: '9091', name: 'Water & Electricity', total: 100 }]} accountOptions={[{ code: '9094', name: 'Office Rental' }]} />)
    fireEvent.click(screen.getByRole('button', { name: 'Change GL account' }))
    expect(screen.getByText('Change this voucher’s GL account')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Confirm change' }))
    expect(screen.getByText('Pick the new account')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText(/Move to/), { target: { value: '9094' } })
    fireEvent.click(screen.getByRole('button', { name: 'Confirm change' }))
    expect(screen.getByText(/^Write a reason/)).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText(/Reason/), { target: { value: 'wrong account' } })
    fireEvent.click(screen.getByRole('button', { name: 'Confirm change' }))
    expect(await screen.findByText('Changed — 2 GL lines moved from 9091 to 9094.')).toBeInTheDocument()
    noChinese()
  })

  it('the uploader says in English that a late file stays', () => {
    fin(<AttachmentUploader voucherId="v-1" voucherStatus="paid" canUpload late />)
    expect(screen.getByTestId('late-note')).toHaveTextContent('This voucher is already paid: files can be added but not removed')
    noChinese()
  })
})

describe('the same controls elsewhere keep their words', () => {
  it('Change GL account is 改 GL account, the late note Chinese', () => {
    render(
      <>
        <ReassignGlAccountButton voucherId="v-1" fromOptions={[]} accountOptions={[]} />
        <AttachmentUploader voucherId="v-1" voucherStatus="approved" canUpload late />
      </>,
    )
    expect(screen.getByRole('button', { name: '改 GL account' })).toBeInTheDocument()
    expect(screen.getByTestId('late-note')).toHaveTextContent('这张凭单已经批准')
  })
})

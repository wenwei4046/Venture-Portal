import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

// 2026-10-10 — Upload statement as the handoff's modal: Bank account,
// Statement month, a dashed area to choose (or drop) the file, Cancel and
// Upload & auto-match — the same upload as before.

const mocks = vi.hoisted(() => ({ uploadStatement: vi.fn() }))
vi.mock('../actions', () => ({ uploadStatement: mocks.uploadStatement }))

import UploadStatementForm from './UploadStatementForm'
import UploadStatementButton from './UploadStatementButton'

const BANKS = [
  { id: 'b1', label: 'Hong Leong — 5123-0098-77' },
  { id: 'b2', label: 'Maybank — 5141-7720-9031' },
]
const csv = () => new File(['date,amount\n'], 'MBB_202609.csv', { type: 'text/csv' })

beforeEach(() => vi.clearAllMocks())

describe('the upload form', () => {
  it('asks for the bank, the month and the file, the file in a dashed area', () => {
    render(<UploadStatementForm banks={BANKS} defaultMonth="2026-09" />)
    expect(screen.getByLabelText('Bank account')).toHaveValue('b1')
    expect(screen.getByLabelText('Statement month')).toHaveValue('2026-09')
    const drop = document.querySelector('.adm-drop') as HTMLElement
    expect(drop).toHaveTextContent('Choose file')
    expect(drop).toHaveTextContent('.xlsx or .csv · PDF needs your bank’s layout first')
    expect(screen.getByRole('button', { name: 'Upload & auto-match' })).toBeInTheDocument()
  })

  it('names the file once it is chosen, or dropped', () => {
    render(<UploadStatementForm banks={BANKS} defaultMonth="2026-09" />)
    fireEvent.change(screen.getByLabelText('Statement file'), { target: { files: [csv()] } })
    expect(document.querySelector('.adm-drop')).toHaveTextContent('MBB_202609.csv')
    fireEvent.drop(document.querySelector('.adm-drop') as HTMLElement, { dataTransfer: { files: [new File(['x'], 'HL_SEP26.xlsx')] } })
    expect(document.querySelector('.adm-drop')).toHaveTextContent('HL_SEP26.xlsx')
  })

  it('wants a file before it uploads', () => {
    render(<UploadStatementForm banks={BANKS} defaultMonth="2026-09" />)
    fireEvent.click(screen.getByRole('button', { name: 'Upload & auto-match' }))
    expect(screen.getByText('Pick a statement file (.xlsx / .csv)')).toBeInTheDocument()
    expect(mocks.uploadStatement).not.toHaveBeenCalled()
  })

  it('uploads the bank, the month and the file as before', async () => {
    mocks.uploadStatement.mockResolvedValue({ error: 'No rows found in the file' })
    render(<UploadStatementForm banks={BANKS} defaultMonth="2026-09" />)
    fireEvent.change(screen.getByLabelText('Bank account'), { target: { value: 'b2' } })
    fireEvent.change(screen.getByLabelText('Statement file'), { target: { files: [csv()] } })
    fireEvent.click(screen.getByRole('button', { name: 'Upload & auto-match' }))
    await waitFor(() => expect(mocks.uploadStatement).toHaveBeenCalledTimes(1))
    const fd = mocks.uploadStatement.mock.calls[0][0] as FormData
    expect(fd.get('bank_account_id')).toBe('b2')
    expect(fd.get('period_month')).toBe('2026-09')
    expect((fd.get('file') as File).name).toBe('MBB_202609.csv')
    expect(await screen.findByText('No rows found in the file')).toBeInTheDocument()
  })

  it('Cancel closes it', () => {
    const onCancel = vi.fn()
    render(<UploadStatementForm banks={BANKS} defaultMonth="2026-09" onCancel={onCancel} />)
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onCancel).toHaveBeenCalled()
  })
})

describe('Upload statement in the head', () => {
  it('opens the form in a modal, and closes it again', () => {
    render(<UploadStatementButton banks={BANKS} defaultMonth="2026-09" />)
    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Upload statement' }))
    const dialog = screen.getByRole('dialog', { name: 'Upload statement' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(screen.getByLabelText('Bank account')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Upload statement' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('can open already open (an old ?upload=1 link)', () => {
    render(<UploadStatementButton banks={BANKS} defaultMonth="2026-09" defaultOpen />)
    expect(screen.getByRole('dialog', { name: 'Upload statement' })).toBeInTheDocument()
  })
})

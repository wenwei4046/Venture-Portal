import { useState } from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import SaveAllButton from './SaveAllButton'
import SubmitToFinanceButton from './SubmitToFinanceButton'
import { PayrollDraftProvider, usePayrollDraft } from './PayrollDraftContext'

const { updatePayrollRows, submitToFinance, refresh } = vi.hoisted(() => ({
  updatePayrollRows: vi.fn(),
  submitToFinance: vi.fn(),
  refresh: vi.fn(),
}))
vi.mock('../actions', () => ({ updatePayrollRows, submitToFinance }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))

let draft: ReturnType<typeof usePayrollDraft>
function DraftProbe() {
  draft = usePayrollDraft()
  return <output aria-label="Dirty rows">{draft.dirtyCount}</output>
}

function renderButtons() {
  return render(
    <PayrollDraftProvider>
      <DraftProbe />
      <SaveAllButton />
      <SubmitToFinanceButton period="2026-09-01" totalAmount={10000} />
    </PayrollDraftProvider>,
  )
}

function deferred() {
  let resolve!: (saved: boolean) => void
  const promise = new Promise<boolean>(done => { resolve = done })
  return { promise, resolve }
}

beforeEach(() => {
  vi.clearAllMocks()
  updatePayrollRows.mockResolvedValue(undefined)
})

describe('Save All payroll drafts', () => {
  it('keeps ordinary rows in one batch and reports saved only after success', async () => {
    renderButtons()
    act(() => {
      draft.setRowEdit('finance', { basic_salary: 3500 })
      draft.setRowEdit('marketing', { deduction_amount: 50 })
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save 2 rows' }))
    await waitFor(() => expect(updatePayrollRows).toHaveBeenCalledWith([
      { id: 'finance', fields: { basic_salary: 3500 } },
      { id: 'marketing', fields: { deduction_amount: 50 } },
    ]))
    await waitFor(() => expect(refresh).toHaveBeenCalledOnce())
    act(() => {
      draft.setRowEdit('finance', null)
      draft.setRowEdit('marketing', null)
    })
    expect(screen.getByText('✓ Saved')).toBeVisible()
  })

  it('counts a mixed Revenue row once and excludes all its edits from the ordinary batch', async () => {
    const review = vi.fn().mockResolvedValue(true)
    renderButtons()
    act(() => {
      draft.setRowEdit('revenue', { basic_salary: 5000, commission_amount: 11000 })
      draft.setCommissionReview('revenue', review)
      draft.setRowEdit('finance', { deduction_amount: 50 })
    })
    expect(screen.getByLabelText('Dirty rows')).toHaveTextContent('2')
    fireEvent.click(screen.getByRole('button', { name: 'Save 2 rows' }))
    await waitFor(() => expect(updatePayrollRows).toHaveBeenCalledWith([
      { id: 'finance', fields: { deduction_amount: 50 } },
    ]))
    expect(review).toHaveBeenCalledOnce()
    expect(review.mock.invocationCallOrder[0]).toBeLessThan(updatePayrollRows.mock.invocationCallOrder[0])
  })

  it('awaits review dialogs sequentially before saving ordinary rows', async () => {
    const first = deferred()
    const second = deferred()
    const reviewFirst = vi.fn(() => first.promise)
    const reviewSecond = vi.fn(() => second.promise)
    renderButtons()
    act(() => {
      draft.setCommissionReview('first', reviewFirst)
      draft.setCommissionReview('second', reviewSecond)
      draft.setRowEdit('finance', { ot_amount: 100 })
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save 3 rows' }))
    expect(reviewFirst).toHaveBeenCalledOnce()
    expect(reviewSecond).not.toHaveBeenCalled()
    expect(updatePayrollRows).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Saving…' }))
    expect(reviewFirst).toHaveBeenCalledOnce()
    await act(async () => { first.resolve(true) })
    expect(reviewSecond).toHaveBeenCalledOnce()
    expect(updatePayrollRows).not.toHaveBeenCalled()
    await act(async () => { second.resolve(true) })
    expect(updatePayrollRows).toHaveBeenCalledOnce()
    expect(refresh).toHaveBeenCalledOnce()
  })

  it('opens a review immediately while its save decision is still pending', async () => {
    const decision = deferred()
    function ReviewDialog() {
      const [open, setOpen] = useState(false)
      return <>
        <button onClick={() => draft.setCommissionReview('revenue', () => {
          setOpen(true)
          return decision.promise
        })}>Register review</button>
        {open && <div role="dialog" aria-label="Gross Commission review">Reason required</div>}
      </>
    }
    render(<PayrollDraftProvider><DraftProbe /><SaveAllButton /><ReviewDialog /></PayrollDraftProvider>)
    fireEvent.click(screen.getByRole('button', { name: 'Register review' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save 1 row' }))
    expect(screen.getByRole('dialog', { name: 'Gross Commission review' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled()
    await act(async () => { decision.resolve(false) })
    expect(updatePayrollRows).not.toHaveBeenCalled()
  })

  it('stops on cancellation, preserves pending rows, and retries only the remaining reviews', async () => {
    renderButtons()
    const first = vi.fn(async () => {
      draft.setCommissionReview('first', null)
      draft.setRowEdit('first', null)
      return true
    })
    const second = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true)
    act(() => {
      draft.setRowEdit('first', { basic_salary: 5000 })
      draft.setCommissionReview('first', first)
      draft.setCommissionReview('second', second)
      draft.setRowEdit('finance', { basic_salary: 3500 })
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save 3 rows' }))
    await waitFor(() => expect(screen.getByText('Save cancelled. Remaining edits have not been saved.')).toBeVisible())
    expect(updatePayrollRows).not.toHaveBeenCalled()
    expect(refresh).not.toHaveBeenCalled()
    expect(screen.queryByText('✓ Saved')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Submit to Finance' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Save 2 rows' }))
    await waitFor(() => expect(updatePayrollRows).toHaveBeenCalledWith([
      { id: 'finance', fields: { basic_salary: 3500 } },
    ]))
    expect(first).toHaveBeenCalledOnce()
    expect(second).toHaveBeenCalledTimes(2)
    expect(refresh).toHaveBeenCalledOnce()
  })

  it('blocks Submit for an adjustment-only draft and never sends an empty ordinary batch', async () => {
    renderButtons()
    const review = vi.fn(async () => {
      draft.setCommissionReview('revenue', null)
      return true
    })
    act(() => draft.setCommissionReview('revenue', review))
    expect(screen.getByRole('button', { name: 'Submit to Finance' })).toBeDisabled()
    expect(screen.getByText('1 unsaved row — save first')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Save 1 row' }))
    await waitFor(() => expect(screen.getByText('✓ Saved')).toBeVisible())
    expect(updatePayrollRows).not.toHaveBeenCalled()
    expect(submitToFinance).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Submit to Finance' })).toBeEnabled()
  })

  it('keeps a failed review dirty and does not continue to batch save', async () => {
    renderButtons()
    act(() => {
      draft.setCommissionReview('revenue', vi.fn().mockRejectedValue(new Error('Source changed; reload')))
      draft.setRowEdit('finance', { basic_salary: 3500 })
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save 2 rows' }))
    await waitFor(() => expect(screen.getByText('Source changed; reload')).toBeVisible())
    expect(updatePayrollRows).not.toHaveBeenCalled()
    expect(refresh).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Save 2 rows' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Submit to Finance' })).toBeDisabled()
  })

  it('preserves ordinary errors without showing full success', async () => {
    updatePayrollRows.mockRejectedValue(new Error('Payroll is no longer draft'))
    renderButtons()
    act(() => draft.setRowEdit('finance', { basic_salary: 3500 }))
    fireEvent.click(screen.getByRole('button', { name: 'Save 1 row' }))
    await waitFor(() => expect(screen.getByText('Payroll is no longer draft')).toBeVisible())
    expect(refresh).not.toHaveBeenCalled()
    expect(screen.queryByText('✓ Saved')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save 1 row' })).toBeEnabled()
  })
})

describe('Payroll draft review registration', () => {
  it('removes each kind of pending work independently and deduplicates a row', () => {
    renderButtons()
    const review = vi.fn().mockResolvedValue(true)
    act(() => {
      draft.setRowEdit('revenue', { basic_salary: 5000 })
      draft.setCommissionReview('revenue', review)
      draft.setCommissionReview('revenue', review)
    })
    expect(screen.getByLabelText('Dirty rows')).toHaveTextContent('1')
    act(() => draft.setCommissionReview('revenue', null))
    expect(screen.getByLabelText('Dirty rows')).toHaveTextContent('1')
    act(() => draft.setRowEdit('revenue', null))
    expect(screen.getByLabelText('Dirty rows')).toHaveTextContent('0')
    expect(screen.getByRole('button', { name: 'Submit to Finance' })).toBeEnabled()
  })

  it('provides safe no-op defaults outside a draft provider', () => {
    render(<DraftProbe />)
    act(() => {
      draft.setRowEdit('revenue', { basic_salary: 5000 })
      draft.setCommissionReview('revenue', async () => true)
      draft.setCommissionReview('revenue', null)
    })
    expect(draft.edits).toEqual({})
    expect(draft.commissionReviews).toEqual({})
    expect(screen.getByLabelText('Dirty rows')).toHaveTextContent('0')
  })
})

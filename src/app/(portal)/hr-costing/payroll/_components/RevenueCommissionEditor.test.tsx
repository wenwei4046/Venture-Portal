import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { useEffect, useRef, useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import RevenueCommissionEditor, { type RevenueCommissionEditorProps } from './RevenueCommissionEditor'

function ControlledFixture(props: RevenueCommissionEditorProps) {
  const [open, setOpen] = useState(props.open)
  const returnFocusRef = useRef<HTMLButtonElement>(null)
  useEffect(() => setOpen(props.open), [props.open])
  return <>
    <button ref={returnFocusRef} onClick={() => setOpen(true)} disabled={props.disabled}>Row Save</button>
    <RevenueCommissionEditor {...props} open={open} returnFocusRef={returnFocusRef}
      onClose={() => { props.onClose(); setOpen(false) }} />
  </>
}

function setup(overrides: Partial<RevenueCommissionEditorProps> = {}) {
  const onSave = vi.fn().mockResolvedValue(undefined)
  let props: RevenueCommissionEditorProps = { open: false, requestedGross: overrides.currentGross ?? 13000, onClose: vi.fn(),
    baseAmount: 13000, currentAdjustment: 0, currentGross: 13000, staffName: 'B03', onSave, ...overrides }
  const view = render(<ControlledFixture {...props} />)
  return { ...view, props, onSave: props.onSave, onClose: props.onClose,
    rerenderProps: (next: Partial<RevenueCommissionEditorProps>) => { props = { ...props, ...next }; view.rerender(<ControlledFixture {...props} />) } }
}

function open() {
  fireEvent.click(screen.getByRole('button', { name: 'Row Save' }))
  return screen.getByRole('dialog', { name: 'Edit Gross Commission' })
}

function changeGross(value: string) {
  const input = screen.getByLabelText('Requested Gross Commission')
  fireEvent.focus(input)
  fireEvent.change(input, { target: { value } })
  return input
}

function summaryAmount(label: string) {
  const row = within(screen.getByRole('table', { name: 'Commission adjustment summary' })).getByText(label).closest('tr')!
  return within(row).getAllByRole('cell')[1]
}

describe('RevenueCommissionEditor', () => {
  it('renders no inline trigger, adjustment line or dialog while closed', () => {
    const { container } = render(<RevenueCommissionEditor open={false} requestedGross={14000} onClose={vi.fn()}
      baseAmount={13000} currentGross={13000} currentAdjustment={0} onSave={vi.fn()} />)
    expect(container).toBeEmptyDOMElement()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.queryByText(/Adj\./)).not.toBeInTheDocument()
  })

  it('seeds from the row Save amount once per opening and respects an external close', () => {
    const { rerenderProps, onClose } = setup({ open: true, requestedGross: 14000 })
    expect(screen.getByLabelText('Requested Gross Commission')).toHaveValue('14,000.00')
    changeGross('14200')
    fireEvent.change(screen.getByLabelText('Adjustment reason'), { target: { value: 'In-progress review' } })
    rerenderProps({ requestedGross: 16000 })
    expect(screen.getByLabelText('Requested Gross Commission')).toHaveValue('14200')
    expect(screen.getByLabelText('Adjustment reason')).toHaveValue('In-progress review')
    rerenderProps({ open: false })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Row Save' })).toHaveFocus()
    expect(onClose).not.toHaveBeenCalled()
    rerenderProps({ open: true, requestedGross: 15000 })
    expect(screen.getByLabelText('Requested Gross Commission')).toHaveValue('15,000.00')
    expect(screen.getByLabelText('Adjustment reason')).toHaveValue('')
  })

  it.each([NaN, Infinity, -1])('blocks invalid inline requested amount %s until corrected', amount => {
    const { onSave } = setup({ open: true, requestedGross: amount })
    expect(screen.getByRole('alert')).toHaveTextContent('finite Gross Commission')
    expect(screen.getByRole('button', { name: 'Save adjustment' })).toBeDisabled()
    fireEvent.submit(screen.getByLabelText('Adjustment reason').closest('form')!)
    expect(onSave).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Reset to Revenue source' }))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Requested Gross Commission')).toHaveValue('13,000.00')
  })

  it('does not let completion of an externally closed review dismiss a newly opened one', async () => {
    let finishSave!: () => void
    const onSave = vi.fn(() => new Promise<void>(resolve => { finishSave = resolve }))
    const { rerenderProps, onClose } = setup({ open: true, requestedGross: 14000, onSave })
    fireEvent.change(screen.getByLabelText('Adjustment reason'), { target: { value: 'First review' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save adjustment' }))
    rerenderProps({ open: false })
    rerenderProps({ open: true, requestedGross: 12000 })
    await act(async () => { finishSave() })
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByLabelText('Requested Gross Commission')).toHaveValue('12,000.00')
    expect(screen.getByRole('button', { name: 'Save adjustment' })).toBeEnabled()
  })

  it.each([
    ['14000', '14,000.00', '+1,000.00', 14000, 'DN adjustment'],
    ['12000', '12,000.00', '-1,000.00', 12000, 'Dropped sales'],
  ])('reviews %s against the intact source with a signed adjustment and a reason', async (raw, formatted, adjustment, gross, reason) => {
    const { onSave, onClose } = setup({ requestedGross: gross })
    const trigger = screen.getByRole('button', { name: 'Row Save' })
    open()
    expect(screen.getByLabelText('Requested Gross Commission')).toHaveValue(formatted)
    expect(summaryAmount('Synced from Revenue')).toHaveTextContent('13,000.00')
    expect(summaryAmount('Requested Gross Commission')).toHaveTextContent(formatted)
    expect(summaryAmount('Difference from current')).toHaveTextContent(adjustment)
    expect(summaryAmount('Payroll adjustment to Revenue source')).toHaveTextContent(adjustment)
    fireEvent.click(screen.getByRole('button', { name: 'Save adjustment' }))
    expect(onSave).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a reason')
    fireEvent.change(screen.getByLabelText('Adjustment reason'), { target: { value: `  ${reason}  ` } })
    fireEvent.click(screen.getByRole('button', { name: 'Save adjustment' }))
    await waitFor(() => expect(onSave).toHaveBeenCalledWith({ gross, expectedSynced: 13000, expectedAdjustment: 0, reason }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(onClose).toHaveBeenCalledOnce()
    expect(trigger).toHaveFocus()
  })

  it('distinguishes a decrease from the current gross and a remaining positive adjustment', () => {
    setup({ currentAdjustment: 1000, currentGross: 14000, requestedGross: 13500 })
    open()
    expect(summaryAmount('Difference from current')).toHaveTextContent('-500.00')
    expect(summaryAmount('Payroll adjustment to Revenue source')).toHaveTextContent('+500.00')
  })

  it('resets an existing adjustment to the source only after a reason is entered', async () => {
    const { onSave } = setup({ currentAdjustment: -1000, currentGross: 12000 })
    open()
    fireEvent.click(screen.getByRole('button', { name: 'Reset to Revenue source' }))
    expect(screen.getByLabelText('Requested Gross Commission')).toHaveValue('13,000.00')
    expect(summaryAmount('Payroll adjustment to Revenue source')).toHaveTextContent(/^0\.00$/)
    expect(summaryAmount('Difference from current')).toHaveTextContent('+1,000.00')
    fireEvent.click(screen.getByRole('button', { name: 'Save adjustment' }))
    expect(onSave).not.toHaveBeenCalled()
    fireEvent.change(screen.getByLabelText('Adjustment reason'), { target: { value: 'DN was reversed' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save adjustment' }))
    await waitFor(() => expect(onSave).toHaveBeenCalledWith({ gross: 13000, expectedSynced: 13000, expectedAdjustment: -1000, reason: 'DN was reversed' }))
  })

  it.each(['', '.', '-1', 'NaN', 'Infinity', 'abc', '9'.repeat(309)])('does not silently save a prior valid value for invalid input %s', raw => {
    const { onSave } = setup()
    open()
    const input = changeGross(raw)
    fireEvent.blur(input)
    expect(screen.getByRole('alert')).toHaveTextContent('finite Gross Commission')
    expect(screen.getByRole('button', { name: 'Save adjustment' })).toBeDisabled()
    fireEvent.submit(screen.getByLabelText('Adjustment reason').closest('form')!)
    expect(onSave).not.toHaveBeenCalled()
    changeGross('14000')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save adjustment' })).toBeEnabled()
  })

  it.each([['14000.126', 14000.13], ['0', 0]])('saves the reviewed amount %s at two decimals', async (raw, gross) => {
    const { onSave } = setup()
    open(); changeGross(raw)
    fireEvent.change(screen.getByLabelText('Adjustment reason'), { target: { value: 'Approved correction' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save adjustment' }))
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ gross })))
  })

  it('shows a resynced source with the existing adjustment and requires review if it changes while editing', async () => {
    const { rerenderProps, onSave } = setup({ currentAdjustment: 1000, currentGross: 14000 })
    rerenderProps({ baseAmount: 15000, currentGross: 16000, requestedGross: 16500 })
    open()
    expect(summaryAmount('Synced from Revenue')).toHaveTextContent('15,000.00')
    expect(summaryAmount('Requested Gross Commission')).toHaveTextContent('16,500.00')
    rerenderProps({ baseAmount: 15500, currentGross: 16500 })
    expect(screen.getByRole('alert')).toHaveTextContent('Cancel and reopen')
    expect(screen.getByRole('button', { name: 'Save adjustment' })).toBeDisabled()
    fireEvent.submit(screen.getByLabelText('Adjustment reason').closest('form')!)
    expect(onSave).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    rerenderProps({ requestedGross: 17000 })
    open()
    expect(summaryAmount('Synced from Revenue')).toHaveTextContent('15,500.00')
    expect(summaryAmount('Payroll adjustment to Revenue source')).toHaveTextContent('+1,500.00')
    fireEvent.change(screen.getByLabelText('Adjustment reason'), { target: { value: 'Updated DN' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save adjustment' }))
    await waitFor(() => expect(onSave).toHaveBeenCalledWith({ gross: 17000, expectedSynced: 15500, expectedAdjustment: 1000, reason: 'Updated DN' }))
  })

  it('keeps the reviewed values and reason on save failure and prevents duplicate or abandoned pending saves', async () => {
    let rejectSave!: (error: Error) => void
    const onSave = vi.fn().mockImplementationOnce(() => new Promise<void>((_, reject) => { rejectSave = reject })).mockResolvedValue(undefined)
    setup({ onSave })
    const dialog = open(); changeGross('14000')
    fireEvent.change(screen.getByLabelText('Adjustment reason'), { target: { value: 'DN credit' } })
    const form = screen.getByLabelText('Adjustment reason').closest('form')!
    fireEvent.submit(form); fireEvent.submit(form)
    expect(onSave).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
    fireEvent.keyDown(dialog, { key: 'Escape' })
    expect(dialog).toBeInTheDocument()
    await act(async () => { rejectSave(new Error('Commission changed. Refresh payroll.')) })
    expect(screen.getByRole('alert')).toHaveTextContent('Commission changed. Refresh payroll.')
    expect(screen.getByLabelText('Adjustment reason')).toHaveValue('DN credit')
    expect(summaryAmount('Requested Gross Commission')).toHaveTextContent('14,000.00')
    fireEvent.click(screen.getByRole('button', { name: 'Save adjustment' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(onSave).toHaveBeenCalledTimes(2)
  })

  it('honors caller eligibility before and during editing without applying its own phase rule', () => {
    const { rerenderProps, onSave } = setup({ disabled: true })
    expect(screen.getByRole('button', { name: 'Row Save' })).toBeDisabled()
    rerenderProps({ disabled: false })
    open()
    rerenderProps({ disabled: true })
    expect(screen.getByRole('alert')).toHaveTextContent('editing is no longer available')
    fireEvent.submit(screen.getByLabelText('Adjustment reason').closest('form')!)
    expect(onSave).not.toHaveBeenCalled()
  })

  it('cancels without mutation, clears abandoned edits and confines keyboard focus to the dialog', () => {
    const { onSave, onClose } = setup()
    const dialog = open(); changeGross('14000')
    fireEvent.change(screen.getByLabelText('Adjustment reason'), { target: { value: 'Abandoned change' } })
    const save = screen.getByRole('button', { name: 'Save adjustment' })
    const close = screen.getByRole('button', { name: 'Close commission editor' })
    save.focus(); fireEvent.keyDown(dialog, { key: 'Tab' })
    expect(close).toHaveFocus()
    fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true })
    expect(save).toHaveFocus()
    fireEvent.keyDown(dialog, { key: 'Escape' })
    expect(onSave).not.toHaveBeenCalled()
    expect(onClose).toHaveBeenCalledOnce()
    open()
    expect(screen.getByLabelText('Adjustment reason')).toHaveValue('')
    expect(screen.getByLabelText('Requested Gross Commission')).toHaveValue('13,000.00')
  })
})

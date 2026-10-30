import { describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import MinPayInterestField from './MinPayInterestField'

// A deal's Minimum pay interest on its page (2026-10-30, the user's sample A): ticked, it asks from which month — the
// first instalment, or a later month picked under it — and Save keeps it; unticked, it is off at once.

const flush = () => act(async () => {
  await new Promise((r) => setTimeout(r, 0))
})

function draw(current: boolean, from: string | null = null) {
  const onSave = vi.fn(async () => undefined)
  render(<MinPayInterestField current={current} from={from} firstDueYM="2026-09" today="2026-10-30" idPrefix="t" onSave={onSave} />)
  return onSave
}

describe('Minimum pay interest on a deal’s page', () => {
  it('off: ticking it asks from which month, and Save waits for the choice', async () => {
    const onSave = draw(false)
    expect(screen.queryByRole('radio', { name: /From the first instalment/ })).toBeNull()
    fireEvent.click(screen.getByRole('checkbox'))
    expect(onSave).not.toHaveBeenCalled()
    expect(screen.getByRole('radio', { name: /From the first instalment/ })).not.toBeChecked()
    expect(screen.getByRole('radio', { name: /From a later month/ })).not.toBeChecked()
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
    expect(screen.getByText('Pick from which month minimum pay starts, then Save.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('radio', { name: /From a later month/ }))
    expect(screen.getByRole('radio', { name: /From a later month/ })).toHaveAccessibleName(/Earliest for this deal: Oct 2026/)
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Starts from'), { target: { value: '2026-11' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await flush()
    expect(onSave).toHaveBeenCalledWith(true, '2026-11')
    expect(screen.getByText('Saved ✓ — from Nov 2026')).toBeInTheDocument()
  })

  it('on from the first instalment (as every deal on before): says so, and a change is saved with Save', async () => {
    const onSave = draw(true)
    expect(screen.getByRole('radio', { name: /From the first instalment/ })).toBeChecked()
    expect(screen.getByText('On — from the first instalment (Sep 2026)')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
    fireEvent.click(screen.getByRole('radio', { name: /From a later month/ }))
    fireEvent.change(screen.getByLabelText('Starts from'), { target: { value: '2027-01' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await flush()
    expect(onSave).toHaveBeenCalledWith(true, '2027-01')
  })

  it('unticked, it is off at once — every month', async () => {
    const onSave = draw(true, '2026-11-01')
    expect(screen.getByLabelText('Starts from')).toHaveValue('2026-11')
    fireEvent.click(screen.getByRole('checkbox'))
    await flush()
    expect(onSave).toHaveBeenCalledWith(false, null)
    expect(screen.queryByRole('radio', { name: /From a later month/ })).toBeNull()
    expect(screen.getByText('Saved ✓')).toBeInTheDocument()
  })
})

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

// Rules › Capacity (2026-10-10, the HR revamp): the four figures (read with
// the page), the limit and its Save, how many wait for a seat. The
// prototype's words throughout.

const act = vi.hoisted(() => ({ saveSubDepartmentCapacity: vi.fn() }))
const toast = vi.hoisted(() => ({ flash: vi.fn() }))
vi.mock('../../capacity-actions', () => act)
vi.mock('@/components/hrv/toast', () => toast)

import CapacityPanel, { type CapacityInitial } from './CapacityPanel'

const FAIR = 'sub-fair'
const now = { capacity: 30, occupied: 27, reserved: 0, free: 3, waiting: 2 }

const renderPanel = (initial: CapacityInitial = { ok: true, data: now }) =>
  render(<CapacityPanel subDepartmentId={FAIR} subName="Fair" subSlug="fair" initial={initial} />)
const card = (label: string) => screen.getByRole('group', { name: label })

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('CapacityPanel', () => {
  it('shows the figures the page read, the limit, and who is waiting', () => {
    renderPanel()
    expect(card('Capacity')).toHaveTextContent('30')
    expect(card('Active')).toHaveTextContent('27')
    expect(card('Reserved')).toHaveTextContent('0')
    expect(card('Free')).toHaveTextContent('3')
    expect(screen.getByLabelText('Headcount limit')).toHaveValue('30')
    expect(screen.getByText(/2 waiting for a seat/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Open Sales Groups › Waiting list' })).toHaveAttribute('href', '/revenue/fair/hierarchy?tab=waiting')
  })

  it('reads “not set” before a limit exists', () => {
    renderPanel({ ok: true, data: { capacity: null, occupied: 0, reserved: 0, free: null, waiting: 0 } })
    expect(card('Capacity')).toHaveTextContent('not set')
    expect(card('Free')).toHaveTextContent('—')
    expect(screen.getByLabelText('Headcount limit')).toHaveValue('')
  })

  it('refuses a limit below the seats taken, without asking the server', () => {
    renderPanel()
    fireEvent.change(screen.getByLabelText('Headcount limit'), { target: { value: '26' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(toast.flash).toHaveBeenCalledWith('Capacity cannot be lower than active members plus reserved positions.')
    expect(act.saveSubDepartmentCapacity).not.toHaveBeenCalled()
  })

  it('saves the limit and says matching runs against it', async () => {
    act.saveSubDepartmentCapacity.mockResolvedValue({ ok: true, data: { ...now, capacity: 32, free: 5 } })
    renderPanel()
    fireEvent.change(screen.getByLabelText('Headcount limit'), { target: { value: '32' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(toast.flash).toHaveBeenCalledWith('Fair capacity set to 32 — matching runs against it'))
    expect(act.saveSubDepartmentCapacity).toHaveBeenCalledWith(FAIR, '32')
    expect(card('Free')).toHaveTextContent('5')
  })

  it('says the server’s refusal', async () => {
    act.saveSubDepartmentCapacity.mockResolvedValue({ ok: false, reason: 'Capacity cannot be below occupied and reserved positions' })
    renderPanel()
    fireEvent.change(screen.getByLabelText('Headcount limit'), { target: { value: '28' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(toast.flash).toHaveBeenCalledWith('Capacity cannot be below occupied and reserved positions'))
  })

  it('says why the figures could not be read', () => {
    renderPanel({ ok: false, reason: 'Capacity needs HR request management access.' })
    expect(screen.getByRole('alert')).toHaveTextContent('Capacity needs HR request management access.')
    expect(screen.queryByLabelText('Headcount limit')).toBeNull()
  })

  it('follows the page when it reads again', () => {
    const view = renderPanel()
    view.rerender(<CapacityPanel subDepartmentId={FAIR} subName="Fair" subSlug="fair" initial={{ ok: true, data: { ...now, capacity: 31, free: 4 } }} />)
    expect(card('Capacity')).toHaveTextContent('31')
    expect(screen.getByLabelText('Headcount limit')).toHaveValue('31')
  })
})

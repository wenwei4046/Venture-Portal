import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import type { UpsaleView } from '../../../_lib/upsales'

const actions = vi.hoisted(() => ({
  recordUpsale: vi.fn(),
  updateUpsale: vi.fn(),
  deleteUpsale: vi.fn(),
}))
vi.mock('../../../upsale-actions', () => actions)
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))

import UpsaleSection from './UpsaleSection'

const TEAM = [
  { staffId: '6c1f5d0e-3b1a-4c2d-9e8f-1a2b3c4d5e6f', name: 'YUNY' },
  { staffId: '7d2a6e1f-4c2b-4d3e-8f9a-2b3c4d5e6f70', name: 'LOUIS' },
]
const FAIRS = [{ id: 'fair-bcck', label: 'BORNEO CONVENTION CENTRE KUCHING · 28–31 Aug · HOMELOVE', startDate: '2026-08-28' }]
const UPSALE: UpsaleView = {
  id: 'u1',
  staffId: TEAM[0].staffId,
  staffName: 'YUNY',
  amount: 300,
  soldOn: '2026-08-29',
  fairEventId: 'fair-bcck',
  fairLabel: FAIRS[0].label,
  originalRef: 'HC5315',
  note: 'protector',
}

function show(props: Partial<Parameters<typeof UpsaleSection>[0]> = {}) {
  return render(
    <UpsaleSection
      subDepartmentId="fair"
      period="2026-09-01"
      upsales={[UPSALE]}
      team={TEAM}
      fairs={FAIRS}
      locked={false}
      {...props}
    />,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  actions.recordUpsale.mockResolvedValue(undefined)
  actions.updateUpsale.mockResolvedValue(undefined)
  actions.deleteUpsale.mockResolvedValue(undefined)
})

describe('UpsaleSection', () => {
  it('lists the month’s upsales with their total', () => {
    show()
    expect(screen.getByText('1 upsale · RM 300.00')).toBeVisible()
    expect(screen.getByRole('cell', { name: 'HC5315' })).toBeVisible()
    expect(screen.getByRole('cell', { name: FAIRS[0].label })).toBeVisible()
  })

  it('records what was typed, for this sub-department and month', async () => {
    show({ upsales: [] })
    fireEvent.change(screen.getByLabelText('Salesperson'), { target: { value: TEAM[1].staffId } })
    fireEvent.change(screen.getByLabelText('Amount added'), { target: { value: '1300' } })
    fireEvent.change(screen.getByLabelText('Fair'), { target: { value: 'fair-bcck' } })
    fireEvent.change(screen.getByLabelText('Added to bill'), { target: { value: 'HC12878' } })
    // Picking a fair fills in the day it opened when no day was typed.
    expect(screen.getByLabelText('Sold on')).toHaveValue('2026-08-28')

    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Record upsale' })))
    expect(actions.recordUpsale).toHaveBeenCalledWith('fair', '2026-09-01', {
      staffId: TEAM[1].staffId,
      amount: '1300',
      soldOn: '2026-08-28',
      fairEventId: 'fair-bcck',
      originalRef: 'HC12878',
      note: '',
    })
  })

  it('edits an upsale in the same form', async () => {
    show()
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    expect(screen.getByText('Change this upsale')).toBeVisible()
    expect(screen.getByLabelText('Amount added')).toHaveValue('300.00')
    fireEvent.change(screen.getByLabelText('Amount added'), { target: { value: '350' } })

    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Save changes' })))
    expect(actions.updateUpsale).toHaveBeenCalledWith('u1', expect.objectContaining({ amount: '350', originalRef: 'HC5315' }))
    expect(actions.recordUpsale).not.toHaveBeenCalled()
  })

  it('asks twice before deleting', async () => {
    show()
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    expect(actions.deleteUpsale).not.toHaveBeenCalled()
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Confirm delete' })))
    expect(actions.deleteUpsale).toHaveBeenCalledWith('u1')
  })

  it('shows what the action refused, in its words', async () => {
    actions.recordUpsale.mockRejectedValue(new Error('The upsale amount must be more than RM 0.'))
    show({ upsales: [] })
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Record upsale' })))
    expect(screen.getByRole('alert')).toHaveTextContent('The upsale amount must be more than RM 0.')
  })

  it('is read-only once the month’s run has paid', () => {
    show({ locked: true })
    expect(screen.getByText(/This month’s run has paid|This month's run has paid/)).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Record upsale' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull()
    expect(screen.getByText('1 upsale · RM 300.00')).toBeVisible()
  })
})

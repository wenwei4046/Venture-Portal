import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import SchemeSwitches from './SchemeSwitches'

const { setMonthOpenBill, setSchemeSwitch, refresh } = vi.hoisted(() => ({
  setMonthOpenBill: vi.fn(),
  setSchemeSwitch: vi.fn(),
  refresh: vi.fn(),
}))
vi.mock('../../../config-actions', () => ({ setMonthOpenBill, setSchemeSwitch }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))

const props = {
  schemeId: 'scheme-fair',
  subDepartmentId: 'fair',
  period: '2026-08-01',
  monthLabel: 'August 2026',
  margin: false,
  kpi: false,
}

beforeEach(() => {
  vi.clearAllMocks()
  setMonthOpenBill.mockResolvedValue(undefined)
  setSchemeSwitch.mockResolvedValue(undefined)
})
afterEach(cleanup)

describe('SchemeSwitches', () => {
  it('sets Open Bill for this month alone (open for August, not September)', async () => {
    render(<SchemeSwitches {...props} openBill={{ on: false, rules: false, month: null }} />)
    expect(screen.queryByText(/only · Rules/)).toBeNull()

    fireEvent.click(screen.getByRole('switch', { name: 'Open Bill' }))
    await waitFor(() => expect(setMonthOpenBill).toHaveBeenCalledWith('fair', '2026-08-01', true))
    expect(setSchemeSwitch).not.toHaveBeenCalled()
    expect(screen.getByRole('switch', { name: 'Open Bill' })).toHaveAttribute('aria-checked', 'true')
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('says when the month has its own setting, and hands it back to Rules', async () => {
    render(<SchemeSwitches {...props} openBill={{ on: true, rules: false, month: true }} />)
    expect(screen.getByRole('switch', { name: 'Open Bill' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByText('August 2026 only · Rules: Off')).toBeVisible()

    fireEvent.click(screen.getByRole('button', { name: 'Follow Rules' }))
    await waitFor(() => expect(setMonthOpenBill).toHaveBeenCalledWith('fair', '2026-08-01', null))
    expect(screen.getByRole('switch', { name: 'Open Bill' })).toHaveAttribute('aria-checked', 'false')
  })

  it('keeps margin and KPI as Rules for every month', async () => {
    render(<SchemeSwitches {...props} openBill={{ on: false, rules: false, month: null }} />)
    fireEvent.click(screen.getByRole('switch', { name: 'Margin incentive & penalty' }))
    await waitFor(() => expect(setSchemeSwitch).toHaveBeenCalledWith('scheme-fair', 'margin', true))
    expect(setMonthOpenBill).not.toHaveBeenCalled()
  })

  it('puts the switch back and says why when the month refuses', async () => {
    setMonthOpenBill.mockRejectedValue(new Error('The 2026-08 run has paid. Reopen it before changing what it pays.'))
    render(<SchemeSwitches {...props} openBill={{ on: false, rules: false, month: null }} />)
    fireEvent.click(screen.getByRole('switch', { name: 'Open Bill' }))
    expect(await screen.findByText(/run has paid/)).toBeVisible()
    expect(screen.getByRole('switch', { name: 'Open Bill' })).toHaveAttribute('aria-checked', 'false')
  })
})

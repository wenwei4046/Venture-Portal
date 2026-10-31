import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import SchemeSwitches from './SchemeSwitches'

const { setSchemeSwitch, refresh } = vi.hoisted(() => ({
  setSchemeSwitch: vi.fn(),
  refresh: vi.fn(),
}))
vi.mock('../../../config-actions', () => ({ setSchemeSwitch }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))

const props = { schemeId: 'scheme-fair', margin: false, kpi: false }

beforeEach(() => {
  vi.clearAllMocks()
  setSchemeSwitch.mockResolvedValue(undefined)
})
afterEach(cleanup)

describe('SchemeSwitches', () => {
  it('keeps margin and KPI as Rules for every month', async () => {
    render(<SchemeSwitches {...props} />)
    fireEvent.click(screen.getByRole('switch', { name: 'Margin incentive & penalty' }))
    await waitFor(() => expect(setSchemeSwitch).toHaveBeenCalledWith('scheme-fair', 'margin', true))
    expect(screen.getByRole('switch', { name: 'Margin incentive & penalty' })).toHaveAttribute('aria-checked', 'true')
    expect(refresh).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('switch', { name: 'KPI item' }))
    await waitFor(() => expect(setSchemeSwitch).toHaveBeenCalledWith('scheme-fair', 'kpi', true))
  })

  it('has no Open Bill switch: Open Bill went (2026-10-31)', () => {
    render(<SchemeSwitches {...props} />)
    expect(screen.getAllByRole('switch').map(s => s.getAttribute('aria-label'))).toEqual(['Margin incentive & penalty', 'KPI item'])
    expect(screen.queryByText(/Open Bill/)).toBeNull()
  })

  it('puts the switch back and says why when the save refuses', async () => {
    setSchemeSwitch.mockRejectedValue(new Error('Could not change the switch'))
    render(<SchemeSwitches {...props} kpi />)
    fireEvent.click(screen.getByRole('switch', { name: 'KPI item' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not change the switch')
    expect(screen.getByRole('switch', { name: 'KPI item' })).toHaveAttribute('aria-checked', 'true')
  })
})

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DepartmentMode } from '@/lib/department-mode'
import DepartmentModeSwitch from './DepartmentModeSwitch'

const actions = vi.hoisted(() => ({ setDepartmentCostModel: vi.fn() }))
vi.mock('@/app/(portal)/settings/department-mode-actions', () => actions)
const refresh = vi.hoisted(() => vi.fn())
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }))

function dept(extra: Partial<DepartmentMode> = {}): DepartmentMode {
  return {
    id: 'hr-id',
    name: 'HR',
    segmentKey: 'hr',
    isInternal: false,
    costModel: 'cost_center',
    openSplitPeople: 3,
    canSwitch: true,
    ...extra,
  }
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

// User 2026-09-30: an on/off switch per department between cost center and
// centralized, flipped by the highest authority.
describe('DepartmentModeSwitch', () => {
  // 2026-10-12 (the user: the descriptions make the view too messy): the
  // switch names the mode; no line beside it says what the mode means.
  it('shows the mode, off for a cost center — and no line on what it means', () => {
    render(<DepartmentModeSwitch department={dept()} />)
    const toggle = screen.getByRole('switch', { name: 'HR is centralized' })
    expect(toggle).toHaveAttribute('aria-checked', 'false')
    expect(toggle).toHaveTextContent('Cost center')
    expect(screen.queryByText(/its pool should net to zero/)).toBeNull()
  })

  it('asks before switching, says what will be cleared, then switches and refreshes', async () => {
    actions.setDepartmentCostModel.mockResolvedValue({ ok: true, changed: true, clearedPeople: 3 })
    render(<DepartmentModeSwitch department={dept()} />)
    fireEvent.click(screen.getByRole('switch', { name: 'HR is centralized' }))
    expect(actions.setDepartmentCostModel).not.toHaveBeenCalled()
    expect(screen.getByText(/3 splits on payroll still in draft will be cleared/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Switch to Centralized' }))
    await waitFor(() => expect(actions.setDepartmentCostModel).toHaveBeenCalledWith('hr-id', 'centralized'))
    expect(await screen.findByText('HR is now centralized. Cleared 3 draft splits.')).toBeInTheDocument()
    expect(refresh).toHaveBeenCalled()
  })

  it('switches a centralized department back to cost center', async () => {
    actions.setDepartmentCostModel.mockResolvedValue({ ok: true, changed: true, clearedPeople: 0 })
    render(<DepartmentModeSwitch department={dept({ name: 'Marketing', id: 'mkt', costModel: 'centralized', openSplitPeople: 0 })} />)
    const toggle = screen.getByRole('switch', { name: 'Marketing is centralized' })
    expect(toggle).toHaveAttribute('aria-checked', 'true')
    fireEvent.click(toggle)
    expect(screen.getByText(/Marketing joins Billing Allocation/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Switch to Cost center' }))
    await waitFor(() => expect(actions.setDepartmentCostModel).toHaveBeenCalledWith('mkt', 'cost_center'))
  })

  it('can be put back without switching', () => {
    render(<DepartmentModeSwitch department={dept()} />)
    fireEvent.click(screen.getByRole('switch', { name: 'HR is centralized' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('button', { name: 'Switch to Centralized' })).toBeNull()
    expect(actions.setDepartmentCostModel).not.toHaveBeenCalled()
  })

  it('says why when the database refuses', async () => {
    actions.setDepartmentCostModel.mockResolvedValue({
      ok: false,
      reason: 'Only the Principal can switch a department between cost center and centralized',
    })
    render(<DepartmentModeSwitch department={dept()} />)
    fireEvent.click(screen.getByRole('switch', { name: 'HR is centralized' }))
    fireEvent.click(screen.getByRole('button', { name: 'Switch to Centralized' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Only the Principal can switch')
    expect(refresh).not.toHaveBeenCalled()
  })

  it('is read-only for somebody who may not switch it — the tooltip says who does', () => {
    render(<DepartmentModeSwitch department={dept({ canSwitch: false })} />)
    const toggle = screen.getByRole('switch', { name: 'HR is centralized' })
    expect(toggle).toBeDisabled()
    expect(toggle).toHaveAttribute('title', 'Only the Principal can switch this')
    expect(screen.queryByText('Switched by the Principal.')).toBeNull()
  })
})

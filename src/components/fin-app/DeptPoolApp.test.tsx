import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import type { DeptPoolHubModel } from '@/lib/fin-app/dept-pool-model'

// Department › Dept Pool in the Finance phone app (2026-10-15, part E3): a
// department's balance stays hidden until Show balances (the desktop column's
// toggle), a department opens its own page, Mark executed answers in words.

const mocks = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn(), flash: vi.fn(), execute: vi.fn() }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push, refresh: mocks.refresh, replace: mocks.replace }),
  usePathname: () => '/fin-app/page/dp',
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@/components/layout/RouteFreshener', () => ({ default: () => null }))
vi.mock('@/components/hrv/toast', async (orig) => ({ ...(await orig<object>()), flash: mocks.flash }))
vi.mock('@/app/(portal)/dept-pool/hr-actions', () => ({ executeHrCostingInWords: mocks.execute }))

import FinAppFrame from './FinAppFrame'
import DeptPoolApp from './DeptPoolApp'
import { resetNav } from './nav'

const MODEL: DeptPoolHubModel = {
  basis: 'cash',
  hero: { value: 'RM 45,839.14', label: 'Total balance · 1 department' },
  chip: null,
  cards: [
    { key: 'depts', tone: 'all', icon: 'org', label: 'By department', sub: 'In 1.00 · Out 0.00 · to date', value: 'RM 1.00' },
    { key: 'hr', tone: 'payroll', icon: 'payroll', label: 'HR costing', sub: '1 ready to execute', value: '1 submission' },
  ],
  depts: [{ key: 'hr', name: 'HR', balance: 45839.14, sub: 'In 1.00 · Out 0.00 · net 1.00', value: null, tone: null, chip: null, slug: 'hr' }],
  banks: null,
  submissions: [
    { id: 'sub-1', label: 'September 2026', sub: 'Submitted 2 Oct 2026 · 10:00', value: '12,000.00', state: { text: 'ready to execute', tone: 'accent' }, ready: true, parts: [{ key: 'HR', label: 'HR', sub: '3 staff', value: '12,000.00' }] },
  ],
}

const draw = () =>
  render(
    <FinAppFrame platform="android" rows={['dp']}>
      <DeptPoolApp model={MODEL} search="" canExecuteHr />
    </FinAppFrame>,
  )

beforeEach(() => {
  resetNav()
  window.history.replaceState(null, '', '/fin-app/page/dp')
})
afterEach(() => vi.clearAllMocks())

describe('Dept Pool on the phone', () => {
  it('a balance is hidden until shown; a department opens its own page', () => {
    draw()
    fireEvent.click(screen.getByRole('button', { name: /^By department/ }))
    expect(screen.getByText('••••••')).toBeInTheDocument()
    expect(screen.queryByText('45,839.14')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Show balances' }))
    expect(screen.getByText('45,839.14')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /^HR/ }))
    expect(mocks.push).toHaveBeenCalledWith('/fin-app/page/dp-hr')
  })

  it('Mark executed goes through the action and answers in words', async () => {
    mocks.execute.mockResolvedValue({ ok: false, reason: 'Failed to execute HR costing: period closed' })
    draw()
    fireEvent.click(screen.getByRole('button', { name: /^HR costing/ }))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Mark executed' }))
    })
    expect(mocks.execute).toHaveBeenCalledWith('sub-1')
    expect(screen.getByText('Failed to execute HR costing: period closed')).toBeInTheDocument()
    mocks.execute.mockResolvedValue({ ok: true })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Mark executed' }))
    })
    expect(mocks.flash).toHaveBeenCalledWith('Marked executed')
  })

  it('a submission opens onto its departments', () => {
    draw()
    fireEvent.click(screen.getByRole('button', { name: /^HR costing/ }))
    fireEvent.click(screen.getByRole('button', { name: /September 2026/ }))
    expect(window.location.search).toBe('?f=hr&d=sub-1')
    expect(screen.getByText('3 staff')).toBeInTheDocument()
  })
})

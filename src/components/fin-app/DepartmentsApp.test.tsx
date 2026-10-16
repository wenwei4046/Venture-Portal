import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import type { DepartmentMode } from '@/lib/department-mode'
import { departmentsModel, type DeptInput } from '@/lib/fin-app/departments-model'

// Profile › Admin › Departments in the Finance phone app (2026-10-15, part
// E3b): the desktop's steps on a department — Bill back salary in one press,
// the mode switch and Provision asked first, + New department's name — each
// the desktop's action, answered in words.

const mocks = vi.hoisted(() => ({
  push: vi.fn(), refresh: vi.fn(), replace: vi.fn(), flash: vi.fn(),
  add: vi.fn(), billback: vi.fn(), provision: vi.fn(), mode: vi.fn(),
}))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push, refresh: mocks.refresh, replace: mocks.replace }),
  usePathname: () => '/fin-app/page/depts',
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@/components/layout/RouteFreshener', () => ({ default: () => null }))
vi.mock('@/components/hrv/toast', async (orig) => ({ ...(await orig<object>()), flash: mocks.flash }))
vi.mock('@/app/(portal)/settings/actions', () => ({
  addDepartmentInWords: mocks.add,
  setDepartmentBillbackInWords: mocks.billback,
  provisionDepartmentInWords: mocks.provision,
}))
vi.mock('@/app/(portal)/settings/department-mode-actions', () => ({ setDepartmentCostModel: mocks.mode }))

import FinAppFrame from './FinAppFrame'
import DepartmentsApp from './DepartmentsApp'
import { resetNav } from './nav'

const ROWS: DeptInput[] = [
  { id: 'mkt', name: 'Marketing', is_internal: false, segment_key: 'marketing', pool_gl_code: '1030', billing_mode_key: 'marketing_project', own_share_billback: false },
  { id: 'ops', name: 'Operations', is_internal: false, segment_key: null, pool_gl_code: null, billing_mode_key: null, own_share_billback: false },
]
const MODES: DepartmentMode[] = [{ id: 'mkt', name: 'Marketing', segmentKey: 'marketing', isInternal: false, costModel: 'centralized', openSplitPeople: 0, canSwitch: true }]

const draw = (canManage = true, search = '') => {
  // The address is the truth the screen reads (a link, a refresh).
  window.history.replaceState(null, '', `/fin-app/page/depts${search ? `?${search}` : ''}`)
  return render(
    <FinAppFrame platform="android" rows={[]}>
      <DepartmentsApp model={departmentsModel(ROWS, MODES, { '1030': 'Dept Pool - Marketing' })} search={search} canManage={canManage} />
    </FinAppFrame>,
  )
}

beforeEach(() => {
  resetNav()
  window.history.replaceState(null, '', '/fin-app/page/depts')
})
afterEach(() => vi.clearAllMocks())

describe('Departments on the phone', () => {
  it('a department’s screen says it in words; Bill back salary is one press', async () => {
    mocks.billback.mockResolvedValue({ ok: true })
    draw(true, 'f=all&d=mkt')
    expect(screen.getByText('1030 · Dept Pool - Marketing')).toBeInTheDocument()
    expect(screen.getByText('No · stays in its own pool')).toBeInTheDocument()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Bill back salary' }))
    })
    expect(mocks.billback).toHaveBeenCalledWith('mkt', true)
    expect(mocks.flash).toHaveBeenCalledWith('Marketing bills its own-share salary back')
  })

  it('the mode switch says what it does and asks first', async () => {
    mocks.mode.mockResolvedValue({ ok: true, changed: true, clearedPeople: 0 })
    draw(true, 'f=all&d=mkt')
    fireEvent.click(screen.getByRole('button', { name: 'Switch to Cost center' }))
    const ask = await screen.findByRole('dialog', { name: 'Switch Marketing to Cost center?' })
    expect(within(ask).getByText(/Marketing joins Billing Allocation/)).toBeInTheDocument()
    expect(mocks.mode).not.toHaveBeenCalled()
    await act(async () => {
      fireEvent.click(within(ask).getByRole('button', { name: 'Switch to Cost center' }))
    })
    expect(mocks.mode).toHaveBeenCalledWith('mkt', 'cost_center')
    expect(mocks.flash).toHaveBeenCalledWith('Marketing is now a cost center.')
  })

  it('Provision asks for the segment key (the name as a key) and says it cannot be undone', async () => {
    mocks.provision.mockResolvedValue({ ok: false, reason: 'Provision failed: segment exists' })
    draw(true, 'f=all&d=ops')
    fireEvent.click(screen.getByRole('button', { name: 'Provision' }))
    const ask = await screen.findByRole('dialog', { name: 'Provision Operations?' })
    expect(within(ask).getByLabelText('Segment key')).toHaveValue('operations')
    expect(within(ask).getByText('This cannot be undone — the segment stays.')).toBeInTheDocument()
    await act(async () => {
      fireEvent.click(within(ask).getByRole('button', { name: 'Provision' }))
    })
    expect(mocks.provision).toHaveBeenCalledWith('ops', 'operations')
    expect(within(ask).getByText('Provision failed: segment exists')).toBeInTheDocument()
    // A key the database would refuse is not sent.
    fireEvent.change(within(ask).getByLabelText('Segment key'), { target: { value: 'op' } })
    expect(within(ask).getByText('3–31 letters, digits or _, a letter first.')).toBeInTheDocument()
    mocks.provision.mockClear()
    await act(async () => {
      fireEvent.click(within(ask).getByRole('button', { name: 'Provision' }))
    })
    expect(mocks.provision).not.toHaveBeenCalled()
  })

  it('+ New department asks the name and answers in words', async () => {
    mocks.add.mockResolvedValue({ ok: false, reason: 'Department "Marketing" already exists' })
    draw()
    fireEvent.click(screen.getByRole('button', { name: '+ New department' }))
    const sheet = await screen.findByRole('dialog', { name: 'New department' })
    fireEvent.change(within(sheet).getByLabelText('Department name'), { target: { value: 'Marketing' } })
    await act(async () => {
      fireEvent.click(within(sheet).getByRole('button', { name: 'Add department' }))
    })
    expect(mocks.add).toHaveBeenCalledWith('Marketing')
    expect(within(sheet).getByText('Department "Marketing" already exists')).toBeInTheDocument()
  })

  it('without Settings · Manage there is no step but the mode switch (the person signed in may)', () => {
    draw(false, 'f=all&d=mkt')
    expect(screen.queryByRole('button', { name: 'Bill back salary' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Switch to Cost center' })).toBeInTheDocument()
    resetNav()
  })
})

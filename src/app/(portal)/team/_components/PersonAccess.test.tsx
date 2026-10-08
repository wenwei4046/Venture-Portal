import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import type { PersonAccessData } from '../_lib/person-permissions'
import type { PermFunction } from '@/lib/permission-matrix'

const mocks = vi.hoisted(() => ({ setPersonCells: vi.fn(), clearLegacyExceptions: vi.fn(), setUserPermission: vi.fn(), refresh: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mocks.refresh }) }))
vi.mock('../people/permission-actions', () => ({
  setPersonCells: mocks.setPersonCells,
  clearLegacyExceptions: mocks.clearLegacyExceptions,
  setUserPermission: mocks.setUserPermission,
}))

import PersonAccess, { accessCount } from './PersonAccess'

const fn = (key: string, label: string, actions: string, scopes: string): PermFunction => ({
  key, label, section: 'People', actions: actions.split(' ') as PermFunction['actions'], scopes: scopes.split(' ') as PermFunction['scopes'], description: null,
})
const USER = '00000000-0000-4000-8000-0000000000aa'

const access = (overrides: Partial<Extract<PersonAccessData, { kind: 'template' }>> = {}): PersonAccessData => ({
  kind: 'template',
  userId: USER,
  titleName: 'REVENUE DIRECTOR',
  template: { id: 't', name: 'Revenue Team', baseRole: 'revenue_member', grants: { revenue_app: { view: 'own', create: 'own' } }, sensitive: [] },
  cells: {},
  legacy: [],
  functions: [fn('revenue_app', 'Revenue app', 'view create', 'own'), fn('dept_reports', 'Department reports', 'view export', 'dept all')],
  cellKeys: [],
  ...overrides,
})

describe('a person’s own permissions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.setPersonCells.mockResolvedValue({ ok: true })
    mocks.clearLegacyExceptions.mockResolvedValue({ ok: true, cleared: 3 })
  })

  it('lowers one cell for them alone and saves only that exception', async () => {
    const onSaved = vi.fn()
    render(<PersonAccess access={access()} canEdit onSaved={onSaved} />)
    expect(screen.getByText(/Template/).textContent).toContain('Revenue Team')
    fireEvent.click(screen.getByRole('button', { name: 'Revenue app · Create: Own' }))
    expect(screen.getByRole('button', { name: 'Revenue app · Create: not granted (changed for this person)' })).toBeInTheDocument()
    expect(screen.getByText(/0 raised, 1 lowered for this person only/)).toBeInTheDocument()
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Save their permissions' })))
    expect(mocks.setPersonCells).toHaveBeenCalledWith(USER, [{ function_key: 'revenue_app', action: 'create', scope: null }])
    expect(onSaved).toHaveBeenCalled()
  })

  it('cycling back to the template is no change at all', () => {
    render(<PersonAccess access={access()} canEdit />)
    fireEvent.click(screen.getByRole('button', { name: 'Revenue app · Create: Own' }))
    fireEvent.click(screen.getByRole('button', { name: 'Revenue app · Create: not granted (changed for this person)' }))
    expect(screen.queryByRole('button', { name: 'Save their permissions' })).toBeNull()
  })

  it('shows old per-key exceptions still in force, and clears them', async () => {
    render(<PersonAccess access={access({ legacy: [{ key: 'reports', label: 'Reports', granted: false }] })} canEdit />)
    expect(screen.getByText(/Reports denied/)).toBeInTheDocument()
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Clear them' })))
    expect(mocks.clearLegacyExceptions).toHaveBeenCalledWith(USER)
  })

  it('is read-only without accounts.manage', () => {
    render(<PersonAccess access={access({ cells: { 'dept_reports.view': 'dept' } })} canEdit={false} />)
    expect(screen.queryByRole('button', { name: /Revenue app/ })).toBeNull()
    expect(screen.getByText(/1 raised, 0 lowered/)).toBeInTheDocument()
  })

  it('counts what they hold for the tab badge', () => {
    expect(accessCount(access())).toBe(2)
    expect(accessCount(access({ cells: { 'dept_reports.view': 'dept', 'revenue_app.create': 'none' } }))).toBe(2)
    expect(accessCount({ kind: 'legacy', userId: USER, source: 'the finance role', rows: [
      { key: 'reports', label: 'Reports', section: 'Reports', inherited: true, override: false },
      { key: 'treasury', label: 'Treasury', section: 'Daily', inherited: true, override: null },
    ] })).toBe(1)
  })
})

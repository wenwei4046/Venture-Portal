import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import type { PersonAccessData } from '../_lib/person-permissions'
import type { CellKey, PermFunction } from '@/lib/permission-matrix'

const mocks = vi.hoisted(() => ({ setPersonTabs: vi.fn(), clearLegacyExceptions: vi.fn(), setUserPermission: vi.fn(), refresh: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mocks.refresh }) }))
vi.mock('../people/permission-actions', () => ({
  setPersonTabs: mocks.setPersonTabs,
  clearLegacyExceptions: mocks.clearLegacyExceptions,
  setUserPermission: mocks.setUserPermission,
}))

import PersonAccess, { accessCount } from './PersonAccess'

const fn = (key: string, label: string, actions: string, scopes: string): PermFunction => ({
  key, label, section: 'People', actions: actions.split(' ') as PermFunction['actions'], scopes: scopes.split(' ') as PermFunction['scopes'], description: null,
})
const K = (functionKey: string, action: CellKey['action'], legacyKey: string): CellKey => ({ functionKey, action, legacyKey, minScope: 'own', gate: null })
const USER = '00000000-0000-4000-8000-0000000000aa'

// The Revenue Team template as production holds it, with the keys its cells open.
const access = (overrides: Partial<Extract<PersonAccessData, { kind: 'template' }>> = {}): PersonAccessData => ({
  kind: 'template',
  userId: USER,
  titleName: 'TEAM LEADER',
  template: { id: 't', name: 'Revenue Team', baseRole: 'revenue_member', grants: { revenue_app: { view: 'own', create: 'own' } }, sensitive: [], tabs: null },
  cells: {},
  boxes: [],
  legacy: [],
  functions: [fn('revenue_app', 'Revenue app', 'view create', 'own')],
  cellKeys: [
    K('revenue_app', 'view', 'member_portal'), K('revenue_app', 'view', 'member_insight'), K('revenue_app', 'view', 'member_memos'),
    K('revenue_app', 'create', 'member_quote'), K('revenue_app', 'create', 'member_requests'),
  ],
  ...overrides,
})
const box = (name: string) => screen.getByRole('checkbox', { name })

describe('a person’s own permissions, by view and tab (HR revamp 8)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.setPersonTabs.mockResolvedValue({ ok: true })
    mocks.clearLegacyExceptions.mockResolvedValue({ ok: true, cleared: 3 })
  })

  it('opens on their title’s view, and lowers one box for them alone with a red dot', async () => {
    const onSaved = vi.fn()
    render(<PersonAccess access={access()} canEdit onSaved={onSaved} personName="Anthony" />)
    expect(screen.getByText(/From title/)).toHaveTextContent('From title TEAM LEADER. A red dot marks a box changed for Anthony only.')
    expect(screen.getByRole('tab', { name: /Revenue app/ })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: /Revenue app/ })).toHaveTextContent('8/11')
    fireEvent.click(box('Quote · Create'))
    expect(box('Quote · Create')).toHaveAttribute('aria-checked', 'false')
    expect(screen.getByLabelText('changed for this person')).toBeInTheDocument()
    expect(screen.getByText(/1 change from the title/)).toBeInTheDocument()
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Save' })))
    expect(mocks.setPersonTabs).toHaveBeenCalledWith({ userId: USER, templateId: 't', boxes: [{ tab: 'rev.quote', action: 'create', granted: false }] })
    expect(onSaved).toHaveBeenCalled()
  })

  it('ticking it back is no change at all', () => {
    render(<PersonAccess access={access()} canEdit />)
    fireEvent.click(box('Quote · Create'))
    fireEvent.click(box('Quote · Create'))
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Reset to title' })).toBeNull()
  })

  it('Reset to title puts them back on the template', async () => {
    render(<PersonAccess access={access({ boxes: [{ tab: 'rev.quote', action: 'create', granted: false }] })} canEdit />)
    expect(screen.getByLabelText('changed for this person')).toBeInTheDocument()
    expect(screen.queryByText(/saved over another template/)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Reset to title' }))
    expect(screen.queryByLabelText('changed for this person')).toBeNull()
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Save' })))
    expect(mocks.setPersonTabs).toHaveBeenCalledWith({ userId: USER, templateId: 't', boxes: [] })
  })

  // Their title moved to another template since: the ✕ stored for Quote's Create would still close
  // the Requests' and the Waiting list's, which their window shows ticked.
  it('says when their boxes were saved over another template, and Save puts them in force', async () => {
    const stale = access({ boxes: [{ tab: 'rev.quote', action: 'create', granted: false }], cells: { 'revenue_app.create': 'none' } })
    render(<PersonAccess access={stale} canEdit personName="Anthony" />)
    expect(screen.getByRole('status')).toHaveTextContent('Anthony’s own boxes were saved over another template.')
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled()
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Save' })))
    expect(mocks.setPersonTabs).toHaveBeenCalledWith({ userId: USER, templateId: 't', boxes: [{ tab: 'rev.quote', action: 'create', granted: false }] })
  })

  it('a person with own cells and no boxes yet is drawn from their cells', () => {
    render(<PersonAccess access={access({ cells: { 'revenue_app.create': 'none' } })} canEdit={false} />)
    expect(box('Quote · Create')).toHaveAttribute('aria-checked', 'false')
    expect(screen.getAllByLabelText('changed for this person').length).toBeGreaterThan(0)
  })

  it('stands Reset to title and Save in the window’s footer when it has one', () => {
    const foot = document.createElement('div')
    document.body.appendChild(foot)
    render(<PersonAccess access={access({ boxes: [{ tab: 'rev.quote', action: 'create', granted: false }] })} canEdit footSlot={foot} />)
    expect(foot).toHaveTextContent('Reset to titleSave')
    foot.remove()
  })

  it('shows old per-key exceptions still in force, and clears them', async () => {
    render(<PersonAccess access={access({ legacy: [{ key: 'reports', label: 'Reports', granted: false }] })} canEdit />)
    expect(screen.getByText(/Reports denied/)).toBeInTheDocument()
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Clear them' })))
    expect(mocks.clearLegacyExceptions).toHaveBeenCalledWith(USER)
  })

  it('is read-only without accounts.manage', () => {
    render(<PersonAccess access={access()} canEdit={false} />)
    expect(box('Quote · Create')).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull()
  })

  it('counts the tabs they see for the tab badge', () => {
    expect(accessCount(access())).toBe(8)
    expect(accessCount(access({ boxes: [{ tab: 'rev.today', action: 'view', granted: false }] }))).toBe(7)
    expect(accessCount({ kind: 'legacy', userId: USER, source: 'the finance role', rows: [
      { key: 'reports', label: 'Reports', section: 'Reports', inherited: true, override: false },
      { key: 'treasury', label: 'Treasury', section: 'Daily', inherited: true, override: null },
    ] })).toBe(1)
  })
})

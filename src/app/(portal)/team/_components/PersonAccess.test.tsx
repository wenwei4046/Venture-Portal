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
  reach: null,
  ownSensitive: [],
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
    // No lede over the matrix (2026-10-12: the explanatory wording made the view messy).
    expect(screen.queryByText(/From title/)).toBeNull()
    expect(screen.queryByText(/A red dot marks/)).toBeNull()
    expect(screen.getByRole('tab', { name: /Revenue app/ })).toHaveAttribute('aria-selected', 'true')
    // 16 Revenue app tabs since the rest of Profile got its boxes (2026-10-11), 17 with IT requests (2026-10-20); the
    // Revenue Team sees 13.
    expect(screen.getByRole('tab', { name: /Revenue app/ })).toHaveTextContent('13/17')
    fireEvent.click(box('Quote · Create'))
    expect(box('Quote · Create')).toHaveAttribute('aria-checked', 'false')
    expect(screen.getByLabelText('changed for this person')).toBeInTheDocument()
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Save' })))
    expect(mocks.setPersonTabs).toHaveBeenCalledWith({ userId: USER, templateId: 't', sensitive: [], boxes: [{ tab: 'rev.quote', action: 'create', granted: false }] })
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
    expect(mocks.setPersonTabs).toHaveBeenCalledWith({ userId: USER, templateId: 't', sensitive: [], boxes: [] })
  })

  // Their title moved to another template since: the ✕ stored for Quote's Create would still close
  // the Requests' and the Waiting list's, which their window shows ticked.
  it('says when their boxes were saved over another template, and Save puts them in force', async () => {
    const stale = access({ boxes: [{ tab: 'rev.quote', action: 'create', granted: false }], cells: { 'revenue_app.create': 'none' } })
    render(<PersonAccess access={stale} canEdit personName="Anthony" />)
    expect(screen.getByRole('status')).toHaveTextContent('Anthony’s own boxes were saved over another template.')
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled()
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Save' })))
    expect(mocks.setPersonTabs).toHaveBeenCalledWith({ userId: USER, templateId: 't', sensitive: [], boxes: [{ tab: 'rev.quote', action: 'create', granted: false }] })
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

  it('Select all takes a whole column for them alone, each box with its red dot', async () => {
    render(<PersonAccess access={access()} canEdit personName="Anthony" />)
    // Every Create box of the view is ticked on the title: one click unticks the column.
    expect(box('Select all · Create')).toHaveAttribute('aria-checked', 'true')
    fireEvent.click(box('Select all · Create'))
    expect(box('Quote · Create')).toHaveAttribute('aria-checked', 'false')
    expect(box('Select all · Create')).toHaveAttribute('aria-checked', 'false')
    expect(screen.getAllByLabelText('changed for this person')).toHaveLength(4)
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Save' })))
    expect(mocks.setPersonTabs).toHaveBeenCalledWith({
      userId: USER, templateId: 't', sensitive: [],
      boxes: ['rev.quote', 'rev.requests', 'rev.rooms', 'rev.track'].sort().map(tab => ({ tab, action: 'create', granted: false })),
    })
  })

  it('counts the tabs they see for the tab badge', () => {
    expect(accessCount(access())).toBe(13)
    expect(accessCount(access({ boxes: [{ tab: 'rev.today', action: 'view', granted: false }] }))).toBe(12)
    expect(accessCount({ kind: 'legacy', userId: USER, source: 'the finance role', rows: [
      { key: 'reports', label: 'Reports', section: 'Reports', inherited: true, override: false },
      { key: 'treasury', label: 'Treasury', section: 'Daily', inherited: true, override: null },
    ] })).toBe(1)
  })
})

// Sub-departments per person (2026-10-16 — the owner: "在 CRM 权限那边，应该可以让我去打勾，它是按 sub-department
// 去打勾的"): under a Revenue tab whose View is ticked, a pill per sub-department.
describe('a person’s sub-departments on the Revenue tabs', () => {
  const FAIR = '11111111-1111-4111-8111-111111111111'
  const IR = '22222222-2222-4222-8222-222222222222'
  // KRIS: Fair's director, the CRM's two tabs ticked on his template.
  const kris = (ticks: Array<{ area: 'crm' | 'comm_cal' | 'sales_groups' | 'rules'; sub: string; granted: boolean }> = []) => access({
    template: {
      id: 't', name: 'Revenue Director', baseRole: 'revenue_member', grants: { revenue_app: { view: 'own' } }, sensitive: [],
      tabs: ['rev.today.view', 'rev.leads.view', 'rev.leads.edit', 'rev.crm_team.view'],
    },
    reach: { subs: [{ id: FAIR, name: 'Fair' }, { id: IR, name: 'IR' }], handled: [FAIR], ticks },
  })

  beforeEach(() => {
    vi.clearAllMocks()
    mocks.setPersonTabs.mockResolvedValue({ ok: true })
  })

  it('ticks what he handles, on both CRM rows, and only where the row is viewed', () => {
    render(<PersonAccess access={kris()} canEdit />)
    expect(box('CRM · Team · Fair')).toHaveAttribute('aria-checked', 'true')
    expect(box('CRM · Team · IR')).toHaveAttribute('aria-checked', 'false')
    expect(box('Profile · My leads & appointments · IR')).toHaveAttribute('aria-checked', 'false')
    // Quote is not a sub-department row; Comm Cal is, but its View is not ticked on this template.
    expect(screen.queryByRole('checkbox', { name: 'Quote · Fair' })).toBeNull()
    expect(screen.queryByRole('group', { name: 'Today · sub-departments' })).toBeNull()
  })

  it('opens IR’s CRM for him alone — one area, both rows, a red dot — and saves it with the boxes', async () => {
    render(<PersonAccess access={kris()} canEdit />)
    fireEvent.click(box('CRM · Team · IR'))
    expect(box('CRM · Team · IR')).toHaveAttribute('aria-checked', 'true')
    expect(box('Profile · My leads & appointments · IR')).toHaveAttribute('aria-checked', 'true')
    expect(screen.getAllByLabelText('changed for this person')).toHaveLength(2)
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Save' })))
    expect(mocks.setPersonTabs).toHaveBeenCalledWith({ userId: USER, templateId: 't', sensitive: [], boxes: [], reach: [{ area: 'crm', sub: IR, granted: true }] })
  })

  it('Reset to title takes his own sub-departments away too', async () => {
    render(<PersonAccess access={kris([{ area: 'crm', sub: IR, granted: true }])} canEdit />)
    expect(box('CRM · Team · IR')).toHaveAttribute('aria-checked', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'Reset to title' }))
    expect(box('CRM · Team · IR')).toHaveAttribute('aria-checked', 'false')
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Save' })))
    expect(mocks.setPersonTabs).toHaveBeenCalledWith({ userId: USER, templateId: 't', sensitive: [], boxes: [], reach: [] })
  })

  it('is read-only without accounts.manage', () => {
    render(<PersonAccess access={kris()} canEdit={false} />)
    expect(box('CRM · Team · IR')).toBeDisabled()
  })
})

// A person's own Salary / NRIC / Bank (2026-10-16 — the owner: "Edit Permission 的优先级是高于 Title 和 Template 的"):
// three pills above the matrix, ticked where they see it, the red dot where it is theirs alone.
describe('a person’s own sensitive fields', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.setPersonTabs.mockResolvedValue({ ok: true })
  })

  it('shows the template’s, and gives Salary to one person — saved with the boxes', async () => {
    render(<PersonAccess access={access()} canEdit />)
    expect(box('Sensitive fields · Salary amounts')).toHaveAttribute('aria-checked', 'false')
    fireEvent.click(box('Sensitive fields · Salary amounts'))
    expect(box('Sensitive fields · Salary amounts')).toHaveAttribute('aria-checked', 'true')
    expect(screen.getAllByLabelText('changed for this person')).toHaveLength(1)
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Save' })))
    expect(mocks.setPersonTabs).toHaveBeenCalledWith({ userId: USER, templateId: 't', sensitive: [{ field: 'salary', granted: true }], boxes: [] })
  })

  it('their own tick is drawn over the template’s, and Reset to title takes it away', async () => {
    render(<PersonAccess access={access({ ownSensitive: [{ field: 'bank', granted: true }] })} canEdit />)
    expect(box('Sensitive fields · Bank accounts')).toHaveAttribute('aria-checked', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'Reset to title' }))
    expect(box('Sensitive fields · Bank accounts')).toHaveAttribute('aria-checked', 'false')
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Save' })))
    expect(mocks.setPersonTabs).toHaveBeenCalledWith({ userId: USER, templateId: 't', sensitive: [], boxes: [] })
  })

  it('is read-only without accounts.manage', () => {
    render(<PersonAccess access={access()} canEdit={false} />)
    expect(box('Sensitive fields · NRIC / IC')).toBeDisabled()
  })
})

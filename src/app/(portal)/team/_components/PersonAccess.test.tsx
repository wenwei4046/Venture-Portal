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
  template: { id: 't', name: 'Revenue Team', baseRole: 'revenue_member', grants: { revenue_app: { view: 'own', create: 'own' } }, sensitive: [], tabs: null, review: false },
  cells: {},
  boxes: [],
  legacy: [],
  reach: null,
  ownSensitive: [],
  ownReview: null,
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
    // 16 Revenue app tabs since the rest of Profile got its boxes (2026-10-11), 17 with IT requests (2026-10-20), 20 with
    // Free test, Library and their writers' tab (2026-11-16), 21 with Insight · Commission ratio (2026-11-27, a Revenue
    // Director's — not the Revenue Team's); the Revenue Team sees 15 (the two Profile pages are theirs).
    expect(screen.getByRole('tab', { name: /Revenue app/ })).toHaveTextContent('15/21')
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
    // Every Create box of the view is ticked on the title but Free test & Library's (2026-11-16, its writers'): the first
    // click ticks that one too (its View with it), the second unticks the column.
    expect(box('Select all · Create')).toHaveAttribute('aria-checked', 'mixed')
    fireEvent.click(box('Select all · Create'))
    expect(box('Select all · Create')).toHaveAttribute('aria-checked', 'true')
    fireEvent.click(box('Select all · Create'))
    expect(box('Quote · Create')).toHaveAttribute('aria-checked', 'false')
    expect(box('Select all · Create')).toHaveAttribute('aria-checked', 'false')
    expect(screen.getAllByLabelText('changed for this person')).toHaveLength(5)
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Save' })))
    const sent = mocks.setPersonTabs.mock.calls.at(-1)?.[0] as { boxes: { tab: string; action: string; granted: boolean }[] }
    expect(sent).toMatchObject({ userId: USER, templateId: 't', sensitive: [] })
    expect([...sent.boxes].sort((a, b) => `${a.tab}.${a.action}`.localeCompare(`${b.tab}.${b.action}`))).toEqual([
      ...['rev.quote', 'rev.requests', 'rev.rooms', 'rev.track'].map(tab => ({ tab, action: 'create', granted: false })),
      { tab: 'rev.training', action: 'view', granted: true },
    ].sort((a, b) => `${a.tab}.${a.action}`.localeCompare(`${b.tab}.${b.action}`)))
  })

  it('counts the tabs they see for the tab badge', () => {
    expect(accessCount(access())).toBe(15)
    expect(accessCount(access({ boxes: [{ tab: 'rev.today', action: 'view', granted: false }] }))).toBe(14)
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
      tabs: ['rev.today.view', 'rev.leads.view', 'rev.leads.edit', 'rev.crm_team.view'], review: false,
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

// The CRM's brands (2026-11-17 — the owner: "只有 dc 权限的人可以看到 dc 的客户资讯，ads performance 等", "按人打勾"):
// under the CRM's two rows, The Conts and Dream Crafter, both ticked until one is taken off for this person.
describe('a person’s CRM brands', () => {
  const crmTeam = (crmBrands: Array<{ brand: 'conts' | 'dc'; granted: boolean }> | null = []) => access({
    template: {
      id: 't', name: 'Revenue Team', baseRole: 'revenue_member', grants: { revenue_app: { view: 'own' } }, sensitive: [],
      tabs: ['rev.today.view', 'rev.leads.view', 'rev.leads.edit'], review: false,
    },
    crmBrands,
  })

  beforeEach(() => {
    vi.clearAllMocks()
    mocks.setPersonTabs.mockResolvedValue({ ok: true })
  })

  it('ticks both brands under the CRM row they view, none elsewhere', () => {
    render(<PersonAccess access={crmTeam()} canEdit />)
    expect(box('Profile · My leads & appointments · The Conts')).toHaveAttribute('aria-checked', 'true')
    expect(box('Profile · My leads & appointments · Dream Crafter')).toHaveAttribute('aria-checked', 'true')
    expect(screen.queryByRole('checkbox', { name: 'CRM · Team · Dream Crafter' })).toBeNull() // its View is not ticked
    expect(screen.queryByRole('group', { name: 'Today · brands' })).toBeNull()
  })

  it('takes Dream Crafter off for him alone, with a red dot, and saves it with the boxes', async () => {
    render(<PersonAccess access={crmTeam()} canEdit />)
    fireEvent.click(box('Profile · My leads & appointments · Dream Crafter'))
    expect(box('Profile · My leads & appointments · Dream Crafter')).toHaveAttribute('aria-checked', 'false')
    expect(screen.getByLabelText('changed for this person')).toBeInTheDocument()
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Save' })))
    expect(mocks.setPersonTabs).toHaveBeenCalledWith({ userId: USER, templateId: 't', sensitive: [], boxes: [], brands: [{ brand: 'dc', granted: false }] })
  })

  it('Reset to title gives him every brand again', async () => {
    render(<PersonAccess access={crmTeam([{ brand: 'conts', granted: false }])} canEdit />)
    expect(box('Profile · My leads & appointments · The Conts')).toHaveAttribute('aria-checked', 'false')
    fireEvent.click(screen.getByRole('button', { name: 'Reset to title' }))
    expect(box('Profile · My leads & appointments · The Conts')).toHaveAttribute('aria-checked', 'true')
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Save' })))
    expect(mocks.setPersonTabs).toHaveBeenCalledWith({ userId: USER, templateId: 't', sensitive: [], boxes: [], brands: [] })
  })

  it('shows no brands when they could not be read', () => {
    render(<PersonAccess access={crmTeam(null)} canEdit />)
    expect(screen.queryByRole('group', { name: 'Profile · My leads & appointments · brands' })).toBeNull()
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

// 2026-10-29 (the claim process's PR ③ — the mockup's "Claim ☑ By management approve"): under the Claim row, their
// requests go to their department's Claim & approve first; the person's own tick over their title's.
describe('a person’s own By management approve', () => {
  const marketing = (over: Partial<Extract<PersonAccessData, { kind: 'template' }>> = {}) =>
    access({
      titleName: 'CONTENT CREATOR',
      template: {
        id: 't', name: 'Marketing · Staff', baseRole: 'staff', grants: { claims: { view: 'own', create: 'own' } }, sensitive: [],
        tabs: ['mkt.my_claims.view', 'mkt.my_claims.create'], review: true,
      },
      ownReview: null,
      functions: [fn('claims', 'Claims', 'view create', 'own dept all')],
      cellKeys: [K('claims', 'view', 'claims'), K('claims', 'create', 'claims')],
      ...over,
    })

  beforeEach(() => {
    vi.clearAllMocks()
    mocks.setPersonTabs.mockResolvedValue({ ok: true })
  })

  it('shows the title’s tick under Claim, and takes it off for one person — saved with the boxes', async () => {
    render(<PersonAccess access={marketing()} canEdit />)
    expect(screen.getByRole('tab', { name: /Marketing view/ })).toHaveAttribute('aria-selected', 'true')
    expect(box('Claim · By management approve')).toHaveAttribute('aria-checked', 'true')
    fireEvent.click(box('Claim · By management approve'))
    expect(box('Claim · By management approve')).toHaveAttribute('aria-checked', 'false')
    expect(screen.getAllByLabelText('changed for this person')).toHaveLength(1)
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Save' })))
    expect(mocks.setPersonTabs).toHaveBeenCalledWith({ userId: USER, templateId: 't', sensitive: [], boxes: [], review: false })
  })

  it('their own tick is drawn over the title’s; Reset to title gives them the title’s again', async () => {
    render(<PersonAccess access={marketing({ ownReview: false })} canEdit />)
    expect(box('Claim · By management approve')).toHaveAttribute('aria-checked', 'false')
    fireEvent.click(screen.getByRole('button', { name: 'Reset to title' }))
    expect(box('Claim · By management approve')).toHaveAttribute('aria-checked', 'true')
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Save' })))
    expect(mocks.setPersonTabs).toHaveBeenCalledWith({ userId: USER, templateId: 't', sensitive: [], boxes: [], review: null })
  })

  it('an untouched tick is not sent', async () => {
    render(<PersonAccess access={marketing()} canEdit />)
    fireEvent.click(box('Sensitive fields · Salary amounts'))
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Save' })))
    expect(mocks.setPersonTabs.mock.calls[0][0]).not.toHaveProperty('review')
  })
})

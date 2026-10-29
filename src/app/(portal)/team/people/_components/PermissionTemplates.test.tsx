import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { PermissionsData } from '../../_lib/permission-templates'
import type { PermFunction } from '@/lib/permission-matrix'

const mocks = vi.hoisted(() => ({
  saveTemplateTabs: vi.fn(),
  createTemplate: vi.fn(),
  deleteTemplate: vi.fn(),
  setTitleTemplate: vi.fn(),
  loadPermissionHistory: vi.fn(),
  refresh: vi.fn(),
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mocks.refresh, push: vi.fn() }) }))
vi.mock('../permission-actions', () => ({
  saveTemplateTabs: mocks.saveTemplateTabs,
  createTemplate: mocks.createTemplate,
  deleteTemplate: mocks.deleteTemplate,
  setTitleTemplate: mocks.setTitleTemplate,
  loadPermissionHistory: mocks.loadPermissionHistory,
}))

import PermissionTemplates from './PermissionTemplates'

const fn = (key: string, label: string, section: string, actions: string, scopes: string): PermFunction => ({
  key, label, section, actions: actions.split(' ') as PermFunction['actions'], scopes: scopes.split(' ') as PermFunction['scopes'], description: null,
})
const HR = '00000000-0000-4000-8000-000000000001'
const STAFF = '00000000-0000-4000-8000-000000000002'
const SITI = '00000000-0000-4000-8000-000000000003'

function data(): PermissionsData {
  return {
    functions: [
      fn('dashboard', 'Overview', 'Daily', 'view', 'all'),
      fn('hr_costing', 'HR Costing', 'People', 'view create edit approve export', 'own dept all'),
      fn('claims', 'Claims', 'Departments', 'view create edit approve void', 'own dept all'),
    ],
    cellKeys: [
      { functionKey: 'dashboard', action: 'view', legacyKey: 'dashboard', minScope: 'own', gate: null },
      { functionKey: 'hr_costing', action: 'view', legacyKey: 'hr_costing', minScope: 'all', gate: 'salary' },
      { functionKey: 'claims', action: 'view', legacyKey: 'claims', minScope: 'own', gate: null },
    ],
    templates: [
      {
        // No ticks stored yet: drawn from its cells.
        id: HR, key: 'hr', name: 'HR · Payroll', description: 'Runs the roster and payroll.', baseRole: 'hr', version: 3,
        grants: { dashboard: { view: 'all' }, hr_costing: { view: 'all', create: 'all', edit: 'all', export: 'all' } },
        sensitive: ['salary'], tabs: null,
      },
      {
        id: STAFF, key: 'staff', name: 'Staff · Basic', description: null, baseRole: 'staff', version: 1,
        grants: { dashboard: { view: 'all' }, claims: { view: 'own', create: 'own' } }, sensitive: [],
        tabs: ['dept.overview.view', 'dept.my_claims.view', 'dept.my_claims.create'],
      },
    ],
    titles: [
      { id: 't-hr', name: 'HR EXECUTIVE', departmentId: 'd', departmentName: 'HR', levelRank: 4, isActive: true, isDepartmentHead: false, templateId: HR, people: 2 },
      { id: 't-ae', name: 'ACCOUNTS EXECUTIVE', departmentId: 'f', departmentName: 'Finance', levelRank: 3, isActive: true, isDepartmentHead: false, templateId: null, people: 3 },
    ],
    logins: [
      { userId: SITI, staffId: 's-siti', name: 'SITI RAHMAH', email: 'siti@x.my', titleId: 't-hr', cells: {}, legacy: [],
        boxes: [{ tab: 'hr.payment', action: 'edit', granted: false }] },
    ],
  }
}

const renderTab = (overrides: Partial<Parameters<typeof PermissionTemplates>[0]> = {}) => {
  const onNotice = vi.fn()
  render(<PermissionTemplates data={data()} canManage canSeeHistory initialTemplateId={HR} onNotice={onNotice} {...overrides} />)
  return { onNotice }
}
const box = (name: string) => screen.getByRole('checkbox', { name })

describe('People Management › Permissions, by view and tab (HR revamp 8)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.saveTemplateTabs.mockResolvedValue({ ok: true, version: 4, titles: 1 })
    mocks.setTitleTemplate.mockResolvedValue({ ok: true })
    mocks.createTemplate.mockResolvedValue({ ok: true, id: '00000000-0000-4000-8000-000000000009' })
    mocks.deleteTemplate.mockResolvedValue({ ok: true })
  })

  it('draws the handoff’s tab: the template picked, the views with their counts, a view’s tabs and four boxes', () => {
    renderTab()
    expect(screen.getByLabelText('Title template')).toHaveValue(HR)
    expect(screen.getByText('2 templates')).toBeInTheDocument()
    // No lede over the matrix and no standing foot note (2026-10-12: the wording made the view messy).
    expect(screen.queryByText(/gets these, unless their own Permissions tab overrides one/)).toBeNull()
    expect(screen.queryByText(/Applies to everyone holding/)).toBeNull()
    // A template with no ticks stored is drawn from its cells: Overview, HR Costing's three pages, Audit Log (Changes).
    expect(screen.getByRole('tab', { name: /HR view/ })).toHaveAttribute('aria-selected', 'true')
    // Of the HR view's 29 tabs (round 2 added Documentation, Hiring ×3, Meeting Rooms, Guest Link; Attendance its seven, 2026-10-15;
    // Claim, 2026-10-29; Claim & approve, PR ③).
    expect(screen.getByRole('tab', { name: /HR view/ })).toHaveTextContent('5/29')
    expect(box('Payroll · View')).toHaveAttribute('aria-checked', 'true')
    expect(box('Payroll · Approve')).toHaveAttribute('aria-checked', 'false')
    expect(box('Overview · Create')).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
    expect(screen.getByText('SR · 1')).toBeInTheDocument()
    expect(screen.getByText('Titles with no template yet')).toBeInTheDocument()
  })

  it('ticks a box (View comes with it), and saves the ticks', async () => {
    const { onNotice } = renderTab()
    fireEvent.click(screen.getByRole('tab', { name: /Department view/ }))
    fireEvent.click(box('Claim · Create'))
    expect(box('Claim · View')).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByText('Unsaved changes to HR · Payroll')).toBeInTheDocument()
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Save' })))
    expect(mocks.saveTemplateTabs).toHaveBeenCalledWith(expect.objectContaining({
      templateId: HR, version: 3, sensitive: ['salary'],
      tabs: expect.arrayContaining(['hr.payroll.view', 'dept.my_claims.view', 'dept.my_claims.create']),
    }))
    expect(onNotice).toHaveBeenCalledWith('HR · Payroll saved — applies to 1 title at once.')
    expect(mocks.refresh).toHaveBeenCalled()
  })

  it('the row’s “all” ticks every box the tab has, then none', () => {
    renderTab()
    const payrollRow = box('Payroll · View').closest('[role="row"]') as HTMLElement
    fireEvent.click(within(payrollRow).getByRole('button', { name: 'all' }))
    expect(box('Payroll · Approve')).toHaveAttribute('aria-checked', 'true')
    fireEvent.click(within(payrollRow).getByRole('button', { name: 'none' }))
    expect(box('Payroll · View')).toHaveAttribute('aria-checked', 'false')
  })

  it('opens a template on the ticks it stored', () => {
    renderTab({ initialTemplateId: STAFF })
    expect(screen.getByRole('tab', { name: /Department view/ })).toHaveAttribute('aria-selected', 'true')
    expect(box('Claim · Create')).toHaveAttribute('aria-checked', 'true')
    expect(box('Claim · Edit')).toHaveAttribute('aria-checked', 'false')
  })

  it('says what the database refused', async () => {
    mocks.saveTemplateTabs.mockResolvedValue({ ok: false, reason: 'HR · Payroll was changed by somebody else since you opened it. Reload and try again' })
    renderTab()
    fireEvent.click(box('Payment · Approve'))
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Save' })))
    expect(screen.getByRole('alert')).toHaveTextContent('changed by somebody else')
  })

  it('+ New template opens a window: its name, the views it can see and its sensitive fields', async () => {
    const { onNotice } = renderTab()
    fireEvent.click(screen.getByRole('button', { name: '+ New template' }))
    const win = within(screen.getByRole('dialog', { name: 'New template' }))
    // Nothing filled in yet: it says what is missing and sends nothing.
    await act(async () => fireEvent.click(win.getByRole('button', { name: 'Create template' })))
    expect(win.getByText('Give it a name')).toBeInTheDocument()
    expect(win.getByText('Pick at least one')).toBeInTheDocument()
    fireEvent.change(win.getByPlaceholderText('e.g. Area Manager'), { target: { value: 'hr · payroll' } })
    expect(win.getByText('There is already a template called that')).toBeInTheDocument()
    fireEvent.change(win.getByPlaceholderText('e.g. Area Manager'), { target: { value: 'Area Manager' } })
    // Each view with how many tabs it has.
    expect(win.getByText('Department view').closest('label')).toHaveTextContent('Department view4 tabs')
    fireEvent.click(win.getByRole('checkbox', { name: /Department view/ }))
    fireEvent.click(win.getByRole('checkbox', { name: /Salary amounts/ }))
    expect(win.getByText('Its holders sign in to the portal.')).toBeInTheDocument()
    await act(async () => fireEvent.click(win.getByRole('button', { name: 'Create template' })))
    expect(mocks.createTemplate).toHaveBeenCalledWith({ name: 'Area Manager', views: ['dept'], sensitive: ['salary'] })
    expect(onNotice).toHaveBeenCalledWith(
      'Area Manager created — View ticked on every tab of Department view. Tick Create, Edit and Approve where they need them, then point titles at it below.')
    expect(mocks.refresh).toHaveBeenCalled()
    expect(screen.queryByRole('dialog', { name: 'New template' })).toBeNull()
  })

  it('the window says which of those tabs would not open yet, and that the Revenue app alone is an app account', async () => {
    renderTab()
    fireEvent.click(screen.getByRole('button', { name: '+ New template' }))
    const win = within(screen.getByRole('dialog', { name: 'New template' }))
    fireEvent.click(win.getByRole('checkbox', { name: /HR view/ }))
    // HR Costing's pages show pay: without Salary amounts they stay shut.
    const pay = win.getByText(/HR Costing, Payroll, Payment/).closest('div') as HTMLElement
    expect(pay).toHaveTextContent('Not open yet — it shows pay: tick Salary amounts')
    fireEvent.click(win.getByRole('checkbox', { name: /Salary amounts/ }))
    expect(win.queryByText(/HR Costing, Payroll, Payment/)).toBeNull()
    fireEvent.click(win.getByRole('checkbox', { name: /HR view/ }))
    fireEvent.click(win.getByRole('checkbox', { name: /Revenue app/ }))
    expect(win.getByText('Only the Revenue app: its holders sign in to the Revenue app.')).toBeInTheDocument()
    mocks.createTemplate.mockResolvedValue({ ok: false, reason: 'There is already a template called Fair Junior' })
    fireEvent.change(win.getByPlaceholderText('e.g. Area Manager'), { target: { value: 'Fair Junior' } })
    await act(async () => fireEvent.click(win.getByRole('button', { name: 'Create template' })))
    expect(mocks.createTemplate).toHaveBeenCalledWith({ name: 'Fair Junior', views: ['rev'], sensitive: ['salary'] })
    expect(win.getByRole('alert')).toHaveTextContent('There is already a template called Fair Junior')
  })

  it('Select all ticks a whole column of the view, then every box, then none', () => {
    renderTab()
    expect(box('Select all · Approve')).toHaveAttribute('aria-checked', 'false')
    // HR · Payroll holds some Views of the HR view, not all: "–".
    expect(box('Select all · View')).toHaveAttribute('aria-checked', 'mixed')
    expect(box('Select all · View')).toHaveTextContent('–')
    fireEvent.click(box('Select all · Approve'))
    expect(box('Payroll · Approve')).toHaveAttribute('aria-checked', 'true')
    expect(box('Hiring requests · Approve')).toHaveAttribute('aria-checked', 'true')
    // Approve brings each tab's View with it.
    expect(box('Hiring requests · View')).toHaveAttribute('aria-checked', 'true')
    expect(box('Select all · Approve')).toHaveAttribute('aria-checked', 'true')
    fireEvent.click(box('Select all · Approve'))
    expect(box('Payroll · Approve')).toHaveAttribute('aria-checked', 'false')
    expect(box('Hiring requests · View')).toHaveAttribute('aria-checked', 'true')
    fireEvent.click(box('Select all · every box in HR view'))
    expect(box('Director Pool · Edit')).toHaveAttribute('aria-checked', 'true')
    expect(box('Select all · every box in HR view')).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('tab', { name: /HR view/ })).toHaveTextContent('29/29')
    fireEvent.click(box('Select all · every box in HR view'))
    expect(screen.getByRole('tab', { name: /HR view/ })).toHaveTextContent('0/29')
    expect(screen.getByText('Unsaved changes to HR · Payroll')).toBeInTheDocument()
  })

  it('a ticked tab whose page would not open says why under its name', () => {
    renderTab()
    const payroll = () => box('Payroll · View').closest('[role="row"]') as HTMLElement
    expect(within(payroll()).queryByText(/Not open yet/)).toBeNull()
    // Without Salary amounts HR's pay pages stay shut, whatever is ticked.
    fireEvent.click(screen.getByRole('checkbox', { name: /Salary amounts/ }))
    expect(within(payroll()).getByText('Not open yet — it shows pay: tick Salary amounts')).toBeInTheDocument()
  })

  it('Delete asks first, and a template on a title says to move it', async () => {
    renderTab({ initialTemplateId: STAFF })
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    expect(screen.getByText('Delete Staff · Basic?')).toBeInTheDocument()
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Delete' })))
    expect(mocks.deleteTemplate).toHaveBeenCalledWith({ templateId: STAFF, version: 1 })
    cleanupAndRender()
  })

  it('moves a title onto a template from its select, at once', async () => {
    const { onNotice } = renderTab()
    await act(async () => fireEvent.change(screen.getByLabelText('Template for ACCOUNTS EXECUTIVE'), { target: { value: STAFF } }))
    expect(mocks.setTitleTemplate).toHaveBeenCalledWith('t-ae', STAFF)
    await waitFor(() => expect(onNotice).toHaveBeenCalledWith('ACCOUNTS EXECUTIVE now follows Staff · Basic.'))
  })

  it('is read-only without accounts.manage', () => {
    renderTab({ canManage: false })
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull()
    expect(screen.queryByRole('button', { name: '+ New template' })).toBeNull()
    expect(screen.queryByRole('checkbox', { name: 'Select all · View' })).toBeNull()
    expect(box('Payroll · View')).toBeDisabled()
    expect(screen.getByLabelText('Template for HR EXECUTIVE')).toBeDisabled()
  })

  // 2026-10-29 (the claim process's PR ③): By management approve, ticked once for a title — under its Claim row.
  it('ticks By management approve for every holder of a template, saved with its boxes', async () => {
    mocks.saveTemplateTabs.mockResolvedValue({ ok: true, version: 3, titles: 0 })
    renderTab({ initialTemplateId: STAFF })
    expect(screen.getByRole('tab', { name: /Department view/ })).toHaveAttribute('aria-selected', 'true')
    expect(box('Claim · By management approve')).toHaveAttribute('aria-checked', 'false')
    fireEvent.click(box('Claim · By management approve'))
    expect(box('Claim · By management approve')).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByText('Unsaved changes to Staff · Basic')).toBeInTheDocument()
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Save' })))
    expect(mocks.saveTemplateTabs).toHaveBeenCalledWith(expect.objectContaining({ templateId: STAFF, version: 1, review: true }))
  })
})

/** A template on titles: Delete only says to move them, and offers no Delete. */
function cleanupAndRender() {
  // (kept in the previous test's tree) — HR · Payroll is on a title.
  fireEvent.change(screen.getByLabelText('Title template'), { target: { value: HR } })
  fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
  expect(screen.getByText(/HR · Payroll is on 1 title \(2 people\) — move it to another template first\./)).toBeInTheDocument()
  expect(screen.queryAllByRole('button', { name: 'Delete' })).toHaveLength(0)
}

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { PermissionsData } from '../../_lib/permission-templates'
import type { PermFunction } from '@/lib/permission-matrix'

const mocks = vi.hoisted(() => ({
  saveTemplateTabs: vi.fn(),
  copyTemplate: vi.fn(),
  deleteTemplate: vi.fn(),
  setTitleTemplate: vi.fn(),
  loadPermissionHistory: vi.fn(),
  refresh: vi.fn(),
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mocks.refresh, push: vi.fn() }) }))
vi.mock('../permission-actions', () => ({
  saveTemplateTabs: mocks.saveTemplateTabs,
  copyTemplate: mocks.copyTemplate,
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
    mocks.copyTemplate.mockResolvedValue({ ok: true, id: '00000000-0000-4000-8000-000000000009' })
    mocks.deleteTemplate.mockResolvedValue({ ok: true })
  })

  it('draws the handoff’s tab: the template picked, the views with their counts, a view’s tabs and four boxes', () => {
    renderTab()
    expect(screen.getByLabelText('Title template')).toHaveValue(HR)
    expect(screen.getByText('2 templates')).toBeInTheDocument()
    expect(screen.getByText(/gets these, unless their own Permissions tab overrides one/)).toHaveTextContent('Everyone holding HR · Payroll gets these, unless their own Permissions tab overrides one.')
    // A template with no ticks stored is drawn from its cells: Overview, HR Costing's three pages, Audit Log (Changes).
    expect(screen.getByRole('tab', { name: /HR view/ })).toHaveAttribute('aria-selected', 'true')
    // Of the HR view's 20 tabs (round 2 added Documentation, Hiring ×3, Meeting Rooms, Guest Link).
    expect(screen.getByRole('tab', { name: /HR view/ })).toHaveTextContent('5/20')
    expect(box('Payroll · View')).toHaveAttribute('aria-checked', 'true')
    expect(box('Payroll · Approve')).toHaveAttribute('aria-checked', 'false')
    expect(box('Overview · Create')).toBeDisabled()
    expect(screen.getByText('Applies to everyone holding HR · Payroll')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
    expect(screen.getByText('SR · 1')).toBeInTheDocument()
    expect(screen.getByText('Titles with no template yet')).toBeInTheDocument()
  })

  it('ticks a box (View comes with it), and saves the ticks', async () => {
    const { onNotice } = renderTab()
    fireEvent.click(screen.getByRole('tab', { name: /Department view/ }))
    fireEvent.click(box('My claims · Create'))
    expect(box('My claims · View')).toHaveAttribute('aria-checked', 'true')
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
    expect(box('My claims · Create')).toHaveAttribute('aria-checked', 'true')
    expect(box('My claims · Edit')).toHaveAttribute('aria-checked', 'false')
  })

  it('says what the database refused', async () => {
    mocks.saveTemplateTabs.mockResolvedValue({ ok: false, reason: 'HR · Payroll was changed by somebody else since you opened it. Reload and try again' })
    renderTab()
    fireEvent.click(box('Payment · Approve'))
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Save' })))
    expect(screen.getByRole('alert')).toHaveTextContent('changed by somebody else')
  })

  it('+ New template copies the one open', async () => {
    const { onNotice } = renderTab()
    fireEvent.click(screen.getByRole('button', { name: '+ New template' }))
    expect(screen.getByText('copies HR · Payroll')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText("New template's name"), { target: { value: 'Area Manager' } })
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Create' })))
    expect(mocks.copyTemplate).toHaveBeenCalledWith({ name: 'Area Manager', from: HR })
    expect(onNotice).toHaveBeenCalledWith('Area Manager created as a copy of HR · Payroll. Point titles at it below.')
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
    expect(box('Payroll · View')).toBeDisabled()
    expect(screen.getByLabelText('Template for HR EXECUTIVE')).toBeDisabled()
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

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { PermissionsData } from '../../_lib/permission-templates'
import type { PermFunction } from '@/lib/permission-matrix'

const mocks = vi.hoisted(() => ({
  saveTemplate: vi.fn(),
  createTemplate: vi.fn(),
  setTitleTemplate: vi.fn(),
  loadPermissionHistory: vi.fn(),
  refresh: vi.fn(),
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mocks.refresh, push: vi.fn() }) }))
vi.mock('../permission-actions', () => ({
  saveTemplate: mocks.saveTemplate,
  createTemplate: mocks.createTemplate,
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
        id: HR, key: 'hr', name: 'HR · Payroll', description: 'Runs the roster and payroll.', baseRole: 'hr', version: 3,
        grants: { dashboard: { view: 'all' }, hr_costing: { view: 'all', create: 'all', edit: 'all', export: 'all' } },
        sensitive: ['salary'],
      },
      { id: STAFF, key: 'staff', name: 'Staff · Basic', description: null, baseRole: 'staff', version: 1, grants: { dashboard: { view: 'all' } }, sensitive: [] },
    ],
    titles: [
      { id: 't-hr', name: 'HR EXECUTIVE', departmentId: 'd', departmentName: 'HR', levelRank: 4, isActive: true, isDepartmentHead: false, templateId: HR, people: 2 },
      { id: 't-ae', name: 'ACCOUNTS EXECUTIVE', departmentId: 'f', departmentName: 'Finance', levelRank: 3, isActive: true, isDepartmentHead: false, templateId: null, people: 3 },
    ],
    logins: [
      { userId: SITI, staffId: 's-siti', name: 'SITI RAHMAH', email: 'siti@x.my', titleId: 't-hr', cells: { 'hr_costing.export': 'none' }, legacy: [] },
    ],
  }
}

const renderTab = (overrides: Partial<Parameters<typeof PermissionTemplates>[0]> = {}) => {
  const onNotice = vi.fn()
  render(
    <PermissionTemplates data={data()} canManage canSeeHistory initialTemplateId={HR} onNotice={onNotice} {...overrides} />,
  )
  return { onNotice }
}

describe('People Management › Permissions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.saveTemplate.mockResolvedValue({ ok: true, version: 4, titles: 1 })
    mocks.setTitleTemplate.mockResolvedValue({ ok: true })
  })

  it('draws the selected template as the design does: key, cells, personal exceptions, the title with none', () => {
    renderTab()
    expect(screen.getByText('Template · hr')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'HR Costing · Export: All' })).toBeInTheDocument()
    expect(screen.getByText('SR hr_costing.export:✕')).toBeInTheDocument()
    expect(screen.getByText('Titles with no template yet')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Saved' })).toBeDisabled()
  })

  it('saves straight away when nobody has their own value on what changed', async () => {
    const { onNotice } = renderTab()
    fireEvent.click(screen.getByRole('button', { name: 'Claims · View: not granted' }))
    expect(screen.getByRole('button', { name: 'Claims · View: Own' })).toBeInTheDocument()
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Save template' })))
    expect(mocks.saveTemplate).toHaveBeenCalledWith(expect.objectContaining({
      templateId: HR, version: 3, reset: [],
      grants: expect.arrayContaining([{ function_key: 'claims', action: 'view', scope: 'own' }]),
    }))
    expect(onNotice).toHaveBeenCalledWith('HR · Payroll saved — applies to 1 title at once.')
    expect(mocks.refresh).toHaveBeenCalled()
  })

  it('asks, person by person, before a save touches a cell somebody set for themselves', async () => {
    renderTab()
    // Export: All → · (the cycle wraps), the cell SITI is held back on.
    fireEvent.click(screen.getByRole('button', { name: 'HR Costing · Export: All' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save template' }))
    const dialog = screen.getByRole('dialog', { name: 'People with their own permissions' })
    expect(within(dialog).getByText('SITI RAHMAH')).toBeInTheDocument()
    expect(mocks.saveTemplate).not.toHaveBeenCalled()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Reset' }))
    await act(async () => fireEvent.click(within(dialog).getByRole('button', { name: 'Save template' })))
    expect(mocks.saveTemplate).toHaveBeenCalledWith(expect.objectContaining({
      reset: [{ userId: SITI, functionKey: 'hr_costing', action: 'export' }],
    }))
  })

  it('keeping theirs saves the template and leaves their cell alone', async () => {
    renderTab()
    fireEvent.click(screen.getByRole('button', { name: 'HR Costing · Export: All' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save template' }))
    const dialog = screen.getByRole('dialog', { name: 'People with their own permissions' })
    await act(async () => fireEvent.click(within(dialog).getByRole('button', { name: 'Save template' })))
    expect(mocks.saveTemplate).toHaveBeenCalledWith(expect.objectContaining({ reset: [] }))
  })

  it('says what the database refused', async () => {
    mocks.saveTemplate.mockResolvedValue({ ok: false, reason: 'HR · Payroll was changed by somebody else since you opened it. Reload and try again' })
    renderTab()
    fireEvent.click(screen.getByRole('button', { name: 'Claims · View: not granted' }))
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Save template' })))
    expect(screen.getByText(/changed by somebody else/)).toBeInTheDocument()
  })

  it('moves a title onto a template from its select, at once', async () => {
    const { onNotice } = renderTab()
    await act(async () =>
      fireEvent.change(screen.getByLabelText('Template for ACCOUNTS EXECUTIVE'), { target: { value: STAFF } }),
    )
    expect(mocks.setTitleTemplate).toHaveBeenCalledWith('t-ae', STAFF)
    await waitFor(() => expect(onNotice).toHaveBeenCalledWith('ACCOUNTS EXECUTIVE now follows Staff · Basic.'))
  })

  it('is read-only without accounts.manage', () => {
    renderTab({ canManage: false })
    expect(screen.queryByRole('button', { name: /Save template|Saved/ })).toBeNull()
    expect(screen.queryByRole('button', { name: '+ New template' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'HR Costing · Export: All' })).toBeNull()
    expect(screen.getByLabelText('Template for HR EXECUTIVE')).toBeDisabled()
  })

  it('names a cell that is saved but not in force yet, and why', () => {
    renderTab({ initialTemplateId: STAFF })
    fireEvent.click(screen.getByRole('button', { name: 'HR Costing · View: not granted' }))
    fireEvent.click(screen.getByRole('button', { name: 'Why' }))
    expect(screen.getByText(/Own is not enforced on this yet/)).toBeInTheDocument()
  })
})

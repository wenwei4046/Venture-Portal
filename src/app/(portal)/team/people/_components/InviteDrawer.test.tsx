import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import type { PermFunction } from '@/lib/permission-matrix'

const mocks = vi.hoisted(() => ({ inviteUser: vi.fn() }))
vi.mock('../invite-actions', () => ({ inviteUser: mocks.inviteUser }))

import InviteDrawer, { type InviteCandidate } from './InviteDrawer'

const ONG = '5f0c2a8e-1b2c-4d3e-8f4a-0b1c2d3e4f5a'
const fn = (key: string, label: string, actions: string, scopes: string): PermFunction => ({
  key, label, section: 'Daily', actions: actions.split(' ') as PermFunction['actions'], scopes: scopes.split(' ') as PermFunction['scopes'], description: null,
})
const candidates: InviteCandidate[] = [
  { staffId: ONG, name: 'ONG SIEW LAN', code: 'HV011', department: 'Finance', title: 'SENIOR ACCOUNT EXECUTIVE', levelRank: 4, templateId: 'maker', reportsTo: 'TAN MEI LING · ASSISTANT FINANCE MANAGER' },
  { staffId: 'x-1', name: 'NO TEMPLATE', code: 'HV069', department: 'Finance', title: 'ACCOUNTS EXECUTIVE', levelRank: 3, templateId: null, reportsTo: null },
]
const templates = [{
  id: 'maker', key: 'fin_maker', name: 'Finance · Maker', description: null, baseRole: 'finance', version: 1, sensitive: [],
  grants: { dashboard: { view: 'all' as const }, treasury: { view: 'all' as const, create: 'all' as const } },
}]
const functions = [fn('dashboard', 'Overview', 'view', 'all'), fn('treasury', 'Treasury', 'view create edit approve', 'all'), fn('audit_log', 'Audit log', 'view export', 'all')]

const open = (props: Partial<Parameters<typeof InviteDrawer>[0]> = {}) => {
  const handlers = { onClose: vi.fn(), onCreated: vi.fn() }
  render(
    <InviteDrawer
      candidates={candidates} templates={templates} functions={functions} cellKeys={[]} canSetCells
      initialStaffId={null} {...handlers} {...props}
    />,
  )
  return handlers
}

describe('the invite drawer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.inviteUser.mockResolvedValue({ ok: true, name: 'ONG SIEW LAN', email: 'siew@houzs.com' })
  })

  it('starts in the picker, lists active people without a login by department, and picks one', () => {
    open()
    expect(screen.getByText('Pick somebody from the roster')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Search the roster'), { target: { value: 'hv011' } })
    expect(screen.queryByText('NO TEMPLATE')).toBeNull()
    fireEvent.click(screen.getByText('ONG SIEW LAN'))
    expect(screen.getByText('Invite ONG SIEW LAN')).toBeInTheDocument()
    expect(screen.getByText('TAN MEI LING · ASSISTANT FINANCE MANAGER')).toBeInTheDocument()
    expect(screen.getAllByText('Finance · Maker')).toHaveLength(2)
  })

  it('creates the login with the cells changed for this person, then hands back the notice', async () => {
    const { onCreated } = open({ initialStaffId: ONG })
    fireEvent.change(screen.getByPlaceholderText('name@houzs.com'), { target: { value: 'siew@houzs.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Generate' }))
    fireEvent.click(screen.getByRole('button', { name: 'Show all 3 functions' }))
    fireEvent.click(screen.getByRole('button', { name: 'Audit log · View: not granted' }))
    expect(screen.getByText(/1 raised, 0 lowered for this person only/)).toBeInTheDocument()
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Create account' })))
    const call = mocks.inviteUser.mock.calls[0][0]
    expect(call).toMatchObject({ staffId: ONG, email: 'siew@houzs.com', cells: [{ function_key: 'audit_log', action: 'view', scope: 'all' }] })
    expect(call.password).toMatch(/^Hv-.{7}$/)
    expect(onCreated).toHaveBeenCalledWith(`Created a login for ONG SIEW LAN (siew@houzs.com). Tell them the password yourself — ${call.password}`)
  })

  it('holds the button until the form is complete, and says what is missing', () => {
    open({ initialStaffId: ONG })
    expect(screen.getByRole('button', { name: 'Create account' })).toBeDisabled()
    expect(screen.getByText('Email is required')).toBeInTheDocument()
    fireEvent.change(screen.getByPlaceholderText('name@houzs.com'), { target: { value: 'siew@houzs.com' } })
    expect(screen.getByText('Password must be at least 6 characters')).toBeInTheDocument()
  })

  it('cannot create a login for somebody whose title has no template', () => {
    open({ initialStaffId: 'x-1' })
    expect(screen.getByText(/ACCOUNTS EXECUTIVE has no permission template yet/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Create account' })).toBeDisabled()
  })

  it('shows the database’s refusal and stays open', async () => {
    mocks.inviteUser.mockResolvedValue({ ok: false, reason: 'That email already has an account.' })
    const { onCreated } = open({ initialStaffId: ONG })
    fireEvent.change(screen.getByPlaceholderText('name@houzs.com'), { target: { value: 'siew@houzs.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Generate' }))
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Create account' })))
    expect(screen.getByText('That email already has an account.')).toBeInTheDocument()
    expect(onCreated).not.toHaveBeenCalled()
  })

  it('without accounts.manage the cells are the template’s and cannot be changed', () => {
    open({ initialStaffId: ONG, canSetCells: false })
    expect(screen.queryByRole('button', { name: /Treasury · View/ })).toBeNull()
    expect(screen.getByText(/Only whoever manages permissions changes a cell/)).toBeInTheDocument()
  })
})

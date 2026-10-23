import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import type { PersonCardData } from '../card-actions'

// The person window, as the handoff draws it (2026-10-10): who in a line and
// three chips; Details — the eight fields, a blank one "missing"; Permissions —
// with no login, Invite user; Activity; Esc closes, Full page has the rest.

const mocks = vi.hoisted(() => ({ getPersonCard: vi.fn() }))
vi.mock('../card-actions', () => ({ getPersonCard: mocks.getPersonCard }))
vi.mock('../../_components/PersonAccess', () => ({ default: () => <div>PERSON ACCESS</div> }))

import PersonWindow, { detailFields, personLine } from './PersonWindow'

const ID = '79516ca3-333e-420d-988a-bef4228a178a'
const card = (over: Partial<PersonCardData> = {}, staff: Partial<PersonCardData['staff']> = {}): PersonCardData =>
  ({
    staff: {
      id: ID, employee_name: 'Anthony', employee_code: 'HV008', hire_date: null, contact_number: null, email: null,
      bank_name: null, bank_account_no: null, employment_type: 'commission_eligible', commission_dept: true, director_dept: false,
      ...staff,
    },
    titles: [], code: 'HV008', title: 'Team Leader', department: 'Revenue', active: true, resignedOn: null, reportsTo: null,
    ladder: { level: null, next: null, blocker: null }, missing: ['NRIC', 'bank account', 'hire date'],
    account: null, access: null, canManagePermissions: false, activity: null,
    canSee: { salary: true, nric: true, bank: true }, can: { edit: true, promote: true, invite: true },
    ...over,
  }) as PersonCardData

beforeEach(() => mocks.getPersonCard.mockReset())
afterEach(cleanup)

async function open(data: PersonCardData, onInvite?: (id: string) => void) {
  mocks.getPersonCard.mockResolvedValue(data)
  const onClose = vi.fn()
  await act(async () => {
    render(<PersonWindow personId={ID} onClose={onClose} onInvite={onInvite} />)
  })
  return { onClose, dialog: screen.getByRole('dialog') }
}

describe('the person window', () => {
  it('says who in one line and three chips, and opens on the eight details', async () => {
    const { dialog } = await open(card())
    expect(within(dialog).getByRole('heading', { name: 'ANTHONY' })).toBeInTheDocument()
    expect(dialog).toHaveTextContent('HV008 · TEAM LEADER · Revenue')
    expect(dialog).toHaveTextContent('Active')
    expect(dialog).toHaveTextContent('No login')
    expect(dialog).toHaveTextContent('3 missing')
    expect(detailFields(card()).map(f => `${f.l}: ${f.v || 'missing'}`)).toEqual([
      'Title: Team Leader', 'Department: Revenue', 'Employee Code: HV008', 'Employment Type: Commission',
      'Hire Date: missing', 'Phone: missing', 'Email: missing', 'Account 1 bank: missing',
    ])
    expect(within(dialog).getAllByText('missing')).toHaveLength(4)
    expect(within(dialog).getByRole('link', { name: 'Full page' })).toHaveAttribute('href', `/team/people/${ID}`)
  })

  it('fills what is on file, and words the pay basis', () => {
    const f = detailFields(card({}, { hire_date: '2026-03-02', contact_number: '012-345 6789', email: 'a@houzs.my', bank_name: 'Maybank', bank_account_no: '••••' }))
    expect(f.map(x => x.v)).toEqual(['Team Leader', 'Revenue', 'HV008', 'Commission', '2 Mar 2026', '012-345 6789', 'a@houzs.my', 'Maybank · ••••'])
    expect(detailFields(card({}, { employment_type: 'variable', commission_dept: false }))[3].v).toBe('Variable pay')
    expect(detailFields(card({}, { employment_type: 'salaried', commission_dept: false }))[3].v).toBe('Salaried')
    // A basic in a commission department is paid out of the commission (2026-10-14).
    expect(detailFields(card({}, { employment_type: 'salaried', commission_dept: true }))[3].v).toBe('Basic from commission')
    expect(personLine({ code: null, title: 'Revenue Specialist', department: 'Revenue' })).toBe('REVENUE SPECIALIST · Revenue')
  })

  it('with no login, Permissions offers Invite user', async () => {
    const onInvite = vi.fn()
    const { dialog } = await open(card(), onInvite)
    fireEvent.click(within(dialog).getByRole('tab', { name: 'Permissions' }))
    expect(dialog).toHaveTextContent('Anthony has no login yet, so there is nothing to set.')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Invite user' }))
    expect(onInvite).toHaveBeenCalledWith(ID)
  })

  it('with a login, Permissions is what it may do, and the window widens', async () => {
    const { dialog } = await open(card({
      account: { id: 'u1', email: 'anthony@houzs.my', role: 'member', isActive: true, lastSeenAt: null },
      access: {} as PersonCardData['access'],
    }))
    expect(dialog).toHaveTextContent('Has login')
    expect(dialog.style.width).toBe('760px')
    fireEvent.click(within(dialog).getByRole('tab', { name: 'Permissions' }))
    expect(dialog).toHaveTextContent('PERSON ACCESS')
    expect(dialog.style.width).toBe('900px')
  })

  it('Activity reads the login’s log, or says why there is none', async () => {
    const { dialog } = await open(card({
      account: { id: 'u1', email: 'anthony@houzs.my', role: 'member', isActive: true, lastSeenAt: null },
      activity: [{ at: '2026-10-09T02:15:00Z', verb: 'Viewed', target: 'Comm Cal', detail: null }],
    }))
    fireEvent.click(within(dialog).getByRole('tab', { name: 'Activity' }))
    expect(dialog).toHaveTextContent('Viewed Comm Cal')
    cleanup()
    const second = await open(card())
    fireEvent.click(within(second.dialog).getByRole('tab', { name: 'Activity' }))
    expect(second.dialog).toHaveTextContent('Anthony has no login, so nothing is logged.')
  })

  it('Escape and × close it', async () => {
    const { onClose, dialog } = await open(card())
    fireEvent.keyDown(document, { key: 'Escape' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalledTimes(2)
  })
})

// 2026-10-23: the window's first chip is the roster's — Probation, Permanent or Part time; a probation names its end.
describe('the window’s employment chip', () => {
  it('a probation names its end, a permanent reads Permanent, not set reads Not set', async () => {
    const { dialog } = await open(card({}, { employment_status: 'probation', probation_months: 3, probation_end: '2027-12-31' }))
    expect(dialog).toHaveTextContent('Probation · ends 31 Dec 2027')
    expect(within(dialog).queryByText('Active')).toBeNull()
    cleanup()

    expect((await open(card({}, { employment_status: 'permanent' }))).dialog).toHaveTextContent('Permanent')
    cleanup()
    expect((await open(card({}, { employment_status: null }))).dialog).toHaveTextContent('Not set')
  })

  // Contract (2026-10-24): names its end too.
  it('a contract names its end', async () => {
    const { dialog } = await open(card({}, { employment_status: 'contract', contract_months: 12, contract_end: '2027-09-30' }))
    expect(dialog).toHaveTextContent('Contract · ends 30 Sep 2027')
  })

  it('an inactive person keeps Resigned', async () => {
    const { dialog } = await open(card({ active: false, resignedOn: '30 Sep 2026' }, { employment_status: 'permanent' }))
    expect(dialog).toHaveTextContent('Resigned 30 Sep 2026')
    expect(within(dialog).queryByText('Permanent')).toBeNull()
  })
})

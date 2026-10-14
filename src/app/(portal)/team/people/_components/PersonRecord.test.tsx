import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import type { StaffRow, TitleRow } from '@/lib/staff-form'

// A person's full page, edited where it stands (2026-10-14, the user: "when i
// press edit, no need jump to another tab, it should be can edit key in
// column"). Edit turns each row's value into its field in the same section;
// the bar at the foot holds Cancel and Save; a refusal is said there.

const mocks = vi.hoisted(() => ({ updateStaff: vi.fn(), flash: vi.fn() }))
vi.mock('../actions', () => ({ updateStaff: mocks.updateStaff }))
vi.mock('@/components/hrv/toast', () => ({ flash: mocks.flash }))

import PersonRecord, { type PersonEditor, type PersonRecordView } from './PersonRecord'

const view = (over: Partial<PersonRecordView> = {}): PersonRecordView => ({
  name: 'TEST STAFF',
  department: 'Marketing',
  code: 'HV042',
  title: 'Executive',
  resignationDate: null,
  account: null,
  nric: '850101141234',
  infotechCode: null,
  hireDate: '2026-01-05',
  contact: { phone: '012-345 6789', email: 'test@example.com', address: null },
  emergency: { name: null, relationship: null, phone: null },
  bank: { name1: 'Maybank', no1: '0012345678', name2: 'CIMB', no2: '0098765432' },
  payMode: 'salaried',
  pay: { basic: 'RM 2,500.00', allowances: 'RM 0.00', nonStatutory: 'RM 0.00' },
  statutory: { epf: 'Part A (Citizen, under 60)', socso: 'First', pcb: 'KA1 (Single)', children: '0' },
  ...over,
})

const staff = (over: Partial<StaffRow> = {}): StaffRow => ({
  id: 'staff-1', employee_name: 'TEST STAFF', designation: 'Executive', department_id: 'd-marketing',
  department_name: 'Marketing', commission_dept: false, director_dept: false, title_id: 't-exec',
  basic_salary: 2500, allowances: 0, non_statutory_allowance: 0, employee_code: 'HV042', infotech_code: null,
  hire_date: '2026-01-05', resignation_date: null, epf_category: 'A', socso_category: 'first',
  is_epf_exempt: false, pcb_category: 'KA1', children_count: 0, employment_type: 'salaried',
  bank_name: 'Maybank', bank_account_no: '0012345678', bank_name_2: 'CIMB', bank_account_no_2: '0098765432',
  nric: '850101141234', contact_number: '012-345 6789', email: 'test@example.com', address: null,
  emergency_contact_name: null, emergency_contact_phone: null, emergency_contact_relationship: null,
  ...over,
})

const TITLES: TitleRow[] = [
  { id: 't-exec', name: 'Executive', department_id: 'd-marketing', is_active: true },
  { id: 't-lead', name: 'Team Lead', department_id: 'd-marketing', is_active: true },
  { id: 't-any', name: 'Intern', department_id: null, is_active: true },
  { id: 't-old', name: 'Old Title', department_id: 'd-marketing', is_active: false },
  { id: 't-other', name: 'Accounts Executive', department_id: 'd-finance', is_active: true },
]

const editor = (over: Partial<StaffRow> = {}, canSee = { nric: true, bank: true }): PersonEditor => ({
  staff: staff(over),
  titles: TITLES,
  canSee,
})

beforeEach(() => {
  mocks.updateStaff.mockReset()
  mocks.flash.mockReset()
})
afterEach(cleanup)

const form = () => screen.getByRole('form') as HTMLFormElement
const bar = () => screen.getByRole('region', { name: 'Save changes' })
const sent = () => new FormData(form())

function openEditor(v = view(), e: PersonEditor | null = editor()) {
  render(<PersonRecord view={v} editor={e} inviteHref={null} />)
  fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
}

describe('reading', () => {
  it('shows the record, and Edit only to somebody who may', () => {
    const { unmount } = render(<PersonRecord view={view()} editor={editor()} inviteHref="/team/people?invite=staff-1" />)
    expect(screen.getByRole('heading', { level: 1, name: 'TEST STAFF' })).toBeInTheDocument()
    expect(screen.getByText('012-345 6789')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Invite' })).toHaveAttribute('href', '/team/people?invite=staff-1')
    expect(screen.queryByRole('form')).toBeNull()
    unmount()

    render(<PersonRecord view={view()} editor={null} inviteHref={null} />)
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull()
  })

  it('Edit stays on the page — no link to another one', () => {
    render(<PersonRecord view={view()} editor={editor()} inviteHref={null} />)
    expect(screen.getByRole('button', { name: 'Edit' }).closest('a')).toBeNull()
    expect(document.querySelector('a[href*="/edit"]')).toBeNull()
  })
})

describe('Edit — each value becomes its field where it stands', () => {
  it('keeps the sections and turns the rows into fields holding what was there', () => {
    openEditor()
    for (const section of ['Assignment', 'Identity', 'Contact', 'Emergency Contact', 'Bank Accounts', 'Salary', 'Statutory']) {
      expect(screen.getByRole('heading', { level: 2, name: section })).toBeInTheDocument()
    }
    expect(screen.getByLabelText('Name', { selector: '#person-name' })).toHaveValue('TEST STAFF')
    expect(screen.getByLabelText('Title')).toHaveValue('t-exec')
    expect(screen.getByLabelText('NRIC')).toHaveValue('850101141234')
    expect(screen.getByLabelText('Employee Code')).toHaveValue('HV042')
    expect(screen.getByLabelText('Hire Date')).toHaveValue('2026-01-05')
    expect(screen.getAllByLabelText('Phone')[0]).toHaveValue('012-345 6789')
    expect(screen.getByLabelText('Email')).toHaveValue('test@example.com')
    expect(screen.getByLabelText('Basic')).toHaveValue(2500)
    expect(screen.getByLabelText('EPF')).toHaveValue('A')
    // Department, Account and Role are not edited here: they read as they did.
    expect(screen.queryByLabelText('Department')).toBeNull()
    expect(screen.getByText('Marketing')).toBeInTheDocument()

    expect(within(bar()).getByText(/No changes/)).toBeInTheDocument()
    expect(within(bar()).getByRole('button', { name: 'Save changes' })).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull()
  })

  it('counts and marks a change, and saves the record through updateStaff', async () => {
    mocks.updateStaff.mockResolvedValue({ ok: true })
    openEditor()
    const phone = screen.getAllByLabelText('Phone')[0]
    fireEvent.change(phone, { target: { value: '012-999 0000' } })
    expect(phone).toHaveAttribute('data-dirty', 'true')
    expect(within(bar()).getByText(/1 change/)).toBeInTheDocument()
    expect(within(bar()).getByRole('button', { name: 'Save changes' })).toBeEnabled()

    await act(async () => {
      fireEvent.submit(form())
    })
    expect(mocks.updateStaff).toHaveBeenCalledTimes(1)
    const [id, data] = mocks.updateStaff.mock.calls[0] as [string, FormData]
    expect(id).toBe('staff-1')
    expect(data.get('contact_number')).toBe('012-999 0000')
    // The whole record rides along, as the old form sent it.
    expect(data.get('name')).toBe('TEST STAFF')
    expect(data.get('employment_type')).toBe('salaried')
    expect(data.get('basic_salary')).toBe('2500')
    expect(data.get('epf_category')).toBe('A')
    // Saved: the page reads again, and says so.
    expect(screen.queryByRole('form')).toBeNull()
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument()
    expect(mocks.flash).toHaveBeenCalledWith('Saved')
  })

  it('a field typed back to what it was is no change', () => {
    openEditor()
    const email = screen.getByLabelText('Email')
    fireEvent.change(email, { target: { value: 'other@example.com' } })
    expect(within(bar()).getByText(/1 change/)).toBeInTheDocument()
    fireEvent.change(email, { target: { value: 'test@example.com' } })
    expect(within(bar()).getByText(/No changes/)).toBeInTheDocument()
  })

  it('says a refusal in the bar and keeps the fields as typed', async () => {
    mocks.updateStaff.mockResolvedValue({ ok: false, reason: 'Employee code already used by another active staff' })
    openEditor()
    fireEvent.change(screen.getByLabelText('Employee Code'), { target: { value: 'HV001' } })
    await act(async () => {
      fireEvent.submit(form())
    })
    expect(within(bar()).getByRole('alert')).toHaveTextContent('Employee code already used by another active staff')
    expect(screen.getByLabelText('Employee Code')).toHaveValue('HV001')
    expect(mocks.flash).not.toHaveBeenCalled()
  })

  it('Cancel puts the page back as it was, sending nothing', () => {
    openEditor()
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'other@example.com' } })
    fireEvent.click(within(bar()).getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('form')).toBeNull()
    expect(screen.getByText('test@example.com')).toBeInTheDocument()
    expect(mocks.updateStaff).not.toHaveBeenCalled()
  })

  it('opens with its fields out from the old Edit address', () => {
    render(<PersonRecord view={view()} editor={editor()} inviteHref={null} startEditing />)
    expect(screen.getByRole('form')).toBeInTheDocument()
    expect(screen.getByLabelText('Name', { selector: '#person-name' })).toHaveValue('TEST STAFF')
  })

  it('never opens for somebody who may not edit, even from that address', () => {
    render(<PersonRecord view={view()} editor={null} inviteHref={null} startEditing />)
    expect(screen.queryByRole('form')).toBeNull()
  })

  it('offers the department’s active titles and the one they hold, whatever it is', () => {
    openEditor(view(), editor({ title_id: 't-old' }))
    const options = Array.from((screen.getByLabelText('Title') as HTMLSelectElement).options).map(o => o.text)
    expect(options).toEqual(['— None', 'Executive', 'Team Lead', 'Intern', 'Old Title (inactive)'])
    expect(screen.getByLabelText('Title')).toHaveValue('t-old')
  })
})

describe('Employment Type — one row for the pay basis', () => {
  it('fully commission based: no basic, no statutory, sent as the old tick; Salaried brings both back', () => {
    const e = editor({ department_name: 'Revenue', commission_dept: true, employment_type: 'commission_eligible', basic_salary: 0 })
    openEditor(view({ department: 'Revenue', payMode: 'full_commission' }), e)
    const type = screen.getByLabelText('Employment Type') as HTMLSelectElement
    expect(type).toHaveValue('full_commission')
    expect(Array.from(type.options).map(o => o.text)).toEqual(['Fully commission based', 'Salaried'])
    expect(screen.queryByLabelText('Basic')).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Statutory' })).toBeNull()
    expect(sent().get('full_commission')).toBe('on')
    expect(sent().get('employment_type')).toBeNull()

    fireEvent.change(type, { target: { value: 'salaried' } })
    expect(screen.getByLabelText('Basic')).toBeRequired()
    expect(screen.getByRole('heading', { name: 'Statutory' })).toBeInTheDocument()
    expect(sent().get('full_commission')).toBeNull()
    expect(sent().get('employment_type')).toBe('salaried')
    expect(type).toHaveAttribute('data-dirty', 'true')
    expect(within(bar()).getByText(/1 change/)).toBeInTheDocument()
  })

  it('variable pay: the pay fields go, statutory stays, sent as the old tick', () => {
    const e = editor({ department_name: 'Director', director_dept: true, employment_type: 'variable', basic_salary: 0 })
    openEditor(view({ department: 'Director', payMode: 'variable' }), e)
    const type = screen.getByLabelText('Employment Type') as HTMLSelectElement
    expect(Array.from(type.options).map(o => o.text)).toEqual(['Variable pay', 'Salaried'])
    expect(screen.queryByLabelText('Basic')).toBeNull()
    expect(screen.getByText('Variable pay — keyed monthly')).toBeInTheDocument()
    expect(screen.getByLabelText('EPF')).toBeInTheDocument()
    expect(screen.getByLabelText('PCB')).toBeInTheDocument()
    expect(sent().get('variable_pay')).toBe('on')

    fireEvent.change(type, { target: { value: 'salaried' } })
    expect(screen.getByLabelText('Basic')).toBeRequired()
    expect(sent().get('variable_pay')).toBeNull()
  })

  it('elsewhere, Salaried or Commission-eligible, sent as the old select', () => {
    openEditor()
    const type = screen.getByLabelText('Employment Type') as HTMLSelectElement
    expect(Array.from(type.options).map(o => o.text)).toEqual(['Salaried', 'Commission-eligible'])
    fireEvent.change(type, { target: { value: 'commission_eligible' } })
    expect(sent().get('employment_type')).toBe('commission_eligible')
    expect(screen.getByLabelText('Basic')).toBeInTheDocument()
  })
})

describe('what this editor may not see is shown, not sent (DESIGN.md › A hidden value)', () => {
  it('NRIC and bank accounts unticked: •••• in a box with no field behind it', () => {
    const e = editor({ nric: '••••', bank_account_no: '••••', bank_account_no_2: '••••' }, { nric: false, bank: false })
    openEditor(view({ nric: '••••', bank: { name1: 'Maybank', no1: '••••', name2: 'CIMB', no2: '••••' } }), e)
    expect(screen.queryByLabelText('NRIC')).toBeNull()
    expect(screen.getByTitle('NRIC / IC is not ticked for your title')).toHaveTextContent('••••')
    const data = sent()
    for (const key of ['nric', 'bank_name', 'bank_account_no', 'bank_name_2', 'bank_account_no_2']) {
      expect(data.has(key), key).toBe(false)
    }
  })

  it('loads both accounts and sends an Account 2 removal without touching Account 1', () => {
    openEditor()
    expect(screen.getByLabelText('Account 1 bank')).toHaveValue('Maybank')
    expect(screen.getByLabelText('Account 2 bank')).toHaveValue('CIMB')
    expect(screen.getByLabelText('Account 2 number')).toHaveValue('0098765432')
    fireEvent.change(screen.getByLabelText('Account 2 bank'), { target: { value: '' } })
    fireEvent.change(screen.getByLabelText('Account 2 number'), { target: { value: '' } })
    const data = sent()
    expect(data.get('bank_name')).toBe('Maybank')
    expect(data.get('bank_account_no')).toBe('0012345678')
    expect(data.get('bank_name_2')).toBe('')
    expect(data.get('bank_account_no_2')).toBe('')
  })
})

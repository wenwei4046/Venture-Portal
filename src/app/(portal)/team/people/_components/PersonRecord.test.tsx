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
  commissionDept: false,
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
/** What the last save sent to updateStaff. */
async function save(): Promise<Record<string, FormDataEntryValue>> {
  mocks.updateStaff.mockResolvedValue({ ok: true })
  await act(async () => {
    fireEvent.submit(form())
  })
  const [, data] = mocks.updateStaff.mock.calls.at(-1) as [string, FormData]
  return Object.fromEntries(data.entries())
}

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

  it('counts and marks a change, saves it, and reads again once the fresh record is in', async () => {
    mocks.updateStaff.mockResolvedValue({ ok: true })
    const { rerender } = render(<PersonRecord view={view()} editor={editor()} inviteHref={null} />)
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
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
    // Only what changed goes — the rest of the record is not written back
    // (2026-10-14: a whole-page save put old values over changes made since).
    expect(Object.fromEntries(data.entries())).toEqual({ contact_number: '012-999 0000' })
    // Saved — but the page does not read its old values back while the fresh
    // record is on its way (seen 2026-10-14): the bar says Saving…
    expect(screen.getByRole('form')).toBeInTheDocument()
    expect(within(bar()).getByRole('button', { name: 'Saving…' })).toBeDisabled()
    expect(mocks.flash).not.toHaveBeenCalled()

    // The server's fresh read arrives: the page reads it, and says it saved.
    rerender(<PersonRecord view={view({ contact: { phone: '012-999 0000', email: 'test@example.com', address: null } })} editor={editor({ contact_number: '012-999 0000' })} inviteHref={null} />)
    expect(screen.queryByRole('form')).toBeNull()
    expect(screen.getByText('012-999 0000')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument()
    expect(mocks.flash).toHaveBeenCalledWith('Saved')
  })

  it('reads anyway if the fresh record never comes', async () => {
    vi.useFakeTimers()
    try {
      mocks.updateStaff.mockResolvedValue({ ok: true })
      openEditor()
      fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'other@example.com' } })
      await act(async () => {
        fireEvent.submit(form())
      })
      expect(screen.getByRole('form')).toBeInTheDocument()
      await act(async () => {
        vi.advanceTimersByTime(6000)
      })
      expect(screen.queryByRole('form')).toBeNull()
      expect(mocks.flash).toHaveBeenCalledWith('Saved')
    } finally {
      vi.useRealTimers()
    }
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

    // Correcting a field takes the refusal away; the count comes back.
    fireEvent.change(screen.getByLabelText('Employee Code'), { target: { value: 'HV043' } })
    expect(within(bar()).queryByRole('alert')).toBeNull()
    expect(within(bar()).getByText(/1 change/)).toBeInTheDocument()
  })

  it('asks nothing it does not need: no example values in empty fields', () => {
    openEditor(view(), editor({ nric: null, contact_number: null, infotech_code: null }))
    expect(form().querySelectorAll('[placeholder]')).toHaveLength(0)
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
  // Revenue (2026-10-14, the user, on CHEA HUAN: "他要给 basic，然后从他薪水扣"
  // — a tick on People, then his basic): the Salary section's one tick.
  const revenue = { department: 'Revenue', commissionDept: true } as const
  const revenueStaff = { department_name: 'Revenue', commission_dept: true } as const

  it('Revenue: Basic from commission is one tick on Salary; on, it asks a basic above 0 and brings Statutory', async () => {
    const e = editor({ ...revenueStaff, employment_type: 'commission_eligible', basic_salary: 0 })
    openEditor(view({ ...revenue, payMode: 'full_commission' }), e)
    // No Employment Type select in a commission department: the tick answers it.
    expect(screen.queryByLabelText('Employment Type')).toBeNull()
    const tick = screen.getByLabelText('Basic from commission') as HTMLInputElement
    expect(tick).not.toBeChecked()
    expect(screen.getByText('None — 100% of pay is commission')).toBeInTheDocument()
    expect(screen.queryByLabelText('Basic')).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Statutory' })).toBeNull()

    fireEvent.click(tick)
    expect(screen.getByLabelText('Basic from commission')).toBeChecked()
    const basic = screen.getByLabelText('Basic')
    expect(basic).toBeRequired()
    expect(basic).toHaveAttribute('min', '0.01')
    expect(screen.getByLabelText('Statutory Allowance')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Statutory' })).toBeInTheDocument()
    expect(screen.getAllByText('Basic from commission').length).toBeGreaterThan(0)
    expect(within(bar()).getByText(/1 change/)).toBeInTheDocument()

    fireEvent.change(basic, { target: { value: '7000' } })
    expect(await save()).toEqual({ employment_type: 'salaried', basic_salary: '7000' })
  })

  it('Revenue with a basic: untick, and it is Fully commission based again — nothing of the pay it leaves is sent', async () => {
    openEditor(
      view({ ...revenue, payMode: 'salaried', pay: { basic: 'RM 7,000.00', allowances: 'RM 0.00', nonStatutory: 'RM 0.00' } }),
      editor({ ...revenueStaff, basic_salary: 7000 }),
    )
    expect(screen.getByLabelText('Basic from commission')).toBeChecked()
    expect(screen.getByLabelText('Basic')).toHaveValue(7000)
    fireEvent.change(screen.getByLabelText('Basic'), { target: { value: '9999' } })
    fireEvent.click(screen.getByLabelText('Basic from commission'))
    expect(screen.queryByLabelText('Basic')).toBeNull()
    expect(screen.getByText('None — 100% of pay is commission')).toBeInTheDocument()
    expect(within(bar()).getByText(/1 change/)).toBeInTheDocument()
    expect(await save()).toEqual({ full_commission: 'on' })
  })

  it('Revenue with a basic reads as Basic from commission', () => {
    render(
      <PersonRecord
        view={view({ ...revenue, payMode: 'salaried', pay: { basic: 'RM 7,000.00', allowances: 'RM 0.00', nonStatutory: 'RM 0.00' } })}
        editor={null}
        inviteHref={null}
      />,
    )
    // Employment Type and the Salary section's pay basis both say so.
    expect(screen.getAllByText('Basic from commission')).toHaveLength(2)
    expect(screen.getByText('RM 7,000.00')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Statutory' })).toBeInTheDocument()
  })

  it('variable pay: the pay fields go, statutory stays, sent as the old tick', async () => {
    const e = editor({ department_name: 'Director', director_dept: true, employment_type: 'variable', basic_salary: 0 })
    openEditor(view({ department: 'Director', payMode: 'variable' }), e)
    const type = screen.getByLabelText('Employment Type') as HTMLSelectElement
    expect(Array.from(type.options).map(o => o.text)).toEqual(['Variable pay', 'Salaried'])
    expect(screen.queryByLabelText('Basic')).toBeNull()
    expect(screen.getByText('Variable pay — keyed monthly')).toBeInTheDocument()
    expect(screen.getByLabelText('EPF')).toBeInTheDocument()
    expect(screen.getByLabelText('PCB')).toBeInTheDocument()

    fireEvent.change(type, { target: { value: 'salaried' } })
    expect(screen.getByLabelText('Basic')).toBeRequired()
    fireEvent.change(type, { target: { value: 'variable' } })
    fireEvent.change(screen.getByLabelText('PCB'), { target: { value: 'KA2' } })
    // Back where it started: the basis is no change; the category is.
    expect(await save()).toEqual({ pcb_category: 'KA2' })
  })

  it('a director moved to a fixed pay is sent the select and the basic typed', async () => {
    const e = editor({ department_name: 'Director', director_dept: true, employment_type: 'variable', basic_salary: 0 })
    openEditor(view({ department: 'Director', payMode: 'variable' }), e)
    fireEvent.change(screen.getByLabelText('Employment Type'), { target: { value: 'salaried' } })
    fireEvent.change(screen.getByLabelText('Basic'), { target: { value: '14400' } })
    expect(await save()).toEqual({ employment_type: 'salaried', basic_salary: '14400' })
  })

  it('elsewhere, Salaried or Commission-eligible, sent as the old select', async () => {
    openEditor()
    const type = screen.getByLabelText('Employment Type') as HTMLSelectElement
    expect(Array.from(type.options).map(o => o.text)).toEqual(['Salaried', 'Commission-eligible'])
    fireEvent.change(type, { target: { value: 'commission_eligible' } })
    expect(screen.getByLabelText('Basic')).toBeInTheDocument()
    expect(await save()).toEqual({ employment_type: 'commission_eligible' })
  })
})

describe('what this editor may not see is shown, not sent (DESIGN.md › A hidden value)', () => {
  it('NRIC and bank accounts unticked: •••• in a box with no field behind it, never sent', async () => {
    const e = editor({ nric: '••••', bank_account_no: '••••', bank_account_no_2: '••••' }, { nric: false, bank: false })
    openEditor(view({ nric: '••••', bank: { name1: 'Maybank', no1: '••••', name2: 'CIMB', no2: '••••' } }), e)
    expect(screen.queryByLabelText('NRIC')).toBeNull()
    expect(screen.getByTitle('NRIC / IC is not ticked for your title')).toHaveTextContent('••••')
    for (const name of ['nric', 'bank_name', 'bank_account_no', 'bank_name_2', 'bank_account_no_2']) {
      expect(form().elements.namedItem(name), name).toBeNull()
    }
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'other@example.com' } })
    expect(await save()).toEqual({ email: 'other@example.com' })
  })

  it('loads both accounts and sends an Account 2 removal without touching Account 1', async () => {
    openEditor()
    expect(screen.getByLabelText('Account 1 bank')).toHaveValue('Maybank')
    expect(screen.getByLabelText('Account 2 bank')).toHaveValue('CIMB')
    expect(screen.getByLabelText('Account 2 number')).toHaveValue('0098765432')
    fireEvent.change(screen.getByLabelText('Account 2 bank'), { target: { value: '' } })
    fireEvent.change(screen.getByLabelText('Account 2 number'), { target: { value: '' } })
    expect(await save()).toEqual({ bank_name_2: '', bank_account_no_2: '' })
  })

  it('sends a bank account whole when only its number changed', async () => {
    openEditor()
    fireEvent.change(screen.getByLabelText('Account 1 number'), { target: { value: '0012399999' } })
    expect(await save()).toEqual({ bank_name: 'Maybank', bank_account_no: '0012399999' })
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import AddStaffForm, { type AddStaffDepartment } from './AddStaffForm'
import type { ManagerOption, SubDepartmentOption, TitleOption } from '@/lib/staff-form'

const actions = vi.hoisted(() => ({ addStaff: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }))
vi.mock('../actions', () => actions)
// Each test waits for ITS OWN submit (CI flake on #582, 2026-10-20): the submit awaits Malaysia's list before it calls
// addStaff, so on a busy runner `toHaveBeenCalled` passed on an earlier test's call and read its empty address — and
// the late call then landed in the next test.
beforeEach(() => { actions.addStaff.mockClear() })

const departments: AddStaffDepartment[] = [
  { id: 'revenue', name: 'Revenue Department', payroll_source: 'commission', segment_key: 'revenue' },
  { id: 'marketing', name: 'Marketing', payroll_source: 'imported', segment_key: 'shared' },
]
const titles: TitleOption[] = [
  { id: 'rs', name: 'Revenue Specialist', department_id: 'revenue' },
  { id: 'srs', name: 'Senior Revenue Specialist', department_id: 'revenue' },
  { id: 'exec', name: 'Marketing Executive', department_id: 'marketing' },
]
// IR's ladder carries no Senior Revenue Specialist — the real one does not either.
const subDepartments: SubDepartmentOption[] = [
  { id: 'fair', name: 'Fair', departmentId: 'revenue', isHome: true, titleIds: ['rs', 'srs'] },
  { id: 'ir', name: 'IR', departmentId: 'revenue', isHome: false, titleIds: ['rs'] },
]
const managers: ManagerOption[] = [
  { id: 'chea', name: 'Chea Huan', code: 'HV009', departmentId: 'revenue', departmentName: 'Revenue Department' },
  { id: 'ken', name: 'Ken', code: 'HV002', departmentId: 'marketing', departmentName: 'Marketing' },
]

function setup() {
  actions.addStaff.mockResolvedValue(undefined)
  render(<AddStaffForm departments={departments} titles={titles}
    subDepartments={subDepartments} managers={managers} nextCode="HV068" />)
  return {
    department: screen.getByLabelText('Department') as HTMLSelectElement,
    designation: screen.getByLabelText(/Designation/) as HTMLSelectElement,
    base: screen.getByLabelText(/Sub-department/) as HTMLSelectElement,
    upline: screen.getByLabelText(/Reporting upline/) as HTMLSelectElement,
  }
}

function optionsOf(select: HTMLSelectElement) {
  return [...select.options].map(option => ({ value: option.value, label: option.textContent, disabled: option.disabled }))
}

/**
 * Where somebody is BASED is their own fact (2026-09-20), and the one moment
 * the whole record is written is the moment to ask it. Filing the reporting
 * line here too is what makes the commission membership the database derives
 * right on the first write, instead of created in Fair and moved afterwards.
 */
describe('Add Staff — the sub-department and the reporting line', () => {
  it('asks a divided department which sub-department, preselecting its default', () => {
    const { department, base } = setup()
    expect(base).toBeDisabled()

    fireEvent.change(department, { target: { value: 'revenue' } })
    expect(base).toBeEnabled()
    expect(base.value).toBe('fair')
    expect(optionsOf(base).map(option => option.label)).toEqual(
      expect.arrayContaining(['Fair · default', 'IR']),
    )
  })

  it('leaves the field blank for a department that is not divided, and says why', () => {
    const { department, base } = setup()
    fireEvent.change(department, { target: { value: 'marketing' } })
    expect(base).toBeDisabled()
    expect(base.value).toBe('')
    expect(screen.getByText('Marketing is not divided into sub-departments.')).toBeInTheDocument()
  })

  it('refuses a base whose ladder has no rung for the chosen title, and drops the pairing when it stops being possible', () => {
    const { department, designation, base } = setup()
    fireEvent.change(department, { target: { value: 'revenue' } })
    fireEvent.change(base, { target: { value: 'ir' } })
    expect(base.value).toBe('ir')

    fireEvent.change(designation, { target: { value: 'srs' } })
    expect(optionsOf(base).find(option => option.value === 'ir')).toMatchObject({
      disabled: true, label: expect.stringContaining('no rung for this title'),
    })
    expect(base.value).toBe('')

    fireEvent.change(designation, { target: { value: 'rs' } })
    expect(optionsOf(base).find(option => option.value === 'ir')).toMatchObject({ disabled: false })
  })

  it('keeps a commission department’s reporting line inside it and offers the rest of the company otherwise', () => {
    const { department, upline } = setup()
    fireEvent.change(department, { target: { value: 'revenue' } })
    expect(optionsOf(upline).map(option => option.value)).toEqual(['', 'chea'])

    fireEvent.change(department, { target: { value: 'marketing' } })
    expect(optionsOf(upline).map(option => option.value)).toEqual(['', 'ken', 'chea'])
    expect(optionsOf(upline).at(-1)?.label).toContain('Revenue Department')
  })

  it('submits both, and forgets a choice made for a department that was then changed', async () => {
    const { department, base, upline } = setup()
    // Two fields are labelled Name (the person, and an emergency contact).
    fireEvent.change(document.getElementById('staff-name')!, { target: { value: 'Teng Yik' } })
    fireEvent.change(department, { target: { value: 'revenue' } })
    fireEvent.change(base, { target: { value: 'ir' } })
    fireEvent.change(upline, { target: { value: 'chea' } })

    await act(async () => { fireEvent.submit(screen.getByRole('button', { name: 'Add Staff' }).closest('form')!) })
    await waitFor(() => expect(actions.addStaff).toHaveBeenCalled())
    const sent = actions.addStaff.mock.calls.at(-1)![0] as FormData
    expect(sent.get('home_sub_department_id')).toBe('ir')
    expect(sent.get('reports_to')).toBe('chea')

    fireEvent.change(department, { target: { value: 'marketing' } })
    expect(base.value).toBe('')
    expect(upline.value).toBe('')
  })
})

// The address in six parts (2026-10-20): State → City → Postcode picked from Malaysia's list, the form carrying the
// six by their columns' names; three that are not one place are refused before anything is sent.
describe('Add Staff — the address', () => {
  const field = (key: string) => document.getElementById(`staff-address-${key}`) as HTMLInputElement | HTMLSelectElement
  const listed = () => waitFor(() => expect(field('state')).not.toBeDisabled())
  const submit = () => act(async () => { fireEvent.submit(screen.getByRole('button', { name: 'Add Staff' }).closest('form')!) })

  it('files the six parts picked in turn', async () => {
    const { department } = setup()
    fireEvent.change(document.getElementById('staff-name')!, { target: { value: 'Teng Yik' } })
    fireEvent.change(department, { target: { value: 'marketing' } })
    await listed()
    fireEvent.change(field('line1'), { target: { value: 'No 8, Jalan Mawar 2' } })
    fireEvent.change(field('state'), { target: { value: 'Johor' } })
    fireEvent.change(field('city'), { target: { value: 'Rengit' } })
    expect(field('postcode')).toHaveValue('83100')

    await submit()
    await waitFor(() => expect(actions.addStaff).toHaveBeenCalled())
    const sent = actions.addStaff.mock.calls.at(-1)![0] as FormData
    expect(Object.fromEntries([...sent.entries()].filter(([key]) => key.startsWith('address')))).toEqual({
      address_line1: 'No 8, Jalan Mawar 2', address_line2: '', address_state: 'Johor', address_city: 'Rengit',
      address_postcode: '83100', address_country: 'Malaysia',
    })
  })

  it('asks for the postcode before sending anything', async () => {
    const { department } = setup()
    fireEvent.change(document.getElementById('staff-name')!, { target: { value: 'Teng Yik' } })
    fireEvent.change(department, { target: { value: 'marketing' } })
    await listed()
    fireEvent.change(field('line1'), { target: { value: 'No 83, Jalan Jambu 3' } })
    fireEvent.change(field('state'), { target: { value: 'Pulau Pinang' } })
    fireEvent.change(field('city'), { target: { value: 'Bukit Mertajam' } })

    await submit()
    expect(await screen.findByText('Pick the postcode.')).toBeInTheDocument()
    expect(actions.addStaff).not.toHaveBeenCalled()
  })
})

// 2026-10-23 — the user: "when people add in, will need to fill up one more, is status, is probation, permanent or part
// time. then is select probation, needs to select with probation period, so that is can be notice and verify".
describe('Add Staff — the hire date and the employment status', () => {
  const status = () => screen.getByLabelText('Employment status') as HTMLSelectElement
  const hire = () => screen.getByLabelText('Hire date') as HTMLInputElement

  it('asks both, required; Probation, Permanent, Part time', () => {
    setup()
    expect(hire()).toBeRequired()
    expect(status()).toBeRequired()
    expect(optionsOf(status()).map(o => o.label)).toEqual(['Select...', 'Probation', 'Contract', 'Permanent', 'Part time'])
    expect(screen.queryByLabelText('Probation period')).toBeNull()
  })

  it('a probation asks its period — 3 months to start — and shows the day it ends', () => {
    setup()
    fireEvent.change(status(), { target: { value: 'probation' } })
    const months = screen.getByLabelText('Probation period') as HTMLSelectElement
    expect(months.value).toBe('3')
    expect(optionsOf(months).map(o => o.label)).toEqual(['1 month', '2 months', '3 months', '4 months', '5 months', '6 months'])
    expect(screen.getByLabelText('Probation ends')).toHaveValue('Pick the hire date first')
    fireEvent.change(hire(), { target: { value: '2026-11-02' } })
    expect(screen.getByLabelText('Probation ends')).toHaveValue('1 Feb 2027')
    fireEvent.change(months, { target: { value: '6' } })
    expect(screen.getByLabelText('Probation ends')).toHaveValue('1 May 2027')
    // Reminded twice (2026-10-24 — "need 30 days and 15 days before remind, 2 reminder").
    expect(screen.getByText('HR is reminded 30 and 15 days before.')).toBeInTheDocument()

    fireEvent.change(status(), { target: { value: 'permanent' } })
    expect(screen.queryByLabelText('Probation period')).toBeNull()
  })

  it('files the three with the rest', async () => {
    const { department } = setup()
    fireEvent.change(document.getElementById('staff-name')!, { target: { value: 'Teng Yik' } })
    fireEvent.change(department, { target: { value: 'marketing' } })
    fireEvent.change(hire(), { target: { value: '2026-11-02' } })
    fireEvent.change(status(), { target: { value: 'probation' } })
    fireEvent.change(screen.getByLabelText('Probation period'), { target: { value: '6' } })

    await act(async () => { fireEvent.submit(screen.getByRole('button', { name: 'Add Staff' }).closest('form')!) })
    await waitFor(() => expect(actions.addStaff).toHaveBeenCalled())
    const sent = actions.addStaff.mock.calls.at(-1)![0] as FormData
    expect(sent.get('hire_date')).toBe('2026-11-02')
    expect(sent.get('employment_status')).toBe('probation')
    expect(sent.get('probation_months')).toBe('6')
    // The end is the database's to keep — a disabled field is not sent.
    expect(sent.has('probation_end')).toBe(false)
  })

  // Contract (2026-10-24 — the user: "can add with one is Contract, then need pick time period as well, 6 month, 12
  // month, 18, 24, until 36").
  it('a contract asks its period — 12 months to start, 6 to 36 — shows the day it ends, and files it alone', async () => {
    const { department } = setup()
    fireEvent.change(document.getElementById('staff-name')!, { target: { value: 'Teng Yik' } })
    fireEvent.change(department, { target: { value: 'marketing' } })
    fireEvent.change(status(), { target: { value: 'contract' } })
    const months = screen.getByLabelText('Contract period') as HTMLSelectElement
    expect(months.value).toBe('12')
    expect(optionsOf(months).map(o => o.label)).toEqual(['6 months', '12 months', '18 months', '24 months', '30 months', '36 months'])
    expect(screen.queryByLabelText('Probation period')).toBeNull()
    expect(screen.getByLabelText('Contract ends')).toHaveValue('Pick the hire date first')
    fireEvent.change(hire(), { target: { value: '2026-11-02' } })
    expect(screen.getByLabelText('Contract ends')).toHaveValue('1 Nov 2027')
    fireEvent.change(months, { target: { value: '36' } })
    expect(screen.getByLabelText('Contract ends')).toHaveValue('1 Nov 2029')
    // A contract's end is reminded the same way as a probation's (2026-10-24).
    expect(screen.getByLabelText('Contract ends')).toHaveAccessibleDescription('HR is reminded 30 and 15 days before.')

    await act(async () => { fireEvent.submit(screen.getByRole('button', { name: 'Add Staff' }).closest('form')!) })
    await waitFor(() => expect(actions.addStaff).toHaveBeenCalled())
    const sent = actions.addStaff.mock.calls.at(-1)![0] as FormData
    expect(sent.get('employment_status')).toBe('contract')
    expect(sent.get('contract_months')).toBe('36')
    expect(sent.has('probation_months')).toBe(false)

    fireEvent.change(status(), { target: { value: 'part_time' } })
    expect(screen.queryByLabelText('Contract period')).toBeNull()
  })
})

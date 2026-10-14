import { beforeEach, describe, expect, it, vi } from 'vitest'

const { insert, update, query, createClient } = vi.hoisted(() => {
  const insert = vi.fn().mockResolvedValue({ error: null })
  const update = vi.fn()
  const query = {
    insert, update, error: null,
    select: vi.fn(), eq: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue({ data: { department_id: 'department', title_id: null }, error: null }),
  }
  query.select.mockReturnValue(query)
  query.eq.mockReturnValue(query)
  update.mockReturnValue(query)
  return { insert, update, query, createClient: vi.fn().mockResolvedValue({ from: vi.fn().mockReturnValue(query) }) }
})
vi.mock('@/lib/supabase/server', () => ({ createClient }))
const { gate } = vi.hoisted(() => ({ gate: vi.fn() }))
vi.mock('@/lib/auth', () => ({ requirePage: async () => undefined, requirePermission: gate, requireActionOn: gate, requireAnyActionOn: gate, requirePayrollPayoutsActionOn: gate }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
// Account 1 as the record holds it — read only when Account 2 is saved alone.
const { readStaffPrivate } = vi.hoisted(() => ({ readStaffPrivate: vi.fn() }))
vi.mock('@/lib/private-fields', () => ({ readStaffPrivate }))
import { addStaff, updateStaff } from './actions'

// HR's title ticks all three (2026-10-09, PR4). The Director template ticks
// Salary amounts only — the case the masking is for; with no tick at all the
// edit is not theirs (the form saves pay).
const HR = { id: 'admin', sensitive: ['bank', 'nric', 'salary'] }
const DIRECTOR = { id: 'director', sensitive: ['salary'] }
const NO_TICKS = { id: 'office', sensitive: [] }

function staffForm(second?: { bank: string; number: string }) {
  const form = new FormData()
  Object.entries({ name: 'Test Staff', department_id: 'department', full_commission: 'on', bank_name: 'Maybank', bank_account_no: '0012345678' })
    .forEach(([key, value]) => form.set(key, value))
  if (second) {
    form.set('bank_name_2', second.bank)
    form.set('bank_account_no_2', second.number)
  }
  return form
}

beforeEach(() => {
  vi.clearAllMocks()
  gate.mockResolvedValue(HR)
})

describe('staff bank account server actions', () => {
  it('adds the optional account separately without replacing Account 1', async () => {
    await addStaff(staffForm({ bank: ' CIMB ', number: ' 0098-7654 ' }))
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({
      bank_name: 'Maybank', bank_account_no: '0012345678', bank_name_2: 'CIMB', bank_account_no_2: '00987654',
    }))
  })

  it('updates or clears Account 2 explicitly while preserving the primary fields', async () => {
    await updateStaff('staff', staffForm({ bank: 'CIMB', number: '0098 7654' }))
    expect(update).toHaveBeenLastCalledWith(expect.objectContaining({ bank_name: 'Maybank', bank_account_no: '0012345678', bank_name_2: 'CIMB', bank_account_no_2: '00987654' }))
    await updateStaff('staff', staffForm({ bank: '', number: '' }))
    expect(update).toHaveBeenLastCalledWith(expect.objectContaining({ bank_name_2: null, bank_account_no_2: null }))
  })

  it('preserves a stored Account 2 when an older caller only sends Account 1', async () => {
    await updateStaff('staff', staffForm())
    const fields = update.mock.calls[0][0]
    expect(fields).not.toHaveProperty('bank_name_2')
    expect(fields).not.toHaveProperty('bank_account_no_2')
    expect(fields).toMatchObject({ bank_name: 'Maybank', bank_account_no: '0012345678' })
  })

  it('refuses incomplete, invalid or duplicate Account 2 before a database write', async () => {
    for (const second of [{ bank: 'CIMB', number: '' }, { bank: '', number: '1234' }, { bank: 'CIMB', number: 'invalid' }, { bank: 'maybank', number: '0012-345678' }]) {
      // The save answers in words — production hides a thrown message (2026-10-14).
      await expect(updateStaff('staff', staffForm(second))).resolves.toEqual({ ok: false, reason: expect.stringMatching(/Account 2/) })
      await expect(addStaff(staffForm(second))).rejects.toThrow(/Account 2/)
    }
    // The record is read as it stands (2026-10-14: Account 2 is checked
    // against the Account 1 it will sit beside); nothing is written.
    expect(insert).not.toHaveBeenCalled()
    expect(update).not.toHaveBeenCalled()
  })
})

describe('a person is saved from their own page (2026-10-14, edited where it stands)', () => {
  it('writes only the fields sent — what changed — and nothing back over the rest', async () => {
    // The side note the user passed on (2026-10-14): a save of the whole page
    // put the page's old values back over changes made since it was opened.
    const form = new FormData()
    form.set('contact_number', ' 012-999 0000 ')
    await expect(updateStaff('staff', form)).resolves.toEqual({ ok: true })
    expect(update).toHaveBeenCalledWith({ contact_number: '012-999 0000' })
  })

  it('writes nothing at all when nothing was sent', async () => {
    await expect(updateStaff('staff', new FormData())).resolves.toEqual({ ok: true })
    expect(update).not.toHaveBeenCalled()
  })

  it('checks Account 2 saved alone against Account 1 on file', async () => {
    query.maybeSingle.mockResolvedValueOnce({ data: { department_id: 'department', title_id: null, bank_name: 'Maybank' }, error: null })
    readStaffPrivate.mockResolvedValueOnce(new Map([['staff', { nric: null, bank_account_no: '0012345678', bank_account_no_2: null }]]))
    const form = new FormData()
    form.set('bank_name_2', 'maybank')
    form.set('bank_account_no_2', '0012-345678')
    await expect(updateStaff('staff', form)).resolves.toEqual({ ok: false, reason: 'Account 2 must be different from Account 1' })
    expect(update).not.toHaveBeenCalled()

    // A different account: written alone, Account 1 untouched.
    query.maybeSingle.mockResolvedValueOnce({ data: { department_id: 'department', title_id: null, bank_name: 'Maybank' }, error: null })
    readStaffPrivate.mockResolvedValueOnce(new Map([['staff', { nric: null, bank_account_no: '0012345678', bank_account_no_2: null }]]))
    form.set('bank_account_no_2', '0098 7654')
    await expect(updateStaff('staff', form)).resolves.toEqual({ ok: true })
    expect(update).toHaveBeenCalledWith({ bank_name_2: 'maybank', bank_account_no_2: '00987654' })
  })

  it('refuses a basic for somebody moved to commission since the page was opened', async () => {
    query.maybeSingle.mockResolvedValueOnce({
      data: { department_id: 'department', title_id: null, employment_type: 'commission_eligible', departments: { payroll_source: 'commission' } },
      error: null,
    })
    const form = new FormData()
    form.set('basic_salary', '3500')
    await expect(updateStaff('staff', form)).resolves.toEqual({ ok: false, reason: expect.stringMatching(/pay basis changed/) })
    expect(update).not.toHaveBeenCalled()
  })

  it('never blanks a name, a date or a contact the save did not carry', async () => {
    const form = new FormData()
    form.set('email', 'new@example.com')
    await updateStaff('staff', form)
    const fields = update.mock.calls[0][0]
    for (const key of ['employee_name', 'hire_date', 'resignation_date', 'employee_code', 'contact_number', 'address', 'title_id', 'employment_type', 'basic_salary']) {
      expect(fields, key).not.toHaveProperty(key)
    }
  })

  it('refuses a blank name', async () => {
    const form = new FormData()
    form.set('name', '   ')
    await expect(updateStaff('staff', form)).resolves.toEqual({ ok: false, reason: 'A name is required' })
  })

  it('names the full page as the write’s page, and answers ok', async () => {
    await expect(updateStaff('staff', staffForm())).resolves.toEqual({ ok: true })
    expect(gate).toHaveBeenCalledWith('/team/people/[id]', 'team', 'edit')
  })

  it('answers a refusal from the database in words, not a thrown digest', async () => {
    const q = query as { error: unknown }
    q.error = { code: '23505', message: 'duplicate key value violates unique constraint "idx_hr_staff_employee_code_active"' }
    try {
      await expect(updateStaff('staff', staffForm())).resolves.toEqual({ ok: false, reason: 'Employee code already used by another active staff' })
    } finally {
      q.error = null
    }
  })
})

describe('NRIC and bank accounts are written only where ticked (2026-10-09, PR4)', () => {
  it('refuses the edit to somebody whose title does not tick Salary amounts', async () => {
    gate.mockResolvedValue(NO_TICKS)
    await expect(updateStaff('staff', staffForm())).resolves.toEqual({ ok: false, reason: expect.stringMatching(/Salary amounts/) })
    expect(update).not.toHaveBeenCalled()
  })

  it('leaves NRIC and bank accounts untouched for an editor whose title ticks neither', async () => {
    gate.mockResolvedValue(DIRECTOR)
    const form = staffForm({ bank: 'CIMB', number: '0098 7654' })
    form.set('nric', '850101141234')
    await updateStaff('staff', form)
    const fields = update.mock.calls[0][0]
    for (const key of ['nric', 'bank_name', 'bank_account_no', 'bank_name_2', 'bank_account_no_2']) {
      expect(fields).not.toHaveProperty(key)
    }
  })

  it('never writes NULL over a stored NRIC the form did not carry', async () => {
    await updateStaff('staff', staffForm())
    expect(update.mock.calls[0][0]).not.toHaveProperty('nric')
  })

  it('writes the NRIC for an editor who sees it, and clears it when blanked', async () => {
    const form = staffForm()
    form.set('nric', '850101-14-1234')
    await updateStaff('staff', form)
    expect(update).toHaveBeenLastCalledWith(expect.objectContaining({ nric: '850101141234' }))
    form.set('nric', '')
    await updateStaff('staff', form)
    expect(update).toHaveBeenLastCalledWith(expect.objectContaining({ nric: null }))
  })

  it('refuses •••• — a hidden number is never saved back as itself', async () => {
    const form = staffForm()
    form.set('bank_account_no', '••••')
    await expect(updateStaff('staff', form)).resolves.toEqual({ ok: false, reason: expect.stringMatching(/hidden from you/) })
    expect(update).not.toHaveBeenCalled()
  })

  it('files a new person without the bank accounts when the adder may not see them', async () => {
    gate.mockResolvedValue(NO_TICKS)
    await addStaff(staffForm({ bank: 'CIMB', number: '00987654' }))
    const row = insert.mock.calls[0][0]
    for (const key of ['bank_name', 'bank_account_no', 'bank_name_2', 'bank_account_no_2']) {
      expect(row).not.toHaveProperty(key)
    }
  })
})

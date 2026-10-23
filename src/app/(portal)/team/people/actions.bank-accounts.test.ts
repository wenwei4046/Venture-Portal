import { beforeEach, describe, expect, it, vi } from 'vitest'

const { insert, update, query, rpc, createClient } = vi.hoisted(() => {
  const insert = vi.fn().mockResolvedValue({ error: null })
  const update = vi.fn()
  const rpc = vi.fn().mockResolvedValue({ data: null, error: null })
  const query = {
    insert, update, error: null,
    select: vi.fn(), eq: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue({ data: { department_id: 'department', title_id: null }, error: null }),
  }
  query.select.mockReturnValue(query)
  query.eq.mockReturnValue(query)
  update.mockReturnValue(query)
  return { insert, update, query, rpc, createClient: vi.fn().mockResolvedValue({ from: vi.fn().mockReturnValue(query), rpc }) }
})
vi.mock('@/lib/supabase/server', () => ({ createClient }))
// A login's email moves the login first (2026-10-22) — the service role's one job, which is server-only.
const { moveLoginForPerson, moveBackUnlessWritten } = vi.hoisted(() => ({ moveLoginForPerson: vi.fn(), moveBackUnlessWritten: vi.fn() }))
vi.mock('@/lib/account/login-email', () => ({ moveLoginForPerson, moveBackUnlessWritten }))
const { gate } = vi.hoisted(() => ({ gate: vi.fn() }))
vi.mock('@/lib/auth', () => ({ requirePage: async () => undefined, requirePermission: gate, requireActionOn: gate, requireAnyActionOn: gate, requirePayrollPayoutsActionOn: gate }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
// Account 1 as the record holds it — read only when Account 2 is saved alone.
const { readStaffPrivate } = vi.hoisted(() => ({ readStaffPrivate: vi.fn() }))
vi.mock('@/lib/private-fields', () => ({ readStaffPrivate }))
// Reports to travels by the charts' own writer (2026-10-16), which is server-only.
const { moveReportingLine } = vi.hoisted(() => ({ moveReportingLine: vi.fn() }))
vi.mock('@/lib/hierarchy-writes', () => ({ moveReportingLine }))
// Malaysia's postcode list, which the address is checked against (2026-10-20), is server-only.
vi.mock('server-only', () => ({}))
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

/** Add Staff's form: since 2026-10-23 it also asks when they start and Probation / Permanent / Part time. */
function newStaffForm(second?: { bank: string; number: string }) {
  const form = staffForm(second)
  form.set('hire_date', '2026-11-02')
  form.set('employment_status', 'probation')
  form.set('probation_months', '3')
  return form
}

beforeEach(() => {
  vi.clearAllMocks()
  gate.mockResolvedValue(HR)
})

describe('staff bank account server actions', () => {
  it('adds the optional account separately without replacing Account 1', async () => {
    await addStaff(newStaffForm({ bank: ' CIMB ', number: ' 0098-7654 ' }))
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
      await expect(addStaff(newStaffForm(second))).rejects.toThrow(/Account 2/)
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
    for (const key of ['employee_name', 'hire_date', 'resignation_date', 'employee_code', 'contact_number', 'address', 'title_id', 'employment_type', 'basic_salary',
      'address_line1', 'address_line2', 'address_postcode', 'address_city', 'address_state', 'address_country']) {
      expect(fields, key).not.toHaveProperty(key)
    }
  })

  // The address in six parts (2026-10-20): written whole, State → City → Postcode as one place on Malaysia's list;
  // the one-line `address` is the database's to put together, never written here.
  const addressForm = (parts: Record<string, string>) => {
    const form = new FormData()
    const all = { address_line1: '', address_line2: '', address_postcode: '', address_city: '', address_state: '', address_country: 'Malaysia', ...parts }
    for (const [key, value] of Object.entries(all)) form.set(key, value)
    return form
  }

  it('writes an address as its six parts, trimmed, a blank one NULL', async () => {
    const form = addressForm({ address_line1: ' No 83, Jalan Jambu 3 ', address_state: 'Pulau Pinang', address_city: 'Bukit Mertajam', address_postcode: '14000' })
    await expect(updateStaff('staff', form)).resolves.toEqual({ ok: true })
    const fields = update.mock.calls[0][0]
    expect(fields).toMatchObject({
      address_line1: 'No 83, Jalan Jambu 3', address_line2: null, address_state: 'Pulau Pinang',
      address_city: 'Bukit Mertajam', address_postcode: '14000', address_country: 'Malaysia',
    })
    expect(fields).not.toHaveProperty('address')
  })

  it('refuses, in words, a postcode that is not the city’s — and writes nothing', async () => {
    const form = addressForm({ address_line1: 'No 1', address_state: 'Pulau Pinang', address_city: 'Bukit Mertajam', address_postcode: '11060' })
    await expect(updateStaff('staff', form)).resolves.toEqual({
      ok: false, reason: '11060 is not a postcode of Bukit Mertajam, Pulau Pinang — pick them from the list.',
    })
    expect(update).not.toHaveBeenCalled()
  })

  it('clears an address as every part NULL', async () => {
    await expect(updateStaff('staff', addressForm({}))).resolves.toEqual({ ok: true })
    expect(update.mock.calls[0][0]).toMatchObject({
      address_line1: null, address_line2: null, address_postcode: null, address_city: null, address_state: null, address_country: null,
    })
  })

  it('files a new person’s address in its parts — abroad the three typed', async () => {
    const form = newStaffForm()
    for (const [key, value] of addressForm({ address_line1: '1 Raffles Place', address_city: 'Singapore', address_postcode: '048616', address_country: 'Singapore' })) form.set(key, value as string)
    await addStaff(form)
    expect(insert.mock.calls[0][0]).toMatchObject({
      address_line1: '1 Raffles Place', address_city: 'Singapore', address_postcode: '048616', address_state: null, address_country: 'Singapore',
    })
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

  // 2026-10-22, the user: "i want the email can be editable, for hr" — somebody
  // with a login signs in with their Contact email, so the login moves with it.
  describe('a login’s email', () => {
    const withLogin = () => query.maybeSingle.mockResolvedValueOnce({ data: { department_id: 'department', title_id: null, user_id: 'login-1' }, error: null })
    const moved = { kind: 'moved' as const, userId: 'login-1', from: 'old@example.com', to: 'new@example.com' }
    const emailForm = () => {
      const form = new FormData()
      form.set('email', 'New@Example.com')
      form.set('contact_number', '012-999 0000')
      return form
    }

    it('moves the login first, then the record and the login row take it — never the record’s own update', async () => {
      withLogin()
      moveLoginForPerson.mockResolvedValueOnce(moved)
      await expect(updateStaff('staff', emailForm())).resolves.toEqual({ ok: true })
      expect(moveLoginForPerson).toHaveBeenCalledWith('staff', 'New@Example.com')
      expect(rpc).toHaveBeenCalledWith('person_login_email_set', { p_staff: 'staff', p_email: 'new@example.com' })
      // The rest of the record as before, without the email.
      expect(update).toHaveBeenCalledWith({ contact_number: '012-999 0000' })
      expect(moveBackUnlessWritten).not.toHaveBeenCalled()
    })

    it('answers the refusal in its own words, and writes nothing — a full-access title for one', async () => {
      withLogin()
      const held = 'DIRECTOR is a full-access title (Ultimate full access): only whoever manages permissions changes its login\'s email.'
      moveLoginForPerson.mockResolvedValueOnce({ kind: 'refused', reason: held })
      await expect(updateStaff('staff', emailForm())).resolves.toEqual({ ok: false, reason: held })
      expect(rpc).not.toHaveBeenCalled()
      expect(update).not.toHaveBeenCalled()
    })

    it('asks nothing of the login before the rest of the form is checked', async () => {
      withLogin()
      const form = emailForm()
      form.set('name', '  ')
      await expect(updateStaff('staff', form)).resolves.toEqual({ ok: false, reason: 'A name is required' })
      expect(moveLoginForPerson).not.toHaveBeenCalled()
    })

    it('moves the login back when the record would not take it', async () => {
      withLogin()
      moveLoginForPerson.mockResolvedValueOnce(moved)
      rpc.mockResolvedValueOnce({ data: null, error: { code: '42501', message: 'Not open to you on this page — a box in your permissions is unticked' } })
      moveBackUnlessWritten.mockResolvedValueOnce(null)
      await expect(updateStaff('staff', emailForm())).resolves.toEqual({ ok: false, reason: 'Not open to you on this page — a box in your permissions is unticked' })
      expect(moveBackUnlessWritten).toHaveBeenCalledWith(moved, 'Save changes')
      expect(update).not.toHaveBeenCalled()

      // …and says so when the login could not be put back.
      withLogin()
      moveLoginForPerson.mockResolvedValueOnce(moved)
      rpc.mockResolvedValueOnce({ data: null, error: { code: 'XX000', message: 'internal' } })
      moveBackUnlessWritten.mockResolvedValueOnce('Their login could not be moved back — they sign in with new@example.com until it is. Try Save changes again.')
      await expect(updateStaff('staff', emailForm())).resolves.toEqual({
        ok: false,
        reason: 'Their email could not be saved. Please try again. Their login could not be moved back — they sign in with new@example.com until it is. Try Save changes again.',
      })
    })

    it('says the email stands when the rest of the record is refused after it', async () => {
      withLogin()
      moveLoginForPerson.mockResolvedValueOnce(moved)
      const q = query as { error: unknown }
      q.error = { code: '23505', message: 'duplicate key value violates unique constraint "idx_hr_staff_employee_code_active"' }
      try {
        await expect(updateStaff('staff', emailForm())).resolves.toEqual({
          ok: false,
          reason: 'Their email is saved; the rest is not. Employee code already used by another active staff',
        })
      } finally {
        q.error = null
      }
    })

    it('no login after all: the email is the record’s own, written with the rest', async () => {
      withLogin()
      moveLoginForPerson.mockResolvedValueOnce({ kind: 'none' })
      await expect(updateStaff('staff', emailForm())).resolves.toEqual({ ok: true })
      expect(rpc).not.toHaveBeenCalled()
      expect(update).toHaveBeenCalledWith({ contact_number: '012-999 0000', email: 'New@Example.com' })
    })

    it('somebody without a login keeps the record’s own email — no login is asked about', async () => {
      const form = new FormData()
      form.set('email', ' plain@example.com ')
      await expect(updateStaff('staff', form)).resolves.toEqual({ ok: true })
      expect(moveLoginForPerson).not.toHaveBeenCalled()
      expect(update).toHaveBeenCalledWith({ email: 'plain@example.com' })
    })
  })

  // 2026-10-16, the user: "it needs to be able to set report to an upline".
  it('moves the reporting line by the charts’ own writer, never inside the record’s update', async () => {
    moveReportingLine.mockResolvedValueOnce({ ok: true, mover: {}, manager: null, reportsTo: 'boss' })
    const form = new FormData()
    form.set('reports_to', 'boss')
    await expect(updateStaff('staff', form)).resolves.toEqual({ ok: true })
    expect(moveReportingLine).toHaveBeenCalledWith(expect.anything(), 'staff', 'boss')
    expect(update).not.toHaveBeenCalled()

    moveReportingLine.mockResolvedValueOnce({ ok: true, mover: {}, manager: null, reportsTo: null })
    form.set('reports_to', '')
    await updateStaff('staff', form)
    expect(moveReportingLine).toHaveBeenLastCalledWith(expect.anything(), 'staff', null)
  })

  it('answers the line’s refusal in its own words', async () => {
    moveReportingLine.mockResolvedValueOnce({ ok: false, reason: 'A cannot report to B: a Revenue Specialist cannot hold downlines.' })
    const form = new FormData()
    form.set('reports_to', 'peer')
    form.set('contact_number', '012-999 0000')
    await expect(updateStaff('staff', form)).resolves.toEqual({ ok: false, reason: 'A cannot report to B: a Revenue Specialist cannot hold downlines.' })
    // No new title rode along, so the rest waits for the line.
    expect(update).not.toHaveBeenCalled()
  })
})

// 2026-10-23 — the user: "for the employment status, i want go with permenant, part time and probation status follow by
// the hire date start"; Add Staff "will need to fill up one more, is status … then is select probation, needs to select
// with probation period".
describe('employment status — Probation, Permanent or Part time', () => {
  it('a new person is filed with their hire date, status and probation period', async () => {
    await addStaff(newStaffForm())
    expect(insert.mock.calls[0][0]).toMatchObject({ hire_date: '2026-11-02', employment_status: 'probation', probation_months: 3 })
  })

  it('Add Staff refuses a form without the hire date or the status, before any write', async () => {
    const noDate = newStaffForm()
    noDate.delete('hire_date')
    await expect(addStaff(noDate)).rejects.toThrow(/Pick the hire date/)
    const noStatus = newStaffForm()
    noStatus.set('employment_status', '')
    await expect(addStaff(noStatus)).rejects.toThrow(/Pick the employment status/)
    expect(insert).not.toHaveBeenCalled()
  })

  it('confirmed on their page: permanent, and no period left behind', async () => {
    query.maybeSingle.mockResolvedValueOnce({ data: { department_id: 'department', title_id: null, hire_date: '2026-08-01', employment_status: 'probation', probation_months: 3 }, error: null })
    const form = new FormData()
    form.set('employment_status', 'permanent')
    await expect(updateStaff('staff', form)).resolves.toEqual({ ok: true })
    expect(update).toHaveBeenCalledWith({ employment_status: 'permanent', probation_months: null })
  })

  it('put on probation with its period — refused without a hire date to count it from', async () => {
    query.maybeSingle.mockResolvedValueOnce({ data: { department_id: 'department', title_id: null, hire_date: '2026-10-05', employment_status: null, probation_months: null }, error: null })
    const form = new FormData()
    form.set('employment_status', 'probation')
    form.set('probation_months', '3')
    await expect(updateStaff('staff', form)).resolves.toEqual({ ok: true })
    expect(update).toHaveBeenCalledWith({ employment_status: 'probation', probation_months: 3 })

    query.maybeSingle.mockResolvedValueOnce({ data: { department_id: 'department', title_id: null, hire_date: null, employment_status: null, probation_months: null }, error: null })
    await expect(updateStaff('staff', form)).resolves.toEqual({ ok: false, reason: 'A probation is counted from the hire date — fill in the hire date too.' })
    expect(update).toHaveBeenCalledTimes(1)
  })

  it('a probation’s period changed alone keeps the status, and a hire date cleared under a probation is refused', async () => {
    query.maybeSingle.mockResolvedValueOnce({ data: { department_id: 'department', title_id: null, hire_date: '2026-10-05', employment_status: 'probation', probation_months: 3 }, error: null })
    const months = new FormData()
    months.set('probation_months', '6')
    await expect(updateStaff('staff', months)).resolves.toEqual({ ok: true })
    expect(update).toHaveBeenCalledWith({ employment_status: 'probation', probation_months: 6 })

    query.maybeSingle.mockResolvedValueOnce({ data: { department_id: 'department', title_id: null, hire_date: '2026-10-05', employment_status: 'probation', probation_months: 3 }, error: null })
    const cleared = new FormData()
    cleared.set('hire_date', '')
    await expect(updateStaff('staff', cleared)).resolves.toEqual({ ok: false, reason: expect.stringMatching(/counted from the hire date/) })
  })

  it('a status that is not one of the three is refused in words', async () => {
    const form = new FormData()
    form.set('employment_status', 'contract')
    await expect(updateStaff('staff', form)).resolves.toEqual({ ok: false, reason: expect.stringMatching(/Pick the employment status/) })
    expect(update).not.toHaveBeenCalled()
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
    await addStaff(newStaffForm({ bank: 'CIMB', number: '00987654' }))
    const row = insert.mock.calls[0][0]
    for (const key of ['bank_name', 'bank_account_no', 'bank_name_2', 'bank_account_no_2']) {
      expect(row).not.toHaveProperty(key)
    }
  })
})

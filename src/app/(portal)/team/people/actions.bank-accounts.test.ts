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
vi.mock('@/lib/auth', () => ({ requirePage: async () => undefined, requirePermission: gate, requireAction: gate, requireAnyAction: gate, requirePayrollPayoutsAction: gate }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
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
      await expect(updateStaff('staff', staffForm(second))).rejects.toThrow(/Account 2/)
      await expect(addStaff(staffForm(second))).rejects.toThrow(/Account 2/)
    }
    expect(insert).not.toHaveBeenCalled()
    expect(update).not.toHaveBeenCalled()
    expect(query.select).not.toHaveBeenCalled()
  })
})

describe('NRIC and bank accounts are written only where ticked (2026-10-09, PR4)', () => {
  it('refuses the edit to somebody whose title does not tick Salary amounts', async () => {
    gate.mockResolvedValue(NO_TICKS)
    await expect(updateStaff('staff', staffForm())).rejects.toThrow(/Salary amounts/)
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
    await expect(updateStaff('staff', form)).rejects.toThrow(/hidden from you/)
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

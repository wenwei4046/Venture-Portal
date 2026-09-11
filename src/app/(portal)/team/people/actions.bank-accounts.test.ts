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
vi.mock('@/lib/auth', () => ({ requirePermission: vi.fn().mockResolvedValue({ id: 'admin' }) }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
import { addStaff, updateStaff } from './actions'

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

beforeEach(() => { vi.clearAllMocks() })

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

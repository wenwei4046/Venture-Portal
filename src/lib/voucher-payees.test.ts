import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { accountDigits, isMaskedAccount, payeeAsSeen, payeeProblem, payIntoText, readVoucherPayees } from './voucher-payees'

// A payment's Pay into (2026-11-09, mig 20261109120000): optional, typed in Create payment / Edit, read through
// voucher_payees — the whole number for the Bank tick, else its last four.

describe('Pay into', () => {
  it('is optional: both blank is fine; an account is digits (spaces and dashes dropped)', () => {
    expect(payeeProblem('', '')).toBeNull()
    expect(payeeProblem('Maybank', '5140-1234 0009')).toBeNull()
    expect(accountDigits('5140-1234 0009')).toBe('514012340009')
    expect(payeeProblem('Maybank', '12.3')).toBe('An account number is digits only.')
    expect(payeeProblem('x'.repeat(121), '')).toBe('Keep the bank’s name short.')
  })

  it('reads as one line, or nothing', () => {
    expect(payIntoText({ bank: 'Maybank', account: '514012340009' })).toBe('Maybank 514012340009')
    expect(payIntoText({ bank: null, account: '•••• 0009' })).toBe('•••• 0009')
    expect(payIntoText({ bank: null, account: null })).toBeNull()
    expect(payIntoText(undefined)).toBeNull()
  })

  it('a page viewed as somebody without the Bank tick shows the last four', () => {
    expect(payeeAsSeen({ bank: 'Maybank', account: '514012340009' }, false)).toEqual({ bank: 'Maybank', account: '•••• 0009' })
    expect(payeeAsSeen({ bank: 'Maybank', account: '514012340009' }, true)).toEqual({ bank: 'Maybank', account: '514012340009' })
    expect(isMaskedAccount('•••• 0009')).toBe(true)
    expect(isMaskedAccount('514012340009')).toBe(false)
  })

  it('reads through voucher_payees; a refusal (or no reader) leaves the list without it', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [{ voucher_id: 'v1', bank: 'CIMB', account_no: '•••• 0222' }], error: null })
    const read = await readVoucherPayees({ rpc } as unknown as SupabaseClient, ['v1', 'v2'])
    expect(rpc).toHaveBeenCalledWith('voucher_payees', { p_ids: ['v1', 'v2'] })
    expect([...read]).toEqual([['v1', { bank: 'CIMB', account: '•••• 0222' }]])

    const refused = vi.fn().mockResolvedValue({ data: null, error: { message: 'no' } })
    expect((await readVoucherPayees({ rpc: refused } as unknown as SupabaseClient, ['v1'])).size).toBe(0)
    expect((await readVoucherPayees({} as unknown as SupabaseClient, ['v1'])).size).toBe(0)
    expect((await readVoucherPayees({ rpc } as unknown as SupabaseClient, [])).size).toBe(0)
  })
})

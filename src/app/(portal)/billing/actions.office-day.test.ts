import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { inTimeZoneAsync } from '@/test/time-zone'
import { recordingSupabase, type RecordedCall } from '@/test/recording-supabase'

// 2026-10-08: invoices and credit notes took "today" and "this month" from the
// SERVER's clock, which keeps UTC. At 00:30 on 1 November in the office a
// copied invoice was filed under October and dated 31 October, a credit note
// was numbered as October's, and its approval was refused if October was
// already closed — and posted, if not, into October.

const mocks = vi.hoisted(() => ({ requirePermission: vi.fn(), createClient: vi.fn(), redirect: vi.fn() }))
vi.mock('@/lib/auth', () => ({ requirePage: async () => undefined, requirePermission: mocks.requirePermission, requireAction: mocks.requirePermission, requireAnyAction: mocks.requirePermission, requirePayrollPayoutsAction: mocks.requirePermission }))
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }))
vi.mock('next/navigation', () => ({ redirect: mocks.redirect }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { approveCreditNote, copyInvoice, createCreditNote } from './actions'

const INVOICE = {
  id: 'inv-1', invoice_no: 'HV-INV-202610-0101', status: 'issued', company_id: 'co-1', total_amount: 1000,
  billing_mode: 'venture_attribution', billable_to_type: 'subsidiary', billable_to_department_id: null,
  billable_to_freetext_name: null, billable_to_freetext_address: null, billable_to_freetext_phone: null,
  billable_to_freetext_email: null, category_code: '5011', base_amount: 1000, description: 'Office rental', reference_no: null,
}
const CREDIT_NOTE = { id: 'cn-1', credit_note_no: 'HV-CN-202610-0003', invoice_id: 'inv-1', amount: 100, reason: 'Discount', status: 'draft', billing_mode: 'venture_attribution', category_code: '5999' }

/** October is closed; November is open. */
function database() {
  const db = recordingSupabase(
    (call: RecordedCall) => {
      if (call.table === 'period_locks') {
        const month = call.chain.find(([m, col]) => m === 'eq' && col === 'period_month')?.[2]
        return { data: month === '2026-10-01' ? { id: 'october-closed' } : null }
      }
      if (call.op === 'insert') return { data: { id: 'new-row' } }
      if (call.table === 'credit_notes' && call.op === 'update') return { data: [{ id: 'cn-1' }] }
      if (call.table === 'credit_notes' && call.single) return { data: CREDIT_NOTE }
      if (call.table === 'invoices' && call.single) return { data: INVOICE }
      return { data: [] }
    },
    (fn) => {
      if (fn === 'mint_invoice_no') return { data: 'HV-INV-202611-0001' }
      if (fn === 'mint_credit_note_no') return { data: 'HV-CN-202611-0001' }
      if (fn === 'post_journal_entry_as_caller') return { data: 'je-1' }
      return {}
    },
  )
  mocks.createClient.mockResolvedValue(db.client)
  return db
}

const form = (fields: Record<string, string>) => {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) fd.set(k, v)
  return fd
}
const asTheServer = <T,>(fn: () => Promise<T>) => inTimeZoneAsync('UTC', fn)

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requirePermission.mockResolvedValue({ id: 'finance-user', role: 'principal', permissions: ['billing', 'override'] })
  mocks.redirect.mockImplementation(() => { throw new Error('NEXT_REDIRECT') })
  vi.useFakeTimers({ now: new Date('2026-10-31T16:30:00Z'), toFake: ['Date'] }) // 00:30 on 1 Nov in the office
})
afterEach(() => vi.useRealTimers())

describe("billing at half past midnight on the 1st is November's", () => {
  it('a copied invoice is a November draft, dated 1 Nov, numbered for November', async () => {
    const db = database()
    await expect(asTheServer(() => copyInvoice(form({ invoice_id: 'inv-1' })))).rejects.toThrow('NEXT_REDIRECT')
    expect(db.rpcs.find((r) => r.fn === 'mint_invoice_no')?.args).toEqual({ p_period: '2026-11-01' })
    expect(db.writes('invoices')[0].values).toMatchObject({ period_month: '2026-11-01', invoice_date: '2026-11-01' })
  })

  it("a credit note's number is minted for the office's day", async () => {
    const db = database()
    await asTheServer(() => createCreditNote(form({ invoice_id: 'inv-1', amount: '100', reason: 'Discount' })))
    expect(db.rpcs.find((r) => r.fn === 'mint_credit_note_no')?.args).toEqual({ p_period: '2026-11-01' })
  })

  it("approving a credit note is not stopped by October's close, and posts on 1 Nov", async () => {
    const db = database()
    await asTheServer(() => approveCreditNote(form({ id: 'cn-1' })))
    expect(db.rpcs.find((r) => r.fn === 'post_journal_entry_as_caller')?.args).toMatchObject({ p_transaction_date: '2026-11-01' })
  })
})

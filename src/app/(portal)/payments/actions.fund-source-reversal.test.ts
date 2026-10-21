import { beforeEach, describe, expect, it, vi } from 'vitest'
import { recordingSupabase, type RecordedCall } from '@/test/recording-supabase'

// 2026-10-21 (the user: "A：一起删+重开"): Reverse payment on a paid fund-source
// repayment voucher put the bank, the GL and the pools back but left the fund
// source's repayment rows. It deleted them through the session's client, and
// fund_source_repayments refuses every session's DELETE (fsr_no_delete USING
// (false)) — nothing went and nothing said so: the source still read repaid,
// and the corrected voucher was refused ("Cannot repay fund source with status
// repaid"). The rows go through reverse_voucher_fund_source_repayments now
// (mig 20261021230000), once the voucher is voided; it also reopens the source.

const mocks = vi.hoisted(() => ({ requireActionOn: vi.fn(), createClient: vi.fn() }))
vi.mock('@/lib/auth', () => ({ requirePage: async () => undefined, requirePermission: mocks.requireActionOn, requireActionOn: mocks.requireActionOn, requireAnyActionOn: mocks.requireActionOn, requirePayrollPayoutsActionOn: mocks.requireActionOn, requireApproverOn: mocks.requireActionOn }))
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }))
vi.mock('next/navigation', () => ({ redirect: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { reversePaidPayment } from './actions'

// HV-PV-202608-0295 (production): HOUZS Century's RM 98,000 fund source repaid in
// full on 20 Aug 2026 with RM 1,960 interest, out of Hong Leong, from the Venture Pool.
const PV = 'fb260046-9a1e-4b0f-b4ec-8400ed54d796'
const SOURCE = '89b09736-af77-40b2-a9df-90e2312e4394'
const VOUCHER = {
  id: PV, voucher_no: 'HV-PV-202608-0295', direction: 'debit', voucher_type: 'expense', status: 'paid',
  amount: 99960, bank_account_id: 'bank-hl', invoice_id: null, fund_source_id: SOURCE, loan_id: null,
  reference_type: null, payment_method: 'bank_transfer', payment_date: '2026-08-20',
}
const ENTRIES = [
  { id: 'je-0534', entry_no: 'JE-202608-0534', segment: 'corporate', description: 'PV HV-PV-202608-0295: Repay for Machinery Loan [venture_pool]' },
  { id: 'je-0535', entry_no: 'JE-202608-0535', segment: 'corporate', description: 'PV HV-PV-202608-0295: Repay for Machinery Loan [venture_pool]' },
]
const LINES: Record<string, unknown[]> = {
  'je-0534': [
    { account_code: '4052', debit: 98000, credit: null, description: 'expense - HOUZS Century (venture_pool)' },
    { account_code: '3000', debit: null, credit: 98000, description: 'Bank payment - HV-PV-202608-0295 (venture_pool)' },
  ],
  'je-0535': [
    { account_code: '6000', debit: 1960, credit: null, description: 'expense - HOUZS Century (venture_pool)' },
    { account_code: '3000', debit: null, credit: 1960, description: 'Bank payment - HV-PV-202608-0295 (venture_pool)' },
  ],
}

const eqOf = (call: RecordedCall, column: string) => call.chain.find(([m, c]) => m === 'eq' && c === column)?.[2]

/**
 * The database as the session meets it: the voucher, its entries, and the two rows
 * approval synced to the fund source. A session's DELETE on fund_source_repayments
 * answers as production's row policy does — no error, no row removed; only the
 * database's own step removes them. `steps` lists every query and rpc in the order
 * they were sent.
 */
function production(voucher: Record<string, unknown> = VOUCHER, stepError?: string) {
  const rows = [
    { id: 'fsr-interest', fund_source_id: SOURCE, payment_type: 'interest', amount: 1960, payment_voucher_id: PV },
    { id: 'fsr-principal', fund_source_id: SOURCE, payment_type: 'principal', amount: 98000, payment_voucher_id: PV },
  ]
  const steps: string[] = []
  const db = recordingSupabase(
    (call) => {
      steps.push(`${call.op} ${call.table}`)
      if (call.table === 'payment_vouchers' && call.op === 'select') return { data: voucher }
      if (call.table === 'journal_entries') return { data: ENTRIES }
      if (call.table === 'journal_lines') return { data: LINES[eqOf(call, 'entry_id') as string] ?? [] }
      if (call.table === 'invoices' && call.op === 'select') return { data: [] }
      return { data: null }
    },
    (fn, args) => {
      steps.push(`rpc ${fn}`)
      if (fn === 'post_journal_entry_as_caller') return { data: `reversal-${steps.length}` }
      if (fn === 'reverse_voucher_fund_source_repayments') {
        if (stepError) return { error: { message: stepError } }
        const gone = rows.filter((r) => r.payment_voucher_id === (args as { p_voucher_id: string }).p_voucher_id)
        for (const r of gone) rows.splice(rows.indexOf(r), 1)
        return { data: gone.length }
      }
      return {}
    },
  )
  return { db, rows, steps }
}

const form = (id: string) => {
  const fd = new FormData()
  fd.set('id', id)
  return fd
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requireActionOn.mockResolvedValue({ id: 'finance-user', role: 'finance', permissions: ['treasury'] })
})

describe('Reverse payment on a fund-source repayment voucher', () => {
  it('leaves none of the voucher’s repayment rows on the fund source', async () => {
    const { db, rows } = production()
    mocks.createClient.mockResolvedValue(db.client)

    await reversePaidPayment(form(PV))

    expect(rows.filter((r) => r.payment_voucher_id === PV)).toEqual([])
  })

  it('never asks the session to delete them — the table refuses that to everybody, without a word', async () => {
    const { db } = production()
    mocks.createClient.mockResolvedValue(db.client)

    await reversePaidPayment(form(PV))

    expect(db.writes('fund_source_repayments')).toEqual([])
    expect(db.rpcs.filter((r) => r.fn === 'reverse_voucher_fund_source_repayments').map((r) => r.args)).toEqual([{ p_voucher_id: PV }])
  })

  it('removes them once the voucher is voided, after the bank, the GL and the pools are back', async () => {
    const { db, steps } = production()
    mocks.createClient.mockResolvedValue(db.client)

    await reversePaidPayment(form(PV))

    const at = (step: string) => steps.indexOf(step)
    expect(at('rpc reverse_voucher_fund_source_repayments')).toBeGreaterThan(at('update payment_vouchers'))
    expect(at('update payment_vouchers')).toBeGreaterThan(at('rpc reverse_voucher_pool_rows'))
    expect(db.rpcs.filter((r) => r.fn === 'bump_bank_balance').map((r) => r.args)).toEqual([{ p_bank_account_id: 'bank-hl', p_delta: 99960 }])
    expect(db.rpcs.filter((r) => r.fn === 'post_journal_entry_as_caller')).toHaveLength(2)
    expect(db.writes('payment_vouchers').map((w) => w.values)).toEqual([{ status: 'voided' }])
  })

  it('says so when the database refuses the step — never a voided voucher whose rows quietly stay', async () => {
    const { db, rows } = production(VOUCHER, 'Not open to you on this page — a box in your permissions is unticked')
    mocks.createClient.mockResolvedValue(db.client)

    await expect(reversePaidPayment(form(PV))).rejects.toThrow(
      /HV-PV-202608-0295.*voided.*fund-source repayments.*Not open to you on this page/,
    )
    expect(rows).toHaveLength(2)
  })

  it('a voucher with no fund source asks for no such step', async () => {
    const { db } = production({ ...VOUCHER, id: 'pv-ads', voucher_no: 'HV-PV-202610-0400', fund_source_id: null, amount: 1200 })
    mocks.createClient.mockResolvedValue(db.client)

    await reversePaidPayment(form('pv-ads'))

    expect(db.rpcs.map((r) => r.fn)).not.toContain('reverse_voucher_fund_source_repayments')
    expect(db.writes('payment_vouchers').map((w) => w.values)).toEqual([{ status: 'voided' }])
  })
})

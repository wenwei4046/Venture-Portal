import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { recordingSupabase } from '@/test/recording-supabase'

// Payment request's Create PV (2026-10-29, PR ②): the voucher Create payment makes, filled in from the staff requests;
// then the requests tied to it — each split's Bill back? answered in the window kept, each Yes split's invoice drafted
// in the same database step — then their receipts carried onto it. Refused before the voucher, nothing is written;
// refused at the tie, the draft is voided again.

const mocks = vi.hoisted(() => ({ requireActionOn: vi.fn(), mayActOn: vi.fn(), createClient: vi.fn(), redirect: vi.fn(), copyTo: vi.fn() }))
vi.mock('@/lib/auth', () => ({
  requirePage: async () => undefined,
  requirePermission: mocks.requireActionOn,
  requireActionOn: mocks.requireActionOn,
  requireAnyActionOn: mocks.requireActionOn,
  requireApproverOn: mocks.requireActionOn,
  requirePayrollPayoutsActionOn: mocks.requireActionOn,
  mayActOn: mocks.mayActOn,
}))
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }))
vi.mock('next/navigation', () => ({ redirect: mocks.redirect }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { createPaymentForRequests } from './actions'

const SPLIT = '22222222-2222-4222-8222-222222222222'
const READY = {
  requests: [{ id: 'r1', requestNo: 'PRQ-2610-0001', status: 'with_finance', files: [{ id: 'f1' }],
    shares: [{ id: SPLIT, party: 'company', companyName: 'Dream Crafter', amount: 100, billBack: null }] }],
  files: [{ id: 'f1', path: 'u1/k/Receipt.pdf', name: 'Receipt (Oct).pdf', contentType: 'application/pdf', size: 900 }],
}
const YES = JSON.stringify([{ share: SPLIT, billBack: true, category: '9087' }])
const NO = JSON.stringify([{ share: SPLIT, billBack: false }])

function database(rpc: (fn: string) => { data?: unknown; error?: { message: string } | null } = () => ({})) {
  const db = recordingSupabase(
    (call) => {
      if (call.table === 'payment_vouchers' && call.op === 'insert') return { data: { id: 'pv-new' } }
      if (call.table === 'payment_vouchers' && call.op === 'update') return { data: [{ id: 'pv-new' }] }
      if (call.table === 'payment_vouchers' && call.op === 'select' && call.single) {
        return { data: { id: 'pv-new', voucher_no: 'HV-PV-202610-0700', description: 'Claim · Claude', amount: 453.79, status: 'draft' } }
      }
      if (call.table === 'payment_vouchers' && call.op === 'select') return { count: 699 }
      return {}
    },
    (fn) => {
      const own = rpc(fn)
      if (own.data !== undefined || own.error) return own
      if (fn === 'payment_requests_for_pv') return { data: READY }
      if (fn === 'payment_requests_attach_pv') return { data: { invoices: [] } }
      return {}
    },
  )
  const client = db.client as unknown as Record<string, unknown>
  client.storage = { from: (bucket: string) => ({ copyTo: (...args: unknown[]) => mocks.copyTo(bucket, ...args) }) }
  mocks.createClient.mockResolvedValue(client)
  return db
}

function form(over: Record<string, string> = {}) {
  const f = new FormData()
  const fields: Record<string, string> = {
    direction: 'debit', voucher_type: 'expense', reference_type: '', reference_id: '', payee_name: 'KHO WEI JIE', payee_company_id: '',
    bank_account_id: 'bank-hl', amount: '453.79', payment_date: '2026-10-29', payment_method: 'bank_transfer', description: 'Claim · Claude',
    notes: 'From Payment request · PRQ-2610-0001', target_pool: '', source_rows_count: '1', 'source_rows[0][pool]': 'dept_pool_marketing',
    'source_rows[0][amount]': '453.79', 'source_rows[0][account_code]': '9087', source_pool: 'dept_pool_marketing', attachment_count: '0',
    payment_request_ids: JSON.stringify(['11111111-1111-4111-8111-111111111111']),
    payment_request_bill: NO,
    ...over,
  }
  for (const [k, v] of Object.entries(fields)) f.set(k, v)
  return f
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requireActionOn.mockResolvedValue({ id: 'fin', role: 'finance', permissions: ['treasury', 'billing'] })
  mocks.mayActOn.mockResolvedValue(true)
  mocks.copyTo.mockResolvedValue({ data: { path: 'x' }, error: null })
  mocks.redirect.mockImplementation(() => {
    throw new Error('NEXT_REDIRECT')
  })
  vi.useFakeTimers({ now: new Date('2026-10-29T07:00:00Z'), toFake: ['Date'] })
})
afterEach(() => vi.useRealTimers())

describe('createPaymentForRequests', () => {
  it('makes the voucher as any other, ties the requests to it with each split’s answer, carries their receipts — answered in words', async () => {
    const db = database()
    const res = await createPaymentForRequests(form({ payment_request_bill: YES }))
    expect(res).toEqual({ ok: true, id: 'pv-new', voucherNo: 'HV-PV-202610-0700', submitted: false })
    expect(mocks.requireActionOn).toHaveBeenCalledWith('/payments/requests', 'treasury', 'create')
    expect(mocks.mayActOn).toHaveBeenCalledWith(['/ba', '/billing-allocator', '/statements'], 'billing', 'create')
    // Asked first; tied once the voucher is made (the voucher's own reads — its receivable's account — between).
    const ours = db.rpcs.filter((r) => r.fn.startsWith('payment_requests'))
    expect(ours.map((r) => r.fn)).toEqual(['payment_requests_for_pv', 'payment_requests_attach_pv'])
    expect(ours[1].args).toEqual({
      p_ids: ['11111111-1111-4111-8111-111111111111'], p_pv: 'pv-new', p_bill: [{ share: SPLIT, billBack: true, category: '9087' }],
    })
    expect(db.writes('payment_vouchers')[0].values).toMatchObject({ notes: 'From Payment request · PRQ-2610-0001', payee_name: 'KHO WEI JIE' })
    expect(mocks.copyTo).toHaveBeenCalledWith('payment-request-files', 'payment-attachments', 'u1/k/Receipt.pdf', expect.stringMatching(/^pv-new\/[0-9a-f-]{36}-Receipt__Oct_\.pdf$/))
    expect(db.writes('payment_attachments')[0].values).toMatchObject({
      voucher_id: 'pv-new', file_name: 'Receipt (Oct).pdf', file_type: 'application/pdf', file_size: 900, description: 'From PRQ-2610-0001', uploaded_by: 'fin',
    })
  })

  it('a request no longer with Finance stops it before anything is written', async () => {
    const db = database((fn) => (fn === 'payment_requests_for_pv' ? { error: { message: 'PRQ-2610-0001 is no longer waiting for Finance.' } } : {}))
    const res = await createPaymentForRequests(form())
    expect(res).toEqual({ ok: false, reason: 'PRQ-2610-0001 is no longer waiting for Finance.' })
    expect(db.writes('payment_vouchers')).toHaveLength(0)
  })

  it('a split without its Bill back answer stops it before the voucher — an answer missing its Yes/No counts as none', async () => {
    const db = database()
    for (const bill of ['[]', JSON.stringify([{ share: SPLIT, category: '9087' }])]) {
      expect(await createPaymentForRequests(form({ payment_request_bill: bill }))).toEqual({
        ok: false, reason: 'Each split’s Bill back is needed — close the window and Create PV again.',
      })
    }
    expect(db.writes('payment_vouchers')).toHaveLength(0)
    expect(db.rpcs.map((r) => r.fn)).not.toContain('payment_requests_attach_pv')
  })

  it('a split already invoiced is not asked again', async () => {
    const invoiced = { ...READY, requests: [{ ...READY.requests[0], shares: [{ ...READY.requests[0].shares[0], billBack: true, invoiceNo: 'HV-INV-202610-0091', invoiceStatus: 'draft' }] }] }
    const db = database((fn) => (fn === 'payment_requests_for_pv' ? { data: invoiced } : {}))
    const res = await createPaymentForRequests(form({ payment_request_bill: '[]' }))
    expect(res).toMatchObject({ ok: true, voucherNo: 'HV-PV-202610-0700' })
    expect(db.rpcs.find((r) => r.fn === 'payment_requests_attach_pv')?.args).toMatchObject({ p_bill: [] })
  })

  it('a bill back without Invoice · Create is refused before the voucher; a No needs no Invoice right', async () => {
    mocks.mayActOn.mockResolvedValue(false)
    const db = database()
    const res = await createPaymentForRequests(form({ payment_request_bill: YES }))
    expect(res).toEqual({ ok: false, reason: 'Billing back needs Invoice · Create — answer No, or ask for it.' })
    expect(db.writes('payment_vouchers')).toHaveLength(0)
    expect(await createPaymentForRequests(form({ payment_request_bill: NO }))).toMatchObject({ ok: true, voucherNo: 'HV-PV-202610-0700' })
    expect(mocks.mayActOn).toHaveBeenCalledTimes(1)
    expect(db.rpcs.find((r) => r.fn === 'payment_requests_attach_pv')?.args).toMatchObject({ p_bill: [{ share: SPLIT, billBack: false }] })
  })

  it('refused at the tie: the draft voucher is voided again, nothing kept, said in words', async () => {
    const db = database((fn) => (fn === 'payment_requests_attach_pv' ? { error: { message: 'Period Oct 2026 is closed — its invoices cannot be drafted. Contact Principal to reopen.' } } : {}))
    const res = await createPaymentForRequests(form())
    expect(res).toEqual({ ok: false, reason: 'Period Oct 2026 is closed — its invoices cannot be drafted. Contact Principal to reopen — HV-PV-202610-0700 was voided, nothing kept.' })
    expect(db.writes('payment_vouchers').find((w) => w.op === 'update')?.values).toEqual({ status: 'voided' })
    expect(mocks.copyTo).not.toHaveBeenCalled()
  })

  it('a receipt that could not be carried over is said; the voucher stands', async () => {
    mocks.copyTo.mockResolvedValue({ data: null, error: { name: 'StorageError', message: 'The file could not be copied. Please try again.', status: 502 } })
    const db = database()
    const res = await createPaymentForRequests(form({ submit: '1' }))
    expect(res).toMatchObject({ ok: true, voucherNo: 'HV-PV-202610-0700', submitted: true, note: 'HV-PV-202610-0700 submitted. A receipt could not be carried over — add it on the voucher.' })
    expect(db.writes('payment_attachments')).toHaveLength(0)
    expect(db.writes('approval_requests')[0].values).toMatchObject({ request_type: 'payment_voucher', reference_id: 'pv-new' })
  })

  it('names its requests, or makes nothing', async () => {
    const db = database()
    expect(await createPaymentForRequests(form({ payment_request_ids: '[]' }))).toEqual({ ok: false, reason: 'Which requests? Reload the page and try again.' })
    expect(await createPaymentForRequests(form({ payment_request_ids: 'not json' }))).toEqual({ ok: false, reason: 'Which requests? Reload the page and try again.' })
    expect(db.rpcs).toHaveLength(0)
  })
})

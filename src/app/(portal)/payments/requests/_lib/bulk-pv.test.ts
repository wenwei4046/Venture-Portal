import { describe, expect, it } from 'vitest'
import { parseRequest, type PaymentRequest } from '@/lib/payment-requests/model'
import { bulkTotal, bulkVouchers, runWords, voucherForm, voucherProblem, voucherTotal, type BulkVoucher } from './bulk-pv'

// Create payments (2026-10-29, PR ④): a block a PV, each filled in as Create PV fills its window; what each still
// needs; the form each voucher is saved with; what the run says.

const raw = (over: Record<string, unknown> = {}) => ({
  id: 'r1', requestNo: 'PRQ-2610-0001', status: 'with_finance', kind: 'claim', mine: false, requesterName: 'KHO WEI JIE',
  departmentId: 'mk', departmentName: 'Marketing', pool: 'dept_pool_marketing', payToSalary: true, payeeName: 'KHO WEI JIE',
  payeeBank: 'Hong Leong Bank', payeeAccount: '•••• 4821', description: 'Claude · Oct', total: '453.79',
  submittedAt: '2026-10-29T02:00:00Z', items: [{ id: 'i1', description: 'Claude · Oct', amount: 453.79 }], shares: [],
  files: [{ id: 'f1', kind: 'receipt', name: 'Receipt.pdf', contentType: 'application/pdf', size: 900 }],
  ...over,
})
const req = (over: Record<string, unknown> = {}) => parseRequest(raw(over)) as PaymentRequest

const kho1 = req()
const kho2 = req({ id: 'r2', requestNo: 'PRQ-2610-0002', submittedAt: '2026-10-29T03:00:00Z', items: [{ id: 'i2', description: 'ChatGPT · Oct', amount: 99.9 }] })
const sia = req({
  id: 'r3', requestNo: 'PRQ-2610-0003', requesterName: 'SIA JOSIAH', payeeName: 'SIA JOSIAH', payeeBank: 'Maybank', payeeAccount: '•••• 3307',
  description: 'Notion · Aug + Sep', total: '324.91', items: [{ id: 'i3', description: 'Notion · Aug + Sep', amount: 324.91 }],
  shares: [{ id: 's1', party: 'company', companyId: 'dc', companyName: 'Dream Crafter', amount: 108.3, billBack: null }],
})

const filled = (v: BulkVoucher, account = '9081'): BulkVoucher => ({ ...v, lines: v.lines.map((l) => ({ ...l, account })) })

describe('the blocks', () => {
  it('fills each PV as Create PV fills its window — its lines on the department’s pool, the category left to Finance', () => {
    const [kho, s] = bulkVouchers([[kho1, kho2], [sia]], new Set(['r1', 'r3']))
    expect([kho.key, kho.start.payee, kho.requests, kho.added, kho.description]).toEqual(['r1,r2', 'KHO WEI JIE', 2, ['PRQ-2610-0002'], '2 requests · KHO WEI JIE'])
    expect(kho.lines).toEqual([
      { requestId: 'r1', description: 'Claude · Oct', pool: 'dept_pool_marketing', account: '', amount: '453.79' },
      { requestId: 'r2', description: 'ChatGPT · Oct', pool: 'dept_pool_marketing', account: '', amount: '99.90' },
    ])
    expect([s.added, s.description, s.start.splits.map((x) => x.who), s.answers]).toEqual([[], 'Claim · Notion · Aug + Sep', ['Dream Crafter'], {}])
    expect([voucherTotal(kho), bulkTotal([kho, s])]).toEqual([553.69, 878.6])
  })

  it('waits for each line’s category and each split’s Bill back; a Yes needs Invoice · Create and a line of its request', () => {
    const [, s] = bulkVouchers([[kho1], [sia]], new Set(['r1', 'r3']))
    expect(voucherProblem(s, true)).toBe('Each line’s pool, category, amount and each split’s Bill back are needed.')
    expect(voucherProblem({ ...filled(s), answers: { s1: false } }, false)).toBeNull()
    expect(voucherProblem({ ...filled(s), answers: { s1: true } }, false)).toBe('Billing back needs Invoice · Create — answer No, or ask for it.')
    expect(voucherProblem({ ...filled(s), answers: { s1: true } }, true)).toBeNull()
    expect(voucherProblem({ ...filled(s), description: ' ', answers: { s1: false } }, true)).toBe('A description is needed.')
  })
})

describe('the form each voucher is saved with', () => {
  it('is Create PV’s for its requests — a draft, the bank, date and method set once, each split’s answer', () => {
    const [s] = bulkVouchers([[sia]], new Set(['r3']))
    const fd = voucherForm({ ...filled(s, '9087'), answers: { s1: true } }, { bankId: 'bank-hl', date: '2026-10-29', method: 'bank_transfer' })
    expect(Object.fromEntries(fd.entries())).toEqual({
      direction: 'debit', voucher_type: 'expense', reference_type: '', reference_id: '', payee_name: 'SIA JOSIAH', payee_company_id: '',
      bank_account_id: 'bank-hl', amount: '324.91', payment_date: '2026-10-29', payment_method: 'bank_transfer', description: 'Claim · Notion · Aug + Sep',
      notes: 'From Payment request · PRQ-2610-0003', target_pool: '', source_rows_count: '1', 'source_rows[0][pool]': 'dept_pool_marketing',
      'source_rows[0][amount]': '324.91', 'source_rows[0][account_code]': '9087', 'source_rows[0][description]': 'Notion · Aug + Sep',
      source_pool: 'dept_pool_marketing', attachment_count: '0', payment_request_ids: '["r3"]',
      payment_request_bill: JSON.stringify([{ share: 's1', billBack: true, category: '9087' }]),
    })
    expect(fd.get('submit')).toBeNull()
  })
})

describe('what the run says', () => {
  const made = (id: string, voucherNo: string, payee: string, note?: string) => ({ key: id, payee, id, voucherNo, ...(note ? { note } : {}) })

  it('all made and sent together: a line to flash, nothing to read', () => {
    const run = { made: [made('v1', 'HV-PV-202610-0700', 'KHO WEI JIE'), made('v2', 'HV-PV-202610-0701', 'SIA JOSIAH')], refused: [], submit: true, sent: ['v1', 'v2'], notSent: [] }
    expect(runWords(run)).toMatchObject({ clean: true, flash: '2 PVs submitted together — with the Principal' })
    expect(runWords({ ...run, submit: false, sent: [] })).toMatchObject({ clean: true, flash: '2 PVs saved as drafts' })
    expect(runWords({ ...run, made: run.made.slice(0, 1), sent: ['v1'] })).toMatchObject({ flash: 'HV-PV-202610-0700 submitted — waiting for Principal' })
  })

  it('one refused, one not sent, a receipt not carried: each said, the window kept open', () => {
    const out = runWords({
      made: [made('v1', 'HV-PV-202610-0700', 'KHO WEI JIE'), made('v2', 'HV-PV-202610-0701', 'SIA JOSIAH', 'A receipt could not be carried over — add it on the voucher.')],
      refused: [{ key: 'r9', payee: 'LI SEAN', reason: 'A request is no longer waiting for Finance — reload and try again.' }],
      submit: true,
      sent: ['v2'],
      notSent: [{ id: 'v1', reason: 'Failed to submit for approval: timeout' }],
    })
    expect(out.clean).toBe(false)
    expect(out.lines).toEqual([
      { text: 'HV-PV-202610-0700 · KHO WEI JIE — saved as a draft — not sent: Failed to submit for approval: timeout', bad: true },
      { text: 'HV-PV-202610-0701 · SIA JOSIAH — submitted. A receipt could not be carried over — add it on the voucher.', bad: true },
      { text: 'LI SEAN — not made: A request is no longer waiting for Finance — reload and try again.', bad: true },
    ])
  })
})

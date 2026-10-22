import { describe, expect, it } from 'vitest'
import { buildQueueRows, queueSummary, type ApprovalRequestRow } from '@/lib/approval-queue'
import { approvalHubModel, approvalRecordModel, decidedRows, groupTitle, inApp, pendingRows, recordLinks, recordOf, waitLabel } from './approval-model'

// The Finance phone app's Approvals (2026-10-15, part 5): the queue's own
// figures, shaped as the app's hub, lists, combined requests and a request's
// record. Each card counts and sums exactly what its list holds.

const req = (over: Partial<ApprovalRequestRow> & { id: string }): ApprovalRequestRow => ({
  request_type: 'payment_voucher',
  description: `HV-PV-202610-${over.id}: Office rental`,
  amount: 1000,
  reference_id: `v-${over.id}`,
  reference_table: 'payment_vouchers',
  submitted_by: 'u-carrie',
  group_id: null,
  created_at: '2026-10-14T01:00:00Z',
  approved_at: null,
  status: 'pending',
  ...over,
})

const names: Record<string, string> = { 'u-carrie': 'Carrie', 'u-joan': 'Joan', 'u-boss': 'Principal' }
const opts = { amountOf: (r: ApprovalRequestRow) => (r.amount === null ? null : Number(r.amount)), nameOf: (id: string) => names[id] ?? 'Unknown' }

const PENDING: ApprovalRequestRow[] = [
  req({ id: '0471', created_at: '2026-10-10T02:00:00Z' }),
  req({ id: '0475', description: 'HV-PV-202610-0475: Loan disbursement to Carres', amount: 50000, group_id: 'g-loan', submitted_by: 'u-joan' }),
  req({ id: 'ln1', request_type: 'new_loan', description: 'New loan to Carres', amount: 50000, reference_id: 'loan-1', reference_table: 'loans', group_id: 'g-loan', submitted_by: 'u-joan' }),
  req({ id: 'p1', description: 'HV-PV-202610-0480: Payroll disbursement Sep 2026 — Aina', amount: 3200, group_id: 'g-pay' }),
  req({ id: 'p2', description: 'HV-PV-202610-0481: Payroll disbursement Sep 2026 — Bala', amount: 2800, group_id: 'g-pay' }),
]

describe('pendingRows', () => {
  const queue = buildQueueRows(PENDING, opts)
  const rows = pendingRows(queue, { 'g:g-loan': 'You raised it — somebody else decides it' }, new Set(['u-carrie']))

  it('one row a request, a combined approval one row — no number in the line, who and when under it (the kind only when not a payment voucher)', () => {
    expect(rows[1].desc).toBe('Combined · 2 · New loan + PV · Joan · 14 Oct')
    expect(rows.map((r) => r.key)).toEqual(['0471', 'g:g-loan', 'g:g-pay'])
    expect(rows[0]).toMatchObject({ title: 'Office rental', desc: 'Carrie · 10 Oct', amount: 1000, no: 'HV-PV-202610-0471', why: null, executive: true })
    expect(rows[2]).toMatchObject({ title: 'Payroll disbursement Sep 2026', desc: 'Combined · 2 · Carrie · 14 Oct', amount: 6000 })
  })

  it('says why a row is not this reader’s to decide', () => {
    expect(rows[1].why).toBe('You raised it — somebody else decides it')
  })

  it('a combined approval of vouchers only is decided voucher by voucher; one a loan rides along with is not', () => {
    expect(rows[2].splittable).toBe(true)
    expect(rows[1].splittable).toBe(false)
    // The loan's disbursement is the same money as the loan: the row counts the voucher once.
    expect(rows[1].amount).toBe(50000)
    expect(rows[1].members.map((m) => [m.label, m.open])).toEqual([
      ['Loan disbursement to Carres', { hub: 'payments', id: 'v-0475' }],
      ['New loan to Carres', { hub: 'fund-out', id: 'loan-1' }],
    ])
  })
})

describe('decidedRows', () => {
  const DECIDED: ApprovalRequestRow[] = [
    req({ id: 'd1', status: 'approved', approved_at: '2026-10-15T03:00:00Z' }),
    req({ id: 'p1', description: 'HV-PV-202610-0480: Payroll disbursement Sep 2026 — Aina', amount: 3200, group_id: 'g-pay', status: 'approved', approved_at: '2026-10-14T03:00:00Z' }),
    req({ id: 'p2', description: 'HV-PV-202610-0481: Payroll disbursement Sep 2026 — Bala', amount: 2800, group_id: 'g-pay', status: 'rejected', approved_at: '2026-10-14T03:00:00Z' }),
    req({ id: 'd2', request_type: 'new_fund_source', description: 'Fund in from Mr Liang', amount: 80000, reference_id: 'fs-1', reference_table: 'fund_sources', status: 'rejected', approved_at: '2026-10-13T03:00:00Z' }),
  ]
  const rows = decidedRows(DECIDED, opts)

  it('folds a combined approval into one row, its members counted, how each went kept', () => {
    expect(rows.map((r) => [r.key, r.items])).toEqual([
      ['d1', 1],
      ['g:g-pay', 2],
      ['d2', 1],
    ])
    expect(rows[1]).toMatchObject({ title: 'Payroll disbursement Sep 2026', decision: null, amount: 6000, desc: 'Combined · 2 · 1 approved · 1 rejected · Carrie · 14 Oct' })
    expect(rows[1].members.map((m) => m.decision)).toEqual(['approved', 'rejected'])
  })

  it('a single decision says how it went first, and opens its own record where it has one', () => {
    expect(rows[0].desc).toBe('Approved · Carrie · 15 Oct')
    expect(rows[2]).toMatchObject({ decision: 'rejected', desc: 'Rejected · New fund source · Carrie · 13 Oct' })
    expect(rows[2].members[0].open).toEqual({ hub: 'fund-in', id: 'fs-1' })
  })
})

describe('approvalHubModel', () => {
  const queue = buildQueueRows(PENDING, opts)
  const summary = queueSummary(queue, new Date('2026-10-15T04:00:00Z'), new Set(['u-carrie']))
  const decided = decidedRows(
    [
      req({ id: 'd1', status: 'approved', approved_at: '2026-10-15T03:00:00Z' }),
      req({ id: 'd2', status: 'rejected', approved_at: '2026-10-13T03:00:00Z' }),
      req({ id: 'p1', group_id: 'g-x', status: 'approved', approved_at: '2026-10-12T03:00:00Z' }),
      req({ id: 'p2', group_id: 'g-x', status: 'approved', approved_at: '2026-10-12T03:00:00Z' }),
    ],
    opts,
  )
  const hub = approvalHubModel({ queue, summary, undecidable: {}, executives: ['u-carrie'], decided })

  it('the pending total, the oldest wait in a word — alert from three days', () => {
    expect(hub.hero).toEqual({ value: 'RM 57,000.00', label: 'Pending · to approve', chip: { text: 'Oldest waiting · 5 days', tone: 'alert' } })
    expect(waitLabel(0)).toBe('today')
    expect(waitLabel(1)).toBe('1 day')
  })

  it('each card counts and sums what its list holds', () => {
    expect(hub.cards.map((c) => [c.key, c.label, c.sub, c.value, c.tone])).toEqual([
      ['pending', 'Pending', '3 items · 2 combined', 'RM 57,000.00', 'pending_approval'],
      ['exec', 'Submitted by the executive', '2 of the 3', 'RM 7,000.00', 'draft'],
      ['decided', 'Decided · 30 days', '3 approved · 1 rejected', '4', 'paid'],
    ])
    expect(hub.pending.filter((r) => r.executive).reduce((t, r) => t + r.amount, 0)).toBe(7000)
    expect(hub.decidedCount).toBe(4)
  })

  it('nothing waiting: no chip', () => {
    const empty = approvalHubModel({ queue: [], summary: queueSummary([], new Date()), undecidable: {}, executives: [], decided: [] })
    expect(empty.hero.chip).toBeNull()
    expect(empty.cards[0].value).toBe('RM 0.00')
  })
})

describe('approvalRecordModel', () => {
  const approval = {
    id: 'a1',
    status: 'pending',
    request_type: 'payment_voucher',
    description: 'HV-PV-202610-0471: Office rental',
    submitted_by: 'u-carrie',
    created_at: '2026-10-14T01:30:00Z',
    approved_at: null,
    notes: null,
    reference_id: 'v1',
    group_id: null,
    amount: 1000,
    reference_table: 'payment_vouchers',
  }
  const voucher = {
    voucher: {
      id: 'v1',
      voucher_no: 'HV-PV-202610-0471',
      voucher_type: 'expense',
      status: 'pending_approval',
      direction: 'debit',
      amount: '1200.00',
      currency: 'MYR',
      payee_name: 'Landlord Sdn Bhd',
      payee_company_id: null,
      bank_account_id: 'b1',
      reference_type: 'fund_source',
      reference_id: 'fs-9',
      description: 'Office rental Oct',
      notes: null,
      payment_method: 'bank_transfer',
      payment_date: null,
      source_pool: 'venture_pool',
      target_pool: null,
      approved_at: null,
      executed_at: null,
      created_at: '2026-10-14T01:00:00Z',
      updated_at: '2026-10-14T01:00:00Z',
      created_by: 'u-carrie',
      approved_by: null,
      payment_reference: null,
    },
    sources: [{ pool: 'venture_pool', amount: '1200.00', account_code: '6200', account_label: '6200 · Rent' }],
    attachments: [{ id: 'f1', file_name: 'invoice.pdf', file_type: 'application/pdf', file_size: 204800, storage_path: 'x', description: null, uploaded_at: '2026-10-14T01:00:00Z', uploaded_by: 'u-carrie' }],
    bank: { id: 'b1', bank_name: 'Hong Leong', account_number: '23600599248', current_balance: 900 },
    payeeCompany: null,
    createdByName: 'Carrie',
    approvedByName: null,
    categoryLabel: null,
  }

  it('a voucher’s request: the live amount, the bank short, the pool, the files, the upstream in the app', () => {
    const r = approvalRecordModel({ approval, submitterName: 'Carrie', verdict: { may: true }, loanContext: null, voucherContext: voucher, insufficientBalance: true })
    expect(r).toMatchObject({ no: 'HV-PV-202610-0471', amount: 1200, title: 'Office rental', typeLabel: 'Payment voucher', may: true, why: null, submittedBy: 'Carrie', open: null })
    expect(r.voucher).toMatchObject({
      payee: 'Landlord Sdn Bhd',
      short: true,
      bank: { name: 'Hong Leong', number: '23600599248', balance: 900 },
      sources: [{ pool: 'Venture Pool', account: '6200 · Rent', amount: 1200 }],
      files: [{ id: 'f1', name: 'invoice.pdf', size: 204800 }],
      upstream: { label: 'Fund source', href: '/fin-app/fund/in?id=fs-9' },
    })
  })

  it('a loan’s request: its terms; not this reader’s: why', () => {
    const r = approvalRecordModel({
      approval: { ...approval, request_type: 'new_loan', description: 'New loan to Carres', reference_table: 'loans', reference_id: 'loan-1', amount: 100000 },
      submitterName: 'Joan',
      verdict: { may: false, why: 'You raised it — somebody else decides it' },
      loanContext: { company_name: 'Carres', principal: 100000, effective_rate: 0.012, base_rate: 0.009, risk_premium: 0.003, loan_id: 'loan-1' },
      voucherContext: null,
      insufficientBalance: false,
    })
    expect(r.loan).toEqual({ borrower: 'Carres', principal: 100000, rate: '1.200 % /mo', rateSub: '0.900% base + 0.300% custom', monthlyInterest: 1200, open: { hub: 'fund-out', id: 'loan-1' } })
    expect(r).toMatchObject({ may: false, why: 'You raised it — somebody else decides it', amount: 100000, voucher: null, open: null })
  })

  it('any other request opens its own record in the app where it has one', () => {
    const r = approvalRecordModel({
      approval: { ...approval, request_type: 'new_fund_source', description: 'Fund in from Mr Liang', reference_table: 'fund_sources', reference_id: 'fs-1', amount: '80000.00', status: 'rejected', approved_at: '2026-10-14T04:00:00Z', notes: 'Wrong rate' },
      submitterName: null,
      verdict: { may: true },
      loanContext: null,
      voucherContext: null,
      insufficientBalance: false,
    })
    expect(r).toMatchObject({ title: 'Fund in from Mr Liang', amount: 80000, submittedBy: 'Unknown', notes: 'Wrong rate', open: { hub: 'fund-in', id: 'fs-1' } })
    expect(r.decidedAt).toBe('14 Oct 2026 · 12:00')
  })
})

describe('a member’s line', () => {
  it('drops the amount its words repeat, and says its number', () => {
    const [g] = decidedRows(
      [
        req({ id: 'm1', description: 'HV-PV-202610-0507: SIA JONAS — RM 3,550.97', amount: 3550.97, group_id: 'g', status: 'approved', approved_at: '2026-10-10T08:33:46Z' }),
        req({ id: 'm2', description: 'HV-PV-202610-0508: SIA JOSIAH — RM 6,748.96', amount: 6748.96, group_id: 'g', status: 'approved', approved_at: '2026-10-10T08:33:46Z' }),
      ],
      opts,
    )
    expect(g.title).toBe('SIA JONAS + 1 more')
    expect(g.members.map((m) => [m.label, m.sub, m.amount])).toEqual([
      ['SIA JONAS', 'HV-PV-202610-0507', 3550.97],
      ['SIA JOSIAH', 'HV-PV-202610-0508', 6748.96],
    ])
    expect([g.sentBy, g.on]).toEqual(['Carrie', '10 Oct'])
  })
})

describe('groupTitle', () => {
  const v = (description: string) => ({ request_type: 'payment_voucher', description, typeLabel: 'Payment voucher' })
  it('vouchers sharing a head go by it', () => {
    expect(groupTitle([v('Payroll disbursement Sep 2026 — Aina'), v('Payroll disbursement Sep 2026 — Bala')])).toBe('Payroll disbursement Sep 2026')
  })
  it('a payroll batch made one voucher a person goes by the first and how many more — never as if it were one person’s', () => {
    expect(groupTitle([v('SIA JONAS — RM 3,550.97'), v('SIA JOSIAH — RM 6,748.96'), v('WONG JOEY — RM 2,369.78')])).toBe('SIA JONAS + 2 more')
  })
  it('a loan’s disbursement by its own words', () => {
    expect(groupTitle([v('Loan disbursement to Carres'), { request_type: 'new_loan', description: 'New loan to Carres', typeLabel: 'New loan' }])).toBe('Loan disbursement to Carres')
  })
})

describe('where a record opens', () => {
  it('by the table its request names', () => {
    expect(recordOf('payment_vouchers', 'v1')).toEqual({ hub: 'payments', id: 'v1' })
    expect(recordOf('loans', 'l1')).toEqual({ hub: 'fund-out', id: 'l1' })
    expect(recordOf('fund_sources', 'f1')).toEqual({ hub: 'fund-in', id: 'f1' })
    expect(recordOf('contracts', 'c1')).toBeNull()
    expect(recordOf('loans', null)).toBeNull()
  })

  it('a deal’s portal page in the app; any other page as it is', () => {
    expect(inApp('/fund-out/l1')).toBe('/fin-app/fund/out?id=l1')
    expect(inApp('/fund-in/f1')).toBe('/fin-app/fund/in?id=f1')
    expect(inApp('/approvals/payroll-run/r1')).toBe('/approvals/payroll-run/r1')
  })
})

describe('recordLinks', () => {
  it('leads to the voucher and what raised it, the loan, or the fund source — on the computer', () => {
    const voucher = { id: 'v1', upstream: { label: 'Payroll run', href: '/hr-costing/payment', portalHref: '/hr-costing/payment' } } as never
    expect(recordLinks({ voucher, loan: null, open: null })).toEqual([
      { key: 'voucher', label: 'Open the voucher', href: '/payments/v1' },
      { key: 'upstream', label: 'Open the payroll run', href: '/hr-costing/payment' },
    ])
    expect(recordLinks({ voucher: null, loan: { open: { hub: 'fund-out', id: 'l1' } } as never, open: null })).toEqual([{ key: 'loan', label: 'Open the loan', href: '/fund-out/l1' }])
    expect(recordLinks({ voucher: null, loan: null, open: { hub: 'fund-in', id: 'fs1' } })).toEqual([{ key: 'open', label: 'Open the fund source', href: '/fund-in/fs1' }])
    expect(recordLinks({ voucher: null, loan: null, open: null })).toEqual([])
  })
})

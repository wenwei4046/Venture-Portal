import { describe, expect, it } from 'vitest'
import type { ClaimQueueRow } from '@/lib/claim-requests'
import type { PayrollRequestLine } from '@/lib/fin-app/payroll-requests-model'
import { claimRow, payrollRow, requestCards, requestDepartments, requestHero, rowsOf, sortRequests, stageChip, statutoryRow } from './requests-model'

// Payments › Payment request (2026-10-29): the rows, the cards they are under and what waits for Finance.

const REGISTRY = [
  { id: 'hr', name: 'HR', segmentKey: 'hr', isInternal: false },
  { id: 'mk', name: 'Marketing', segmentKey: 'marketing', isInternal: false },
  { id: 'dir', name: 'Director', segmentKey: 'director', isInternal: false },
  { id: 'vo', name: 'Venture Office', segmentKey: null, isInternal: true },
  { id: 'it', name: 'IT', segmentKey: 'it', isInternal: false },
  { id: 'rev', name: 'Revenue Department', segmentKey: 'revenue_department', isInternal: false },
]
const DEPTS = requestDepartments(REGISTRY)

const claim = (over: Partial<ClaimQueueRow> = {}): ClaimQueueRow => ({
  claimId: 'c1',
  claimType: 'benefit',
  claimantName: 'LUCAS',
  department: 'Revenue Department',
  amount: 100,
  description: 'Outstation · Johor',
  sourcePool: 'venture_pool',
  requestNo: 'RQ-2610-008',
  approvedByName: 'LI SEAN',
  approvedAt: '2026-10-26T02:00:00Z',
  voucherId: null,
  voucherNo: null,
  voucherStatus: null,
  ...over,
})

const payroll = (over: Partial<PayrollRequestLine> = {}): PayrollRequestLine => ({
  id: 'p1',
  label: 'October 2026',
  sub: 'Batch #1 · HR 5',
  value: '98,450.20',
  amount: 98450.2,
  committed: 0,
  remaining: 98450.2,
  isDirector: false,
  batchId: 'b1',
  period: '2026-10-01',
  requested: 'HR Manager · 29 Oct 10:00',
  pools: [],
  pendingPvs: [],
  canSendBack: true,
  ...over,
})
const asked = { requested_at: '2026-10-29T02:00:00Z', requested_by_name: 'HR Manager' }

describe('the departments', () => {
  it('are every department but the office’s own and the directors’, in the registry’s order — a new one included', () => {
    expect(DEPTS.map((d) => d.name)).toEqual(['HR', 'Marketing', 'IT', 'Revenue Department'])
  })
})

describe('a row', () => {
  it('a member’s claim sits under its department, sent the day HR approved it (the office’s day)', () => {
    const r = claimRow(claim({ approvedAt: '2026-10-25T17:30:00Z' }), DEPTS)
    expect(r).toMatchObject({ key: 'claim:c1', card: 'dept:rev', from: 'LUCAS', sent: '2026-10-26', ref: 'RQ-2610-008', payTo: 'Claim', whoPays: 'Venture pool', stage: 'finance' })
    expect(r.fromSub).toBe('Revenue Department · approved by HR (LI SEAN)')
  })

  it('a claim of a department with no card goes under Other; one with a voucher is with the Principal', () => {
    expect(claimRow(claim({ department: 'Somewhere' }), DEPTS).card).toBe('other')
    expect(claimRow(claim({ voucherId: 'v1', voucherNo: 'HV-PV-202610-0007' }), DEPTS).stage).toBe('principal')
  })

  it('a payroll is under Payroll — what is still to fund, or, fully funded, the request with the Principal', () => {
    expect(payrollRow(payroll({ committed: 40000, remaining: 58450.2 }), asked)).toMatchObject({ card: 'payroll', from: 'HR Manager', amount: 58450.2, stage: 'finance', sent: '2026-10-29' })
    expect(payrollRow(payroll({ committed: 98450.2, remaining: 0 }), asked)).toMatchObject({ amount: 98450.2, stage: 'principal' })
  })

  it('says where it stands', () => {
    expect(stageChip(payrollRow(payroll(), asked)).text).toBe('To fund')
    expect(stageChip(payrollRow(payroll({ committed: 1, remaining: 98449.2 }), asked)).text).toBe('Part funded')
    expect(stageChip(payrollRow(payroll({ committed: 98450.2, remaining: 0 }), asked)).text).toBe('Funded · with the Principal')
    expect(stageChip(claimRow(claim(), DEPTS))).toEqual({ text: 'Waiting for a PV', tone: 'wait' })
    expect(stageChip(claimRow(claim({ voucherId: 'v1' }), DEPTS))).toEqual({ text: 'PV with the Principal', tone: 'accent' })
  })
})

describe('the cards', () => {
  const rows = sortRequests([
    claimRow(claim({ claimId: 'c2', voucherId: 'v1', amount: 50, approvedAt: '2026-10-20T02:00:00Z' }), DEPTS),
    claimRow(claim({ claimId: 'c1', approvedAt: '2026-10-26T02:00:00Z' }), DEPTS),
    payrollRow(payroll(), asked),
    claimRow(claim({ claimId: 'c3', department: 'Marketing', claimantName: 'KHO WEI JIE', amount: 99.9, approvedAt: '2026-10-28T02:00:00Z' }), DEPTS),
  ])

  it('lists what waits for Finance first, oldest first, then what is with the Principal', () => {
    expect(rows.map((r) => r.key)).toEqual(['claim:c1', 'claim:c3', 'payroll:p1', 'claim:c2'])
  })

  it('are All, Payroll, then every department — each what it holds, a department with none at nought', () => {
    expect(requestCards(rows, DEPTS, true).map((c) => [c.key, c.label, c.sub, c.value])).toEqual([
      ['all', 'All requests', '4 requests', 'RM 98,700.10'],
      ['payroll', 'Payroll', '1 request', 'RM 98,450.20'],
      ['dept:hr', 'HR', '0 requests', 'RM 0.00'],
      ['dept:mk', 'Marketing', '1 request', 'RM 99.90'],
      ['dept:it', 'IT', '0 requests', 'RM 0.00'],
      ['dept:rev', 'Revenue Department', '2 requests', 'RM 150.00'],
    ])
  })

  it('without Payroll payouts there is no Payroll card (and no payroll row is read)', () => {
    expect(requestCards(rows.filter((r) => r.source !== 'payroll'), DEPTS, false).map((c) => c.key)).toEqual(['all', 'dept:hr', 'dept:mk', 'dept:it', 'dept:rev'])
  })

  // PR ⑥ (2026-10-29): the old Payroll Requests page's statutory payments — HR's vouchers, a card of their own after
  // Payroll; never in All, never waiting for Finance; each opens its voucher.
  it('statutory vouchers: their own card after Payroll, not in All, not waiting', () => {
    const pv = { id: 'pv-k', voucher_no: 'HV-PV-202610-0612', payee_name: 'KWSP', amount: 18250.4, status: 'paid', payment_date: '2026-10-15' }
    const withStatutory = sortRequests([...rows, statutoryRow('2026-10-01', pv), statutoryRow('2026-10-01', { ...pv, id: 'pv-s', payee_name: 'PERKESO', amount: 1200, status: 'pending_approval' })])
    expect(requestCards(withStatutory, DEPTS, true).map((c) => [c.key, c.sub, c.value]).slice(0, 3)).toEqual([
      ['all', '4 requests', 'RM 98,700.10'],
      ['payroll', '1 request', 'RM 98,450.20'],
      ['statutory', '2 vouchers', 'RM 19,450.40'],
    ])
    expect(requestCards(withStatutory, DEPTS, false).map((c) => c.key)).not.toContain('statutory')
    expect(requestHero(withStatutory)).toEqual(requestHero(rows))
    expect(rowsOf(withStatutory, 'all').some((r) => r.source === 'statutory')).toBe(false)
    const k = rowsOf(withStatutory, 'statutory')[0]
    expect([k.from, k.what, k.ref, k.voucherId, stageChip(k).text]).toEqual(['KWSP', 'Statutory · Oct 2026', 'HV-PV-202610-0612', 'pv-k', 'Paid'])
    expect(stageChip(rowsOf(withStatutory, 'statutory')[1]).text).toBe('With the Principal')
    expect(withStatutory.at(-1)?.source).toBe('statutory')
  })

  it('an Other card only when a row has no department card', () => {
    const odd = [...rows, claimRow(claim({ claimId: 'c9', department: null }), DEPTS)]
    expect(requestCards(odd, DEPTS, true).at(-1)).toMatchObject({ key: 'other', sub: '1 request' })
  })

  it('the total is what waits for Finance; a card lists its own', () => {
    expect(requestHero(rows)).toEqual({ label: 'Waiting for you · 3 requests', value: 'RM 98,650.10' })
    expect(rowsOf(rows, 'dept:rev').map((r) => r.key)).toEqual(['claim:c1', 'claim:c2'])
    expect(rowsOf(rows, 'all')).toHaveLength(4)
  })
})

import { describe, expect, it } from 'vitest'
import {
  buildQueueRows,
  executiveSubmitterIds,
  queueSummary,
  recentDecisionRows,
  requestTypeLabel,
  splitVoucherTitle,
  type ApprovalRequestRow,
} from './approval-queue'

// 2026-10-07 — the Approvals queue as a table (user approved the sample:
// "英文 排队用表格不错，但把 description 和 pv no 分开"). A request's description is
// "HV-PV-202610-0449: Loan Repayment - 5rd Installment"; the number and the
// text are two columns now.

const at = (day: number, hour = 10) => new Date(2026, 9, day, hour, 0, 0).toISOString()

function request(over: Partial<ApprovalRequestRow> & { id: string }): ApprovalRequestRow {
  return {
    request_type: 'payment_voucher',
    description: null,
    amount: null,
    reference_id: null,
    reference_table: 'payment_vouchers',
    submitted_by: 'fm',
    group_id: null,
    created_at: at(2),
    approved_at: null,
    status: 'pending',
    ...over,
  }
}

const names: Record<string, string> = { fm: 'Finance Manager', ex: 'ONG MEI SHUANG' }
const opts = {
  amountOf: (r: ApprovalRequestRow) => (r.amount === null ? null : Number(r.amount)),
  nameOf: (id: string) => names[id] ?? 'Unknown',
}

describe('splitVoucherTitle', () => {
  it('takes the voucher number off the front of a voucher request', () => {
    expect(splitVoucherTitle('HV-PV-202610-0449: Loan Repayment - 5rd Installment')).toEqual({
      voucherNo: 'HV-PV-202610-0449',
      text: 'Loan Repayment - 5rd Installment',
    })
    expect(splitVoucherTitle('HV-OR-202610-0012: Rent received')).toEqual({ voucherNo: 'HV-OR-202610-0012', text: 'Rent received' })
  })

  it('leaves a request without a voucher number alone', () => {
    expect(splitVoucherTitle('New loan to 2990')).toEqual({ voucherNo: null, text: 'New loan to 2990' })
    expect(splitVoucherTitle(null)).toEqual({ voucherNo: null, text: '' })
  })

  it('joins a multi-line description into one line', () => {
    expect(splitVoucherTitle('HV-PV-202610-0457: RM26.30 Merchant charges\r\nRM193 - Event Prize Wheel\r\n')).toEqual({
      voucherNo: 'HV-PV-202610-0457',
      text: 'RM26.30 Merchant charges · RM193 - Event Prize Wheel',
    })
  })
})

describe('requestTypeLabel', () => {
  it('names the types the queue carries in sentence case', () => {
    expect(requestTypeLabel('payment_voucher')).toBe('Payment voucher')
    expect(requestTypeLabel('new_loan')).toBe('New loan')
    expect(requestTypeLabel('dept_payment_request')).toBe('Dept request payment')
    expect(requestTypeLabel('new_fund_source')).toBe('New fund source')
    expect(requestTypeLabel('loan_cancel')).toBe('Loan cancel')
  })
  it('spells an unknown type out rather than shouting it', () => {
    expect(requestTypeLabel('something_new')).toBe('Something new')
  })
})

describe('buildQueueRows', () => {
  const pv449 = request({ id: 'a', description: 'HV-PV-202610-0449: Loan Repayment - 5rd Installment', amount: 11800, reference_id: 'v449', created_at: at(2, 10) })
  const pv471 = request({ id: 'b', description: "HV-PV-202610-0471: Office Rental- E2803A - Oct'26", amount: 6000, reference_id: 'v471', submitted_by: 'ex', created_at: at(6, 11) })
  const loanPv = request({ id: 'c', description: 'HV-PV-202610-0475: Loan disbursement to 2990', amount: 40000, reference_id: 'v475', group_id: 'grp', created_at: at(7, 9) })
  const loan = request({ id: 'd', request_type: 'new_loan', description: 'New loan to 2990', amount: 40000, reference_id: 'loan1', reference_table: 'loans', group_id: 'grp', created_at: at(7, 9) })

  it('makes one row per single request, number and text apart, keyed by the request id', () => {
    const rows = buildQueueRows([pv449, pv471], opts)
    expect(rows.map((r) => r.key)).toEqual(['a', 'b'])
    expect(rows[0]).toMatchObject({
      kind: 'single',
      id: 'a',
      voucherNo: 'HV-PV-202610-0449',
      voucherLine: 'HV-PV-202610-0449',
      description: 'Loan Repayment - 5rd Installment',
      typeLabel: 'Payment voucher',
      submitterId: 'fm',
      submitterName: 'Finance Manager',
      submittedAt: at(2, 10),
      amount: 11800,
      hasAmount: true,
      voucherIds: ['v449'],
      href: '/approvals/a',
      companions: [],
    })
    expect(rows[1].submitterName).toBe('ONG MEI SHUANG')
  })

  it('folds a combined approval into one row — the loan and its disbursement are the same money', () => {
    const rows = buildQueueRows([pv449, loanPv, loan], opts)
    expect(rows.map((r) => r.key)).toEqual(['a', 'g:grp'])
    const combo = rows[1]
    expect(combo).toMatchObject({
      kind: 'group',
      id: null,
      groupId: 'grp',
      voucherNo: 'HV-PV-202610-0475',
      voucherLine: 'HV-PV-202610-0475 + New loan',
      description: 'Loan disbursement to 2990',
      companions: ['New loan to 2990'],
      typeLabel: 'New loan + PV',
      amount: 40000, // not 80,000
      hasAmount: true,
      voucherIds: ['v475'],
      href: null,
    })
    expect(combo.members.map((m) => [m.id, m.typeLabel])).toEqual([
      ['c', 'Payment voucher'],
      ['d', 'New loan'],
    ])
  })

  it('a batch of vouchers is one row that says how many, headed by what they share', () => {
    const batch = ['Aina binti Example', 'Bala Sample', 'Chen Example'].map((who, i) =>
      request({ id: `p${i}`, description: `HV-PV-202610-05${i}0: Payroll disbursement Sep 2026 — ${who}`, amount: 1000 * (i + 1), reference_id: `vp${i}`, group_id: 'pay', created_at: at(5, 17 + i) }),
    )
    const [row] = buildQueueRows(batch, opts)
    expect(row).toMatchObject({
      key: 'g:pay',
      description: 'Payroll disbursement Sep 2026',
      companions: [],
      typeLabel: 'Payment voucher × 3',
      voucherLine: 'HV-PV-202610-0500 + 2 more',
      amount: 6000,
      submittedAt: at(5, 17),
      voucherIds: ['vp0', 'vp1', 'vp2'],
    })
  })

  it('a request that moves no money has no amount', () => {
    const [row] = buildQueueRows([request({ id: 't', request_type: 'tier_change', description: 'Tier change for Carres', reference_table: 'loans' })], opts)
    expect(row).toMatchObject({ amount: 0, hasAmount: false, voucherNo: null, voucherLine: '', typeLabel: 'Tier change', voucherIds: [] })
  })
})

describe('queueSummary', () => {
  const rows = buildQueueRows(
    [
      request({ id: 'a', description: 'HV-PV-202610-0449: Loan Repayment', amount: 11800, created_at: at(2, 10) }),
      request({ id: 'b', description: 'HV-PV-202610-0471: Office Rental', amount: 6000, submitted_by: 'ex', created_at: at(6, 11) }),
      request({ id: 'c', description: 'HV-PV-202610-0475: Loan disbursement', amount: 40000, group_id: 'grp', created_at: at(7, 9) }),
      request({ id: 'd', request_type: 'new_loan', description: 'New loan to 2990', amount: 40000, reference_table: 'loans', group_id: 'grp', created_at: at(7, 9) }),
    ],
    opts,
  )

  it('totals what approving everything would move, counts rows and combined ones, and finds the oldest', () => {
    const s = queueSummary(rows, new Date(2026, 9, 7, 15, 0, 0))
    expect(s.total).toBe(57800)
    expect(s.items).toBe(3)
    expect(s.combined).toBe(1)
    expect(s.oldest).toMatchObject({ days: 5, row: { key: 'a' } })
  })

  it('splits out what a given set of submitters sent', () => {
    const s = queueSummary(rows, new Date(2026, 9, 7), new Set(['ex']))
    expect(s.bySubmitters).toEqual({ amount: 6000, count: 1, names: ['ONG MEI SHUANG'] })
  })

  it('is empty-safe', () => {
    const s = queueSummary([], new Date(2026, 9, 7))
    expect(s).toMatchObject({ total: 0, items: 0, combined: 0, oldest: null, bySubmitters: { amount: 0, count: 0, names: [] } })
  })
})

describe('executiveSubmitterIds', () => {
  // HR's title levels: an account is "the executive" when its title sits at a
  // level up to the highest one called Executive (Executive, Senior Executive,
  // and the Assistant / Internship levels under them) — never a manager.
  const levels = [
    { id: 'L1', name: 'Internship', rank: 1 },
    { id: 'L3', name: 'Executive', rank: 3 },
    { id: 'L4', name: 'Senior Executive', rank: 4 },
    { id: 'L5', name: 'Assistant Manager', rank: 5 },
    { id: 'L10', name: 'C - Level', rank: 10 },
  ]
  const titles = [
    { id: 'T-acc', level_id: 'L3' },
    { id: 'T-sr', level_id: 'L4' },
    { id: 'T-afm', level_id: 'L5' },
    { id: 'T-ceo', level_id: 'L10' }, // "Chief Executive Officer" is not an executive
    { id: 'T-none', level_id: null },
  ]
  it('picks the accounts whose title is at an executive level or below', () => {
    const staff = [
      { user_id: 'ex', title_id: 'T-acc' },
      { user_id: 'sr', title_id: 'T-sr' },
      { user_id: 'afm', title_id: 'T-afm' },
      { user_id: 'ceo', title_id: 'T-ceo' },
      { user_id: 'unlevelled', title_id: 'T-none' },
      { user_id: null, title_id: 'T-acc' },
    ]
    expect([...executiveSubmitterIds(staff, titles, levels)].sort()).toEqual(['ex', 'sr'])
  })
  it('names nobody when HR has no level called Executive', () => {
    expect(executiveSubmitterIds([{ user_id: 'ex', title_id: 'T-acc' }], titles, [{ id: 'L3', name: 'Junior', rank: 3 }]).size).toBe(0)
  })
})

describe('recentDecisionRows', () => {
  it('lists each decision with its number, text, type, outcome, who sent it and when it was decided', () => {
    const rows = recentDecisionRows(
      [
        request({ id: 'r1', description: 'HV-PV-202610-0463: Payroll bank transfer — Sep 2026', amount: 105519.29, status: 'approved', approved_at: at(5, 14), created_at: at(5, 12) }),
        request({ id: 'r2', description: 'HV-PV-202610-0448: Hostel & Accommodation', amount: 3450, status: 'rejected', approved_at: at(4, 9), submitted_by: 'ex' }),
      ],
      opts,
    )
    expect(rows).toEqual([
      { id: 'r1', voucherNo: 'HV-PV-202610-0463', description: 'Payroll bank transfer — Sep 2026', typeLabel: 'Payment voucher', decision: 'approved', submitterName: 'Finance Manager', decidedAt: at(5, 14), amount: 105519.29, href: '/approvals/r1' },
      { id: 'r2', voucherNo: 'HV-PV-202610-0448', description: 'Hostel & Accommodation', typeLabel: 'Payment voucher', decision: 'rejected', submitterName: 'ONG MEI SHUANG', decidedAt: at(4, 9), amount: 3450, href: '/approvals/r2' },
    ])
  })
})

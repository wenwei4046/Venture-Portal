import { describe, expect, it } from 'vitest'
import type { PoolAccrualRead, PoolCashRead } from '@/app/(portal)/dept-pool/_lib/pool-read'
import { poolAccrualModel, poolCashModel } from './dept-pool-model'
import { deptStatementPlace, deptStatementView } from './dept-statement'

// Department › Dept Pool in the Finance phone app (2026-10-15, part E3): the
// desktop page's cash and accrual figures as hubs, and a department's own page
// (its Cash Flow first, the P&L a press away, the month kept).

const CASH: PoolCashRead = {
  visible: [
    { id: 'mkt', name: 'Marketing' },
    { id: 'hr', name: 'HR' },
  ],
  balanceMap: new Map([
    ['mkt', -60156.33],
    ['hr', 45839.14],
  ]),
  inOutByDept: new Map([
    ['mkt', { in_amt: 253783.4, out_amt: 319085.68 }],
    ['hr', { in_amt: 709442.39, out_amt: 654753.6 }],
  ]),
  costingByDept: new Map([['hr', 12000]]),
  latestHr: new Map([['hr', { id: 'sub-1', state: 'approved_for_execution', period: '2026-09-01' }]]),
  submissions: [
    {
      id: 'sub-1',
      period_month: '2026-09-01',
      submitted_at: '2026-10-02T02:00:00Z',
      submitted_by_name: 'HR',
      execution_state: 'approved_for_execution',
      dept_summaries: {
        HR: { department_id: 'hr', total_ctc: 12000, staff_count: 3, total_basic: 10000, total_statutory: 1500, total_allowance: 500 },
      },
    },
  ],
  ventureCash: { balance: 117563.52, in_amt: 3315870.81, out_amt: 3198307.29 },
  perBankBreakdown: {
    banks: [
      { code: '3000', name: 'Hong Leong Bank', balance: 0 },
      { code: '3001', name: 'Alliance Bank', balance: 0 },
    ],
    rows: [{ segment: 'hr', label: 'HR', perBank: { '3000': 10600.84, '3001': 35238.3 }, total: 45839.14 }],
    totals: { perBank: { '3000': 10600.84, '3001': 35238.3 }, grand: 45839.14 },
  },
  totalDeployed: 103246.33,
}
const slugOf = (name: string) => (name === 'HR' ? 'hr' : name === 'Venture' ? 'venture' : null)

describe('poolCashModel', () => {
  const m = poolCashModel(CASH, slugOf, { seesSubmissions: true, when: () => '2 Oct 2026 · 10:00' })
  it('the total balance over By department, Balance by bank and HR costing; a pool below zero said', () => {
    expect(m.hero).toEqual({ value: 'RM 103,246.33', label: 'Total balance · 2 departments + Venture' })
    expect(m.chip).toEqual({ text: '1 below zero', tone: 'danger' })
    expect(m.cards.map((c) => [c.label, c.sub, c.value])).toEqual([
      ['By department', 'In 4,279,096.60 · Out 4,172,146.57 · to date', 'RM 106,950.03'],
      ['Balance by bank', '2 banks', 'RM 45,839.14'],
      ['HR costing', '1 ready to execute', '1 submission'],
    ])
  })
  it('a department: its balance (hidden on screen until shown), in · out · net, its HR state, its own page when it has one', () => {
    expect(m.depts.map((d) => [d.name, d.balance, d.sub, d.chip?.text ?? null, d.slug])).toEqual([
      ['Marketing', -60156.33, 'In 253,783.40 · Out 319,085.68 · net −65,302.28', null, null],
      ['HR', 45839.14, 'In 709,442.39 · Out 654,753.60 · net 54,688.79 · HR 12,000.00', 'ready to execute', 'hr'],
      ['Venture (Office)', 117563.52, 'In 3,315,870.81 · Out 3,198,307.29 · net 117,563.52', null, 'venture'],
    ])
  })
  it('each bank’s slice, and a submission’s departments', () => {
    expect(m.banks?.lines[0]).toEqual({ key: 'hr', label: 'HR', sub: 'Hong Leong Bank 10,600.84 · Alliance Bank 35,238.30', value: '45,839.14', tone: null })
    expect(m.submissions?.[0]).toMatchObject({ label: 'September 2026', sub: 'Submitted 2 Oct 2026 · 10:00 · HR', value: '12,000.00', ready: true, state: { text: 'ready to execute' } })
    expect(m.submissions?.[0].parts[0]).toEqual({ key: 'HR', label: 'HR', sub: '3 staff · basic 10,000.00 · stat ER 1,500.00 · allowance 500.00', value: '12,000.00' })
  })
  it('without the submissions page, no HR costing card', () => {
    const quiet = poolCashModel(CASH, slugOf, { seesSubmissions: false, when: () => '' })
    expect(quiet.cards.map((c) => c.key)).toEqual(['depts', 'banks'])
    expect(quiet.submissions).toBeNull()
  })
})

describe('poolAccrualModel', () => {
  const read: PoolAccrualRead = {
    visible: [{ id: 'hr', name: 'HR' }],
    rows: [{ dept: { id: 'hr', name: 'HR' }, a: { revenue: 1000, cost: 300, expense: 200, interBilling: 50, netMargin: 450 }, href: '/dept-pool/hr' }],
    ventureAccrual: { revenue: 500, cost: 0, expense: 600, interBilling: 0, netMargin: -100 },
    totalNetMargin: 350,
  }
  it('the net margin to date over each department’s revenue, cost, expense and inter-billing', () => {
    const m = poolAccrualModel(read, slugOf, '2026-10-31')
    expect(m.hero).toEqual({ value: 'RM 350.00', label: 'Net margin · to 31 Oct 2026' })
    expect(m.depts.map((d) => [d.name, d.value, d.tone])).toEqual([
      ['HR', '450.00', null],
      ['Venture (Office)', '−100.00', 'out'],
    ])
    expect(m.cards[0].sub).toBe('Revenue 1,500.00 · cost 300.00 · expense 800.00 · inter-billing 50.00')
  })
})

describe('a department’s own page', () => {
  it('the Cash Flow first; the P&L asked for; the switch keeps the month', () => {
    expect(deptStatementView(undefined)).toBe('cash-flow')
    expect(deptStatementView('pnl')).toBe('pnl')
    const cf = deptStatementPlace({ slug: 'hr', title: 'HR', view: 'cash-flow', ym: '2026-09', thisMonth: '2026-10' })
    expect(cf.place).toMatchObject({ href: '/fin-app/page/dp-hr', keep: 'm=2026-09', period: { label: 'September 2026', prev: 'm=2026-08', next: '' } })
    expect([cf.switchLabel, cf.switchHref]).toEqual(['P&L', '/fin-app/page/dp-hr?view=pnl&m=2026-09'])
    const pnl = deptStatementPlace({ slug: 'hr', title: 'HR', view: 'pnl', ym: '2026-10', thisMonth: '2026-10' })
    expect(pnl.place).toMatchObject({ keep: 'view=pnl', period: { prev: 'view=pnl&m=2026-09', next: null } })
    expect([pnl.switchLabel, pnl.switchHref]).toEqual(['Cash Flow', '/fin-app/page/dp-hr'])
  })
})

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { VoucherRow } from '../_components/VouchersTable'
import { batchStatusText, buildHubLedger, type HubLedgerInput } from './hub-ledger'

// Payments' hub (2026-10-14, the Finance revamp v2 — D02–D05): the ledger's
// rules, kept as the hub reads the rows once — payroll read by department
// never leaves the server as one person's voucher; a salary batch folds under
// its name for whoever reads by person; money that moved outside the voucher
// flow stands in All and Paid; an old ?type= / ?pool= link still narrows; the
// total is the office month's.

type V = HubLedgerInput['vouchers'][number]
const v = (over: Partial<V> & { id: string }): V => ({
  voucher_no: `HV-PV-202610-${over.id}`,
  direction: 'debit',
  amount: 100,
  payee_name: 'Tenaga Nasional',
  status: 'paid',
  voucher_type: 'expense',
  reference_type: null,
  description: 'Electricity Sep',
  payment_date: '2026-10-05',
  created_at: '2026-10-05T02:00:00Z',
  target_pool: null,
  source_pool: null,
  fund_source_id: null,
  loan_id: null,
  bank_account_id: null,
  ...over,
})

const VOUCHERS: V[] = [
  v({ id: '0001', amount: 25000, status: 'pending_approval', payee_name: 'Meta Platforms Ireland', description: 'FB ads top-up' }),
  v({ id: '0002', amount: 1386, status: 'draft', payee_name: 'Google Asia Pacific', description: 'Workspace Oct' }),
  v({ id: '0003', amount: 2184.6, status: 'paid', payment_date: '2026-10-01' }),
  v({ id: '0004', amount: 18500, status: 'voided', payee_name: 'Syarikat Logistik Jaya', description: 'Duplicate — Sep rental' }),
  v({ id: '0005', amount: 4500, status: 'paid', payment_date: '2026-09-28', created_at: '2026-09-28T02:00:00Z', payee_name: 'Tan & Associates' }),
  v({ id: '0006', amount: 9000, status: 'paid', fund_source_id: 'fs1', payee_name: 'Loo K.W.', description: 'Instalment 4 / 12' }),
  // Payroll: two salary vouchers of one batch, a statutory one.
  v({ id: '0101', amount: 3000, reference_type: 'payroll_disbursement', payee_name: 'Aina Rahman', description: 'Payroll disbursement Sep 2026 — Aina Rahman', payment_date: '2026-10-06' }),
  v({ id: '0102', amount: 3200, reference_type: 'payroll_disbursement', payee_name: 'Lim Wei Jie', description: 'Payroll disbursement Sep 2026 — Lim Wei Jie', status: 'pending_approval', payment_date: null }),
  v({ id: '0103', amount: 4100, reference_type: 'payroll_statutory', payee_name: 'KWSP', description: 'KWSP — Sep 2026 payroll (Finance · 3 staff)', payment_date: '2026-10-07' }),
]

const SOURCES: HubLedgerInput['sources'] = [
  { voucher_id: '0001', pool: 'dept_pool_marketing', account_code: '6100', chart_of_accounts: { name: 'Advertising' } },
  { voucher_id: '0003', pool: 'venture_pool', account_code: '6300', chart_of_accounts: { name: 'Utilities' } },
  { voucher_id: '0006', pool: 'venture_pool', account_code: '4030', chart_of_accounts: { name: 'Director savings' } },
]

const extra = (over: Partial<VoucherRow> & { id: string }): VoucherRow => ({
  voucher_no: null,
  direction: 'debit',
  amount: 13750,
  payee_name: 'HOUZS Mattress (HM)',
  status: 'paid',
  catLabel: '还款 · principal',
  poolLabel: '—',
  description: 'Fund-source principal repayment',
  paymentOrCreatedDate: '2026-10-10',
  href: '/fund-in/fs9',
  ...over,
})

const input = (over: Partial<HubLedgerInput> = {}): HubLedgerInput => ({
  direction: 'debit',
  params: {},
  seesPayroll: true,
  byPerson: true,
  vouchers: VOUCHERS,
  sources: SOURCES,
  extras: [extra({ id: 'fsr-1' }), extra({ id: 'lout-1', amount: 50000, paymentOrCreatedDate: '2026-08-02', catLabel: 'Loan OUT · 借出', href: '/fund-out/l1' })],
  banks: [],
  departments: ['Finance', 'Marketing'],
  month: '2026-10',
  ...over,
})

const ids = (rows: Array<{ id: string; cards: string[] }>, card: string) => rows.filter((r) => r.cards.includes(card)).map((r) => r.id)

beforeEach(() => {
  vi.useFakeTimers({ now: new Date('2026-10-14T07:00:00Z'), toFake: ['Date'] })
})
afterEach(() => vi.useRealTimers())

describe('read by department (the Finance view, or no Payroll payouts)', () => {
  const ledger = buildHubLedger(input({ byPerson: false }))

  it('sends no payroll voucher at all — not in any card’s rows', () => {
    const all = ledger.rows.map((r) => r.id)
    expect(all).not.toContain('0101')
    expect(all).not.toContain('0102')
    expect(all).not.toContain('0103')
    expect(JSON.stringify(ledger)).not.toMatch(/Aina Rahman|Lim Wei Jie/)
  })

  it('holds every payroll batch in its own card, department by department, opening nothing', () => {
    expect(ledger.batches.map((b) => b.name)).toEqual(['KWSP Sep 2026', 'Payroll disbursement Sep 2026'])
    for (const b of ledger.batches) {
      expect(b.locked).toBe(true)
      for (const m of b.members) expect(m.id).toBeNull()
    }
    const salary = ledger.batches.find((b) => b.name === 'Payroll disbursement Sep 2026')!
    expect(salary.count).toBe(2)
    expect(salary.statusText).toBe('1 paid · 1 pending')
  })

  it('counts each card by what it lists — payroll in its own — while the total holds every voucher', () => {
    const fig = Object.fromEntries(ledger.cards.map((c) => [c.key, c]))
    expect(fig.all.count).toBe(6)
    expect(fig.pending_approval.count).toBe(1)
    expect(fig.payroll.count).toBe(2)
    // Paid this month: 0003 + 0006 + the salary and the statutory voucher, and the repayment outside the flow.
    expect(ledger.hero).toEqual({ label: 'Total paid · October 2026', amount: 2184.6 + 9000 + 3000 + 4100 + 13750 })
  })

  it('counts the money moved outside the flow apart — All and Paid — and sums it in (2026-10-14: 190 vouchers beside a list of 317)', () => {
    const fig = Object.fromEntries(ledger.cards.map((c) => [c.key, c]))
    // A repayment straight to a lender and a loan paid out.
    expect(fig.all.other).toBe(2)
    expect(fig.paid.other).toBe(2)
    expect(fig.draft.other).toBe(0)
    expect(fig.all.amount).toBe(Math.round(ledger.rows.filter((r) => r.cards.includes('all')).reduce((s, r) => s + r.amount, 0) * 100) / 100)
  })
})

describe('a card counts what its list holds, as the list’s head counts it', () => {
  for (const byPerson of [false, true]) {
    it(byPerson ? 'read by person — a folded batch counts its members' : 'read by department', () => {
      const ledger = buildHubLedger(input({ byPerson }))
      for (const c of ledger.cards.filter((c) => c.key !== 'payroll')) {
        const inCard = ledger.rows.filter((r) => r.cards.includes(c.key))
        expect(c.count, c.key).toBe(inCard.filter((r) => r.kind !== 'extra').reduce((n, r) => n + r.items, 0))
        expect(c.other, c.key).toBe(inCard.filter((r) => r.kind === 'extra').length)
        expect(c.amount, c.key).toBe(Math.round(inCard.reduce((s, r) => s + r.amount, 0) * 100) / 100)
      }
    })
  }

  it('read by person, All counts both salary vouchers of the folded batch', () => {
    const ledger = buildHubLedger(input())
    const all = ledger.cards.find((c) => c.key === 'all')!
    const batch = ledger.rows.find((r) => r.id === 'batch:all:Payroll disbursement Sep 2026')!
    expect(batch.items).toBe(2)
    expect(all.count).toBe(ledger.rows.filter((r) => r.cards.includes('all') && r.kind === 'voucher').length + 2)
  })
})

describe('read by person (Payroll payouts, not on the Finance view)', () => {
  const ledger = buildHubLedger(input())

  it('folds a salary batch under its name — one row in All, one in each status it holds', () => {
    expect(ids(ledger.rows, 'all')).toContain('batch:all:Payroll disbursement Sep 2026')
    expect(ids(ledger.rows, 'paid')).toContain('batch:paid:Payroll disbursement Sep 2026')
    expect(ids(ledger.rows, 'pending_approval')).toContain('batch:pending_approval:Payroll disbursement Sep 2026')
    expect(ledger.rows.map((r) => r.id)).not.toContain('0101')
    const row = ledger.rows.find((r) => r.id === 'batch:all:Payroll disbursement Sep 2026')!
    expect(row).toMatchObject({ kind: 'batch', desc: '2 vouchers · 1 paid · 1 pending', amount: 6200, batch: 'Payroll disbursement Sep 2026' })
  })

  it('opens each salary voucher from its batch, by name', () => {
    const salary = ledger.batches.find((b) => b.name === 'Payroll disbursement Sep 2026')!
    expect(salary.locked).toBe(false)
    expect(salary.members.map((m) => [m.who, m.id])).toEqual([
      ['Aina Rahman', '0101'],
      ['Lim Wei Jie', '0102'],
    ])
  })

  it('lists a statutory voucher as a row of its own', () => {
    expect(ids(ledger.rows, 'all')).toContain('0103')
  })
})

describe('the rows', () => {
  const ledger = buildHubLedger(input())

  it('stands money moved outside the voucher flow in All and Paid, opening its own page', () => {
    const row = ledger.rows.find((r) => r.id === 'fsr-1')!
    expect(row.cards).toEqual(['all', 'paid'])
    expect(row).toMatchObject({ kind: 'extra', href: '/fund-in/fs9' })
  })

  it('names each voucher’s pool and account, a repayment PV as 还款', () => {
    expect(ledger.rows.find((r) => r.id === '0001')).toMatchObject({ pool: 'Marketing', cat: 'Advertising' })
    expect(ledger.rows.find((r) => r.id === '0006')).toMatchObject({ cat: '还款 · Director savings' })
  })

  it('offers Change date on a paid voucher that is not payroll’s', () => {
    expect(ledger.rows.find((r) => r.id === '0003')!.amendDate).toEqual({ kind: 'voucher', id: '0003', date: '2026-10-01' })
    expect(ledger.rows.find((r) => r.id === '0001')!.amendDate).toBeNull()
  })

  it('runs newest first', () => {
    const dates = ledger.rows.map((r) => r.date)
    expect([...dates].sort().reverse()).toEqual(dates)
  })
})

describe('an old link’s filters still narrow the list', () => {
  it('?type=loan_repayment keeps the repayment vouchers, and leaves the money outside the flow out', () => {
    const ledger = buildHubLedger(input({ params: { type: 'loan_repayment' } }))
    expect(ids(ledger.rows, 'all')).toEqual(['0006'])
  })

  it('?pool= by the voucher’s sources', () => {
    const ledger = buildHubLedger(input({ params: { pool: 'dept_pool_marketing' } }))
    expect(ids(ledger.rows, 'all')).toEqual(['0001'])
  })

  it('?min= / ?max= by the amount', () => {
    const ledger = buildHubLedger(input({ params: { min: '10000', max: '30000' }, byPerson: false }))
    expect(ids(ledger.rows, 'all').sort()).toEqual(['0001', 'fsr-1', '0004'].sort())
  })

  it('a pool or an amount filter leaves the department batches out rather than read inside them', () => {
    expect(buildHubLedger(input({ params: { pool: 'venture_pool' }, byPerson: false })).batches).toEqual([])
    expect(buildHubLedger(input({ params: { min: '1' }, byPerson: false })).batches).toEqual([])
  })

  it('?status= opens on its card; anything else on All', () => {
    expect(buildHubLedger(input({ params: { status: 'pending_approval' } })).initialCard).toBe('pending_approval')
    expect(buildHubLedger(input({ params: { status: 'payroll' } })).initialCard).toBe('payroll')
    expect(buildHubLedger(input({ params: { status: 'nonsense' } })).initialCard).toBe('all')
    expect(buildHubLedger(input({ params: { q: ' Meta ' } })).initialQuery).toBe('Meta')
  })
})

describe('a batch’s words', () => {
  it('says all when every voucher stands alike', () => {
    expect(batchStatusText({ paid: 22 })).toBe('all paid')
    expect(batchStatusText({ paid: 20, pending_approval: 6 })).toBe('20 paid · 6 pending')
    expect(batchStatusText({ paid: 3 }, true)).toBe('all received')
  })
})

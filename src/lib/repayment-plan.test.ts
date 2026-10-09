import { describe, expect, it } from 'vitest'
import { buildRepaymentPlan, type PlanPayment } from './repayment-plan'
import type { PositionTerms } from './treasury-terms'

// 2026-10-09 — the Repayment schedule on a fund source's and a loan's page
// (the user's Claude Design handoff: "the repayment schedule replaces the
// repayment history, with Balance / Outstanding / Remark columns"). One row
// per installment by the terms in force — a changed rate re-bases from the
// month it took effect — and the money received set against them oldest
// first: principal against principal, interest against interest (a penalty
// pays neither). A row reads Paid, Part paid, Overdue, Settled early, or
// nothing yet; Balance is what the plan still has to collect after it.

const flat = (over: Partial<PositionTerms['current']> = {}, history: PositionTerms['history'] = []): PositionTerms => ({
  principal: 120000,
  startYM: '2026-01',
  firstDueYM: '2026-02',
  current: { rate: 0.01, months: 12, compounding: false, effectiveFrom: null, ...over },
  history,
})
const pay = (date: string, type: string, amount: number, ref: string | null = null): PlanPayment => ({ date, type, amount, ref })
const isPrincipal = (t: string) => t === 'principal'

describe('a fixed-term plan', () => {
  it('lays out every installment and sets the money against them, oldest first', () => {
    const plan = buildRepaymentPlan({
      terms: flat(),
      payments: [
        pay('2026-02-15', 'principal', 10000, 'HV-OR-1'), pay('2026-02-15', 'interest', 1200, 'HV-OR-1'),
        pay('2026-03-15', 'principal', 10000, 'HV-OR-2'), pay('2026-03-15', 'interest', 1200, 'HV-OR-2'),
        pay('2026-04-20', 'principal', 10000, 'HV-OR-3'), pay('2026-04-20', 'interest', 600, 'HV-OR-3'),
        pay('2026-04-20', 'penalty', 50, 'HV-OR-3'),
      ],
      isPrincipal,
      today: '2026-06-20',
      dueDay: 15,
      status: 'active',
    })
    expect(plan.kind).toBe('fixed')
    expect(plan.rows).toHaveLength(12)
    expect(plan.rows.map((r) => [r.no, r.due, r.installment, r.principal, r.interest])).toContainEqual([1, '2026-02-15', 11200, 10000, 1200])
    expect(plan.rows[0]).toMatchObject({ balance: 123200, outstanding: 0, remark: 'Paid 15 Feb 2026 · HV-OR-1', tone: 'ledger' })
    expect(plan.rows[1]).toMatchObject({ outstanding: 0, remark: 'Paid 15 Mar 2026 · HV-OR-2', tone: 'ledger' })
    expect(plan.rows[2]).toMatchObject({ outstanding: 600, remark: 'Part paid RM 10,600.00 · short RM 600.00', tone: 'alert' })
    expect(plan.rows[3]).toMatchObject({ due: '2026-05-15', outstanding: 11200, remark: 'Overdue 36 days', tone: 'danger' })
    expect(plan.rows[4]).toMatchObject({ due: '2026-06-15', remark: 'Overdue 5 days', tone: 'danger' })
    expect(plan.rows[5]).toMatchObject({ due: '2026-07-15', outstanding: 11200, remark: '', tone: '' })
    expect(plan.rows[11]).toMatchObject({ due: '2027-01-15', balance: 0 })
    expect(plan).toMatchObject({
      months: 12, paidCount: 2, outstandingDue: 600 + 9 * 11200, firstDue: '2026-02-15', firstInstallment: 11200,
      totalInterest: 14400, principalPaid: 30000, interestPaid: 3000, principalOwed: 90000,
    })
  })

  it('puts the last cent of principal on the last installment', () => {
    const plan = buildRepaymentPlan({ terms: { ...flat({ months: 3 }), principal: 100000 }, payments: [], isPrincipal, today: '2026-01-20', dueDay: 1, status: 'active' })
    expect(plan.rows.map((r) => r.principal)).toEqual([33333.33, 33333.33, 33333.34])
  })

  it('reads a lump that clears the principal as the rest settled early', () => {
    const plan = buildRepaymentPlan({
      terms: flat(),
      payments: [
        pay('2026-02-15', 'principal', 10000, 'HV-OR-1'), pay('2026-02-15', 'interest', 1200, 'HV-OR-1'),
        pay('2026-03-10', 'principal', 110000, 'HV-OR-2'), pay('2026-03-10', 'interest', 1200, 'HV-OR-2'),
      ],
      isPrincipal,
      today: '2026-06-20',
      dueDay: 15,
      status: 'fully_repaid',
    })
    expect(plan.rows[1]).toMatchObject({ remark: 'Paid 10 Mar 2026 · HV-OR-2', tone: 'ledger', outstanding: 0 })
    expect(plan.rows[2]).toMatchObject({ remark: 'Settled early · 10 Mar 2026', tone: 'info', outstanding: 0 })
    expect(plan.rows[11]).toMatchObject({ tone: 'info', outstanding: 0 })
    expect(plan).toMatchObject({ paidCount: 2, outstandingDue: 0, principalOwed: 0 })
  })

  it('re-bases from the month a new rate took effect, and says so on that row', () => {
    const plan = buildRepaymentPlan({
      terms: flat({ rate: 0.015, months: 9, effectiveFrom: '2026-05' }, [{ validFrom: '2026-02', validTo: '2026-04', rate: 0.01, months: 12, compounding: false }]),
      payments: [
        pay('2026-02-15', 'principal', 10000), pay('2026-02-15', 'interest', 1200),
        pay('2026-03-15', 'principal', 10000), pay('2026-03-15', 'interest', 1200),
        pay('2026-04-15', 'principal', 10000), pay('2026-04-15', 'interest', 1200),
      ],
      isPrincipal,
      today: '2026-04-30',
      dueDay: 15,
      status: 'active',
    })
    expect(plan.rows).toHaveLength(12)
    expect(plan.rows[3]).toMatchObject({ due: '2026-05-15', principal: 10000, interest: 1350, installment: 11350, remark: 'Rate change from 2026-05: 1.500%', tone: 'alert' })
    expect(plan.rows[2]).toMatchObject({ remark: 'Paid 15 Apr 2026', tone: 'ledger' })
    expect(plan.totalInterest).toBe(3600 + 9 * 1350)
  })

  it('shows a pending deal’s plan with nothing overdue, and a cancelled one none at all', () => {
    const pending = buildRepaymentPlan({ terms: flat(), payments: [], isPrincipal, today: '2026-06-20', dueDay: 15, status: 'pending_approval' })
    expect(pending.rows).toHaveLength(12)
    expect(pending.rows.every((r) => r.tone === '' && r.remark === '')).toBe(true)
    const cancelled = buildRepaymentPlan({ terms: flat(), payments: [], isPrincipal, today: '2026-06-20', dueDay: 15, status: 'cancelled' })
    expect(cancelled).toMatchObject({ kind: 'none', rows: [] })
  })
})

describe('a deal with no fixed term', () => {
  it('runs month by month to date — interest on the base, principal as it comes', () => {
    const plan = buildRepaymentPlan({
      terms: { principal: 100000, startYM: '2026-03', firstDueYM: '2026-04', current: { rate: 0.01, months: null, compounding: false, effectiveFrom: null }, history: [] },
      payments: [
        pay('2026-04-01', 'interest', 1000, 'HV-OR-1'),
        pay('2026-05-01', 'interest', 1000, 'HV-OR-2'), pay('2026-05-01', 'principal', 20000, 'HV-OR-2'),
        pay('2026-07-01', 'interest', 800, 'HV-OR-3'),
      ],
      isPrincipal,
      today: '2026-07-10',
      dueDay: 1,
      status: 'active',
    })
    expect(plan.kind).toBe('open')
    expect(plan.rows.map((r) => [r.due, r.principal, r.interest, r.balance])).toEqual([
      ['2026-04-01', null, 1000, 100000],
      ['2026-05-01', 20000, 1000, 80000],
      ['2026-06-01', null, 1000, 80000],
      ['2026-07-01', null, 1000, 80000],
    ])
    expect(plan.rows[0]).toMatchObject({ remark: 'Paid 1 Apr 2026 · HV-OR-1', tone: 'ledger', outstanding: 0 })
    expect(plan.rows[1]).toMatchObject({ remark: 'Paid 1 May 2026 · HV-OR-2 · principal RM 20,000.00', tone: 'ledger' })
    expect(plan.rows[2]).toMatchObject({ remark: 'Part paid RM 800.00 · short RM 200.00', tone: 'alert', outstanding: 200 })
    expect(plan.rows[3]).toMatchObject({ remark: 'Overdue 9 days', tone: 'danger', outstanding: 1000 })
    expect(plan).toMatchObject({ paidCount: 2, outstandingDue: 1200, principalOwed: 80000, months: null })
  })

  it('compounds an unpaid month into the balance', () => {
    const plan = buildRepaymentPlan({
      terms: { principal: 10000, startYM: '2026-01', firstDueYM: '2026-02', current: { rate: 0.04, months: null, compounding: true, effectiveFrom: null }, history: [] },
      payments: [pay('2026-02-20', 'interest', 400, 'HV-PV-9')],
      isPrincipal,
      today: '2026-04-15',
      dueDay: 20,
      status: 'active',
    })
    expect(plan.kind).toBe('open')
    expect(plan.rows.map((r) => [r.due, r.interest, r.balance, r.outstanding])).toEqual([
      ['2026-02-20', 400, 10000, 0],
      ['2026-03-20', 400, 10400, 0],
      ['2026-04-20', 416, 10816, 416],
    ])
    expect(plan.rows[0]).toMatchObject({ remark: 'Paid 20 Feb 2026 · HV-PV-9', tone: 'ledger' })
    expect(plan.rows[1]).toMatchObject({ remark: 'Unpaid — added to the balance', tone: 'alert' })
    expect(plan.rows[2]).toMatchObject({ remark: '', tone: '' })
  })
})

// Cases from the live book (2026-10-09), cut down.
describe('the live book’s rounding', () => {
  it('takes a stored rate’s rounding in its stride — a few sen short each month is still paid', () => {
    // 300,000 at 0.5556% — interest by the terms 1,666.80, paid 1,666.67 a month.
    const terms: PositionTerms = { principal: 300000, startYM: '2025-01', firstDueYM: '2025-01', current: { rate: 0.005556, months: 36, compounding: false, effectiveFrom: null }, history: [] }
    const payments: PlanPayment[] = []
    for (let k = 0; k < 13; k++) {
      const d = `${k < 12 ? '2025' : '2026'}-${String((k % 12) + 1).padStart(2, '0')}-01`
      payments.push(pay(d, 'principal', k === 12 ? 8333.37 : 8333.33), pay(d, 'interest', 1666.67))
    }
    payments.push(pay('2026-08-05', 'principal', 183333.34, 'HV-PV-202608-0251'), pay('2026-08-05', 'interest', 36666.66, 'HV-PV-202608-0251'))
    const plan = buildRepaymentPlan({ terms, payments, isPrincipal, today: '2026-10-09', dueDay: 1, status: 'active' })
    expect(plan.paidCount).toBe(35)
    expect(plan.rows[34]).toMatchObject({ outstanding: 0, tone: 'ledger', remark: 'Paid 5 Aug 2026 · HV-PV-202608-0251' })
    expect(plan.rows[35]).toMatchObject({ due: '2027-12-01', tone: '', remark: '' })
    expect(plan.rows.filter((r) => r.tone === 'alert')).toHaveLength(0)
  })

  it('leaves a few sen over on the next installment unremarked', () => {
    // 80,000 over 60 at 0.5%: twelve installments and RM 4.04 over.
    const terms: PositionTerms = { principal: 80000, startYM: '2025-05', firstDueYM: '2025-07', current: { rate: 0.005, months: 60, compounding: false, effectiveFrom: null }, history: [] }
    const plan = buildRepaymentPlan({
      terms,
      payments: [pay('2026-06-05', 'principal', 16004), pay('2026-06-05', 'interest', 4800)],
      isPrincipal,
      today: '2026-10-09',
      dueDay: 31,
      status: 'active',
    })
    expect(plan.paidCount).toBe(12)
    expect(plan.rows[12]).toMatchObject({ due: '2026-07-31', remark: 'Overdue 70 days', tone: 'danger' })
    expect(plan.rows[7].due).toBe('2026-02-28')
  })

  it('reads a month with no interest as no installment, only the principal that came in', () => {
    const plan = buildRepaymentPlan({
      terms: { principal: 52500, startYM: '2026-03', firstDueYM: '2026-04', current: { rate: 0, months: null, compounding: false, effectiveFrom: null }, history: [] },
      payments: [pay('2026-05-10', 'principal', 10000, 'HV-OR-7')],
      isPrincipal,
      today: '2026-06-09',
      dueDay: 26,
      status: 'active',
    })
    expect(plan.rows.map((r) => [r.due, r.principal, r.outstanding, r.remark, r.tone])).toEqual([
      ['2026-04-26', null, 0, '', ''],
      ['2026-05-26', 10000, 0, 'Principal RM 10,000.00 repaid', ''],
      ['2026-06-26', null, 0, '', ''],
    ])
    expect(plan.paidCount).toBe(0)
  })

  it('stops a repaid compounding deal at the month it was repaid', () => {
    const plan = buildRepaymentPlan({
      terms: { principal: 22873.5, startYM: '2025-12', firstDueYM: '2026-01', current: { rate: 0.02, months: null, compounding: true, effectiveFrom: null }, history: [] },
      payments: [pay('2026-08-20', 'principal', 22873.5, 'HV-PV-202608-0297'), pay('2026-08-20', 'interest', 3926.45, 'HV-PV-202608-0297')],
      isPrincipal,
      today: '2026-10-09',
      dueDay: 1,
      status: 'repaid',
    })
    expect(plan.rows).toHaveLength(8)
    expect(plan.rows[7]).toMatchObject({ ym: '2026-08', interest: 525.49, balance: 0, tone: 'ledger', remark: 'Paid 20 Aug 2026 · HV-PV-202608-0297 · principal RM 22,873.50' })
    expect(plan.rows[0]).toMatchObject({ interest: 457.47, balance: 23330.97, remark: 'Unpaid — added to the balance' })
  })
})

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

  // BI#7 (2026-10-24): 60,000 from 5 Apr 2025 at 0.5% × 60 (first due May), 1,000 + 300 paid every month from
  // the day the money came; turned no-fixed-term at 0.833% from Jan 2026 (51,000 owed then → 424.83).
  const BI7: PositionTerms = {
    principal: 60000,
    startYM: '2025-04',
    firstDueYM: '2025-05',
    current: { rate: 0.00833, months: null, compounding: false, effectiveFrom: '2026-01' },
    history: [{ validFrom: '2025-05', validTo: '2025-12', rate: 0.005, months: 60, compounding: false }],
  }
  const BI7_PAID = ['2025-04-05', '2025-05-05', '2025-06-05', '2025-07-05', '2025-08-05', '2025-09-05', '2025-10-05', '2025-11-05', '2025-12-05', '2026-01-05', '2026-02-05', '2026-03-05', '2026-04-05', '2026-05-05', '2026-06-08', '2026-07-09', '2026-08-10', '2026-09-08', '2026-10-15']
  const bi7 = () =>
    buildRepaymentPlan({
      terms: BI7,
      payments: BI7_PAID.flatMap((d) => [pay(d, 'principal', 1000), pay(d, 'interest', 300)]),
      isPrincipal,
      today: '2026-10-24',
      dueDay: 5,
      status: 'active',
    })

  it('asks a fixed month’s principal still, once the deal turned no-fixed-term later — May–Dec 2025 read 1,300', () => {
    const plan = bi7()
    expect(plan.kind).toBe('open')
    expect(plan.rows.slice(0, 8).map((r) => [r.due, r.installment, r.principal, r.interest, r.outstanding])).toEqual(
      ['05', '06', '07', '08', '09', '10', '11', '12'].map((m) => [`2025-${m}-05`, 1300, 1000, 300, 0]),
    )
    expect(plan.rows[0].remark).toBe('Paid 5 Apr 2025')
    expect(plan.rows[7].remark).toBe('Paid 5 Nov 2025')
    // From January no principal falls due: the interest alone, the principal as it came in.
    expect(plan.rows[8]).toMatchObject({ due: '2026-01-05', installment: 424.83, principal: 1000, interest: 424.83, outstanding: 0, remark: 'Paid 5 Jan 2026 · principal RM 1,000.00' })
    expect(plan.rows[15]).toMatchObject({ due: '2026-08-05', installment: 424.83, outstanding: 98.64, remark: 'Part paid RM 326.19 · short RM 98.64 · principal RM 1,000.00', tone: 'alert' })
    expect(plan.rows[17]).toMatchObject({ due: '2026-10-05', installment: 424.83, outstanding: 424.83, remark: 'Overdue 19 days · principal RM 1,000.00', tone: 'danger' })
    expect(plan).toMatchObject({ firstInstallment: 1300, paidCount: 15, outstandingDue: 948.3 })
  })

  it('takes principal repaid before the first month off the balance — BI#7 owes 41,000, not 42,000', () => {
    const plan = bi7()
    expect(plan.rows[0].balance).toBe(58000) // 5 Apr and 5 May 2025 are in
    expect(plan.rows[7].balance).toBe(51000) // the base January re-bases on
    expect(plan.rows[17].balance).toBe(41000)
    expect(plan.principalOwed).toBe(41000)

    const open = buildRepaymentPlan({
      terms: { principal: 100000, startYM: '2026-03', firstDueYM: '2026-04', current: { rate: 0.01, months: null, compounding: false, effectiveFrom: null }, history: [] },
      payments: [pay('2026-03-20', 'principal', 10000), pay('2026-04-01', 'interest', 1000)],
      isPrincipal,
      today: '2026-04-10',
      dueDay: 1,
      status: 'active',
    })
    expect(open.rows.map((r) => [r.due, r.installment, r.principal, r.balance, r.remark])).toEqual([['2026-04-01', 1000, null, 90000, 'Paid 1 Apr 2026']])
  })

  it('asks no principal of a fixed month past that schedule’s end, and an unpaid fixed month owes both', () => {
    const plan = buildRepaymentPlan({
      terms: {
        principal: 3000,
        startYM: '2026-01',
        firstDueYM: '2026-02',
        current: { rate: 0.01, months: null, compounding: false, effectiveFrom: '2026-06' },
        // 3 instalments Feb–Apr, the change filed from June: May sits in the old segment past its schedule.
        history: [{ validFrom: '2026-02', validTo: '2026-05', rate: 0.01, months: 3, compounding: false }],
      },
      payments: [pay('2026-02-01', 'principal', 1000), pay('2026-02-01', 'interest', 30), pay('2026-03-01', 'principal', 1000), pay('2026-03-01', 'interest', 30)],
      isPrincipal,
      today: '2026-06-10',
      dueDay: 1,
      status: 'active',
    })
    expect(plan.rows.map((r) => [r.due, r.installment, r.principal, r.outstanding, r.tone])).toEqual([
      ['2026-02-01', 1030, 1000, 0, 'ledger'],
      ['2026-03-01', 1030, 1000, 0, 'ledger'],
      ['2026-04-01', 1030, 1000, 1030, 'danger'], // nothing came in April: its principal and its interest are owed
      ['2026-05-01', 30, null, 30, 'danger'],
      ['2026-06-01', 10, null, 10, 'danger'], // 1,000 still owed at June × 1%
    ])
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
    expect(plan.rows[0]).toMatchObject({ remark: 'Paid 20 Feb 2026 · HV-PV-9', tone: 'ledger', paid: 400, toBalance: 0 })
    expect(plan.rows[1]).toMatchObject({ remark: 'Unpaid · 400.00 to balance', tone: 'alert', paid: 0, toBalance: 400 })
    expect(plan.rows[2]).toMatchObject({ remark: '', tone: '' })
    // April's 416 is not past its day (20 Apr): owed, not overdue.
    expect(plan).toMatchObject({ overdue: 0, overdueSince: null, compound: { breaks: [], owedNow: 10816, paidToDate: 400, addedToBalance: 400, addedFrom: '2026-03', addedTo: '2026-03' } })
  })

  // LO#7 (2026-10-24): 60,000 from 5 Apr 2025 at 0.5% flat × 60 (1,000 + 300), then 4% compounding with no fixed term
  // from January 2026; 1,300 a month came in to September. The schedule read every month as compounding — 2025's
  // interest 300, 295, 289.98… and January's roll from 50,817.88 — where the Company Statement rolls from the 51,000
  // still owed in January (compoundRoll). Now the two agree.
  it('keeps a deal’s flat months flat and rolls from the month it turned compounding, on the principal owed then', () => {
    const DATES = ['2025-04-05', '2025-05-05', '2025-06-05', '2025-07-05', '2025-08-05', '2025-09-05', '2025-10-05', '2025-11-05', '2025-12-05', '2026-01-05', '2026-02-05', '2026-03-05', '2026-04-05', '2026-05-05', '2026-06-08', '2026-07-14', '2026-08-11', '2026-09-19']
    const plan = buildRepaymentPlan({
      terms: {
        principal: 60000,
        startYM: '2025-04',
        firstDueYM: '2025-04',
        current: { rate: 0.04, months: null, compounding: true, effectiveFrom: '2026-01' },
        history: [{ validFrom: '2025-04', validTo: '2025-12', rate: 0.005, months: 60, compounding: false }],
      },
      payments: DATES.flatMap((d) => [pay(d, 'principal', 1000), pay(d, 'interest', 300)]),
      isPrincipal,
      today: '2026-10-24',
      dueDay: 5,
      status: 'active',
    })
    expect(plan.rows).toHaveLength(19)
    // Apr–Dec 2025: as their flat terms asked, 1,000 + 300 paid each, the principal owed after each.
    expect(plan.rows.slice(0, 9).map((r) => [r.installment, r.principal, r.interest, r.paid, r.balance, r.outstanding, r.tone])).toEqual(
      [59000, 58000, 57000, 56000, 55000, 54000, 53000, 52000, 51000].map((b) => [1300, 1000, 300, 1300, b, 0, 'ledger']),
    )
    expect(plan.rows[0].remark).toBe('Paid 5 Apr 2025')
    // January on: 4% on the rolled balance from the 51,000 owed; each month's short interest to the balance.
    expect(plan.rows.slice(9).map((r) => [r.due, r.installment, r.paid, r.toBalance, r.balance, r.outstanding])).toEqual([
      ['2026-01-05', 2040, 1300, 740, 51740, 0],
      ['2026-02-05', 2069.6, 1300, 769.6, 52509.6, 0],
      ['2026-03-05', 2100.38, 1300, 800.38, 53309.98, 0],
      ['2026-04-05', 2132.4, 1300, 832.4, 54142.38, 0],
      ['2026-05-05', 2165.7, 1300, 865.7, 55008.08, 0],
      ['2026-06-05', 2200.32, 1300, 900.32, 55908.4, 0],
      ['2026-07-05', 2236.34, 1300, 936.34, 56844.74, 0],
      ['2026-08-05', 2273.79, 1300, 973.79, 57818.53, 0],
      ['2026-09-05', 2312.74, 1300, 1012.74, 58831.27, 0],
      ['2026-10-05', 2353.25, 0, 0, 61184.52, 2353.25],
    ])
    expect(plan.rows[9].remark).toBe('Part paid · 740.00 to balance')
    expect(plan.rows[18]).toMatchObject({ remark: 'Overdue 19 days', tone: 'danger', late: true })
    expect(plan).toMatchObject({ overdue: 2353.25, overdueSince: '2026-10-05', overdueDays: 19 })
    expect(plan.compound).toEqual({
      breaks: [
        { no: 1, head: 'Apr 2025 – Dec 2025', rest: '0.500% /mo flat · RM 1,000.00 + 300.00 a month' },
        { no: 10, head: 'From Jan 2026', rest: '4.000% /mo compounding · no fixed term · rolls from RM 51,000.00 owed' },
      ],
      owedNow: 61184.52,
      paidToDate: 23400,
      addedToBalance: 7831.27,
      addedFrom: '2026-01',
      addedTo: '2026-09',
    })
    // The table's total adds up: what was due = what came in + what was rolled in + what is overdue.
    const due = Math.round(plan.rows.reduce((s, r) => s + r.installment, 0) * 100) / 100
    expect([due, Math.round((plan.compound!.paidToDate + plan.compound!.addedToBalance + plan.overdue) * 100) / 100]).toEqual([33584.52, 33584.52])
  })

  it('says what is overdue on a no-fixed-term plan’s head, and on a fixed plan’s nothing changes', () => {
    const open = buildRepaymentPlan({
      terms: { principal: 100000, startYM: '2026-03', firstDueYM: '2026-04', current: { rate: 0.01, months: null, compounding: false, effectiveFrom: null }, history: [] },
      payments: [pay('2026-04-10', 'interest', 1000)],
      isPrincipal,
      today: '2026-06-15',
      dueDay: 10,
      status: 'active',
    })
    expect([open.overdue, open.overdueSince, open.overdueDays, open.compound]).toEqual([2000, '2026-05-10', 36, null])
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
    expect(plan.rows[7]).toMatchObject({ ym: '2026-08', interest: 525.49, balance: 0, tone: 'ledger', remark: 'Paid 20 Aug 2026 · HV-PV-202608-0297', paid: 26799.95 })
    expect(plan.rows[0]).toMatchObject({ interest: 457.47, balance: 23330.97, remark: 'Unpaid · 457.47 to balance' })
  })
})

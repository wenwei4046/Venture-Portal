import { describe, expect, it } from 'vitest'
import { monthsBeforeOpen, openFromChoices, previewRows, readRepayment, repaymentSummary, repaymentWords, typedAmount, type Words } from './repayment-type'

// Repayment type (2026-10-27, the user's mockups principal-input-mockup.html and fund-forms-desktop-mockup.html): what a
// fixed amount a month or a number of months works out to — the user's own examples: 51,000 at 1,000 (51 months even)
// and at 1,300 (39 × 1,300 then 300), BI#7's 1,000 a month until October, and a new 60,000 at 7,000.

const plain = (w: Words) => w.map((x) => (typeof x === 'string' ? x : x.b)).join('')

describe('the box read', () => {
  it('a fixed amount a month: the months it takes, the last one taking what is left', () => {
    expect(readRepayment('amount', '1,000', 51000)).toEqual({ ok: true, plan: { months: 51, perMonth: 1000, last: 1000 } })
    expect(readRepayment('amount', '1300', 51000)).toEqual({ ok: true, plan: { months: 40, perMonth: 1300, last: 300 } })
    // More than is owed: it all falls due in the first month.
    expect(readRepayment('amount', '60000', 51000)).toEqual({ ok: true, plan: { months: 1, perMonth: 51000, last: 51000 } })
  })

  it('a number of months: equal parts, the last taking the sen left over', () => {
    expect(readRepayment('months', '12', 30000)).toEqual({ ok: true, plan: { months: 12, perMonth: 2500, last: 2500 } })
    expect(readRepayment('months', '7', 60000)).toEqual({ ok: true, plan: { months: 7, perMonth: 8571.43, last: 8571.42 } })
  })

  it('says what it still waits for', () => {
    expect(readRepayment('amount', '', 51000)).toEqual({ ok: false, wait: 'Type the principal due each month.' })
    expect(readRepayment('amount', 'abc', 51000)).toEqual({ ok: false, wait: 'Type an amount above 0.' })
    expect(readRepayment('amount', '100', 51000)).toEqual({ ok: false, wait: 'At RM 100.00 a month it takes 510 months — the most is 120.' })
    expect(readRepayment('months', '', 51000)).toEqual({ ok: false, wait: 'Type how many months.' })
    expect(readRepayment('months', '121', 51000)).toEqual({ ok: false, wait: 'Whole months, from 1 to 120.' })
    expect(readRepayment('months', '12', 0)).toEqual({ ok: false, wait: 'Fill in the amount first.' })
    expect(typedAmount(' 1,300.50 ')).toBe(1300.5)
  })
})

describe('in words, under the box', () => {
  it('even, uneven, all at once', () => {
    const even = readRepayment('amount', '1000', 51000)
    const uneven = readRepayment('amount', '1300', 51000)
    if (!even.ok || !uneven.ok) throw new Error('read')
    expect(plain(repaymentWords('amount', even.plan, 51000, '2026-01', null).words)).toBe('51 months to clear RM 51,000.00 — the last in Mar 2030.')
    expect(plain(repaymentWords('amount', uneven.plan, 51000, '2026-01', null).words)).toBe('39 × RM 1,300.00, then RM 300.00 in Apr 2029 — 40 months to clear RM 51,000.00.')
    expect(plain(repaymentWords('amount', { months: 1, perMonth: 51000, last: 51000 }, 51000, '2026-01', null).words)).toBe('All RM 51,000.00 falls due in Jan 2026.')
  })

  it('a number of months says its amount a month, and its last when the sen are left over', () => {
    const p = readRepayment('months', '7', 60000)
    if (!p.ok) throw new Error('read')
    expect(plain(repaymentWords('months', p.plan, 60000, '2026-12', null).words)).toBe(
      'RM 8,571.43 a month (RM 60,000.00 ÷ 7) — the last in Jun 2027, which is RM 8,571.42 so it adds up to RM 60,000.00.',
    )
  })

  it('BI#7: the fixed term ending in October, and what is still owed then', () => {
    const p = readRepayment('amount', '1000', 51000)
    if (!p.ok) throw new Error('read')
    expect(plain(repaymentWords('amount', p.plan, 51000, '2026-01', '2026-10').words)).toBe(
      'RM 1,000.00 a month, Jan 2026 – Sep 2026 — 9 months. From Oct 2026 no principal falls due; RM 42,000.00 is still owed then, with no fixed term.',
    )
    expect(monthsBeforeOpen(p.plan, '2026-01', '2026-10')).toBe(9)
  })

  it('a fixed term ended after the plan clears changes nothing, and says so', () => {
    const p = readRepayment('amount', '10000', 51000)
    if (!p.ok) throw new Error('read')
    expect(repaymentWords('amount', p.plan, 51000, '2026-01', '2026-10').late).toBe('Cleared by Jun 2026, before Oct 2026 — so “No fixed term from” changes nothing.')
  })
})

describe('the schedule beside the form', () => {
  it('BI#7: 1,000 + 424.83 to September, then interest alone', () => {
    const p = readRepayment('amount', '1000', 51000)
    if (!p.ok) throw new Error('read')
    expect(previewRows({ choice: 'amount', plan: p.plan, startYM: '2026-01', interest: 424.83, interestBase: 51000, openFromYM: '2026-10' })).toEqual({
      rows: [
        { months: 'Jan 2026 – Sep 2026', principal: 1000, interest: 424.83, due: 1424.83 },
        { months: 'From Oct 2026', principal: null, interest: 424.83, due: 424.83 },
      ],
      foot: 'Principal unpaid by its month counts as overdue up to Sep 2026; from Oct 2026 only interest falls due, still on RM 51,000.00.',
    })
  })

  it('an uneven amount: its last month apart', () => {
    const p = readRepayment('amount', '7000', 60000)
    if (!p.ok) throw new Error('read')
    expect(previewRows({ choice: 'amount', plan: p.plan, startYM: '2026-11', interest: 1110, interestBase: 60000, openFromYM: null }).rows).toEqual([
      { months: 'Nov 2026 – Jun 2027', principal: 7000, interest: 1110, due: 8110 },
      { months: 'Jul 2027', principal: 4000, interest: 1110, due: 5110, last: true },
    ])
  })

  it('none: interest alone from the first month; compounding: no interest figure', () => {
    expect(previewRows({ choice: 'none', plan: null, startYM: '2026-11', interest: 600, interestBase: 30000, openFromYM: null })).toEqual({
      rows: [{ months: 'From Nov 2026', principal: null, interest: 600, due: 600 }],
      foot: 'No principal falls due; repay any amount, any time.',
    })
    expect(previewRows({ choice: 'months', plan: { months: 12, perMonth: 2500, last: 2500 }, startYM: '2026-11', interest: null, interestBase: null, openFromYM: null }).rows).toEqual([
      { months: 'Nov 2026 – Oct 2027', principal: 2500, interest: null, due: 2500 },
    ])
  })

  it('the summary’s line and the months a fixed term may end from', () => {
    expect(repaymentSummary('amount', { months: 40, perMonth: 1300, last: 300 }, '2026-01')).toBe('39 × RM 1,300.00 + RM 300.00, Jan 2026 – Apr 2029')
    expect(repaymentSummary('amount', { months: 51, perMonth: 1000, last: 1000 }, '2026-01')).toBe('RM 1,000.00 × 51, Jan 2026 – Mar 2030')
    expect(repaymentSummary('months', { months: 12, perMonth: 2500, last: 2500 }, '2026-11')).toBe('12 months × RM 2,500.00, Nov 2026 – Oct 2027')
    expect(repaymentSummary('none', null, '2026-11')).toBe('No fixed term — interest only')
    expect(openFromChoices('2026-01').slice(0, 2)).toEqual(['2026-02', '2026-03'])
    expect(openFromChoices('2026-01')).toHaveLength(60)
  })
})

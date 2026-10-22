import { describe, expect, it } from 'vitest'
import { figuresOf } from './principal-overview'
import { financeSummary } from './finance-overview'

// 2026-10-17 — the Principal's own view on Finance's Overview: the user kept "一排金额卡" — the Venture Pool, the
// Pool, what is lent out and this month's interest — read off the treasury dashboard's own summary, and the line
// leads with what waits for the Principal's decision.

describe('figuresOf', () => {
  it('takes the four figures the treasury dashboard showed, from its own summary', () => {
    expect(
      figuresOf({
        hv_fund_balance: '174095.24',
        total_pool: 475213.07,
        loans_outstanding: 1033418.39,
        monthly_interest_income: 33383.48,
        monthly_interest_expense: 23563.21,
        net_interest_income: 9820.27,
      }),
    ).toEqual({
      venturePool: 174095.24,
      pool: 475213.07,
      lentOut: 1033418.39,
      interest: { income: 33383.48, expense: 23563.21, net: 9820.27 },
    })
  })

  it('reads a missing figure as nothing, and says nothing at all for a refusal or no answer', () => {
    expect(figuresOf({ total_pool: 10 })?.venturePool).toBe(0)
    expect(figuresOf({ error: 'Access denied' })).toBeNull()
    expect(figuresOf(null)).toBeNull()
    expect(figuresOf('nonsense')).toBeNull()
  })
})

describe('financeSummary for the Principal’s own view', () => {
  const counts = { pending: 7, draft: 2, outstanding: 15, toBill: 0 }

  it('leads with what waits for their decision, in place of the vouchers waiting', () => {
    expect(financeSummary(counts, { waiting: 7 })).toBe('7 requests waiting for your approval · 15 invoices outstanding · 0 allocations to bill.')
    expect(financeSummary(counts, { waiting: 1 })).toBe('1 request waiting for your approval · 15 invoices outstanding · 0 allocations to bill.')
  })

  it('leaves the part out when the queue could not be read, and keeps Finance’s line without it', () => {
    expect(financeSummary(counts, { waiting: null })).toBe('15 invoices outstanding · 0 allocations to bill.')
    expect(financeSummary(counts)).toBe('7 vouchers waiting for approval · 15 invoices outstanding · 0 allocations to bill.')
  })
})

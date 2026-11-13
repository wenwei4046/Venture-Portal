import { describe, expect, it } from 'vitest'
import { buildRepaymentPlan } from './repayment-plan'
import { owedNowOf, scheduleMeta } from './deal-print'

// Total owed (2026-11-13 — "有办法看到我 total 还有还多少吗"): the printed sheet says the schedule's Owed now.
const plan = (compounding: boolean) =>
  buildRepaymentPlan({
    terms: { principal: 60000, startYM: '2026-07', firstDueYM: '2026-08', current: { rate: 0.04, months: null, compounding, effectiveFrom: null, principalPerMonth: null }, history: [] },
    payments: [{ date: '2026-11-03', type: 'principal', amount: 30000, ref: null }],
    isPrincipal: (t) => t === 'principal' || t === 'netting',
    today: '2026-11-13',
    dueDay: 24,
    status: 'active',
    minPayFromYM: '0000-00',
  })

describe('owedNowOf', () => {
  it('a flat deal: the principal still owed and the interest already due but unpaid', () => {
    const o = owedNowOf(plan(false))
    expect(o.principal).toBe(30000)
    expect(o.interest).toBe(7200)
    expect(o.total).toBe(37200)
  })

  it('the printed sheet carries it as Total owed, after Principal owed', () => {
    const p = plan(true)
    const meta = scheduleMeta({ label: 'Source', value: 'The Cont' }, 60000, '4.000% /mo', p)
    const at = meta.findIndex((m) => m.label === 'Total owed')
    expect(meta[at - 1].label).toBe('Principal owed')
    expect(meta[at].value).toContain(owedNowOf(p).total.toLocaleString('en-MY', { minimumFractionDigits: 2 }))
  })
})

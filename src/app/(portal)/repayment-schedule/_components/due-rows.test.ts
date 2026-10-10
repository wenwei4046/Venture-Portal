import { describe, expect, it } from 'vitest'
import { dueRows, dueTotals } from './due-rows'

// 2026-10-10 — the handoff's "Due to collect" table takes one row per deal
// and kind. A minimum-interest deal that also has its scheduled instalment
// this month is that instalment — its interest is in it — so it is listed
// once, and the Total counts its interest once. (Its minimum-interest check
// stays in the Full plans fold below.)

const sched = (key: string, principalDue: number, interestDue: number, received = 0) => ({
  key, counterparty: key.toUpperCase(), detail: '', principalDue, interestDue, totalDue: principalDue + interestDue, done: false, received,
})
const min = (key: string, due: number, paid = 0) => ({ key, counterparty: key.toUpperCase(), detail: '', due, paid, shortfall: Math.max(0, due - paid), met: paid >= due })

describe('the month’s due rows', () => {
  it('lists a minimum-interest deal with an instalment this month once, as the instalment', () => {
    const rows = dueRows({ rows: [sched('hc', 10000, 1200)], min: [min('hc', 1200), min('hm', 800)], compound: [], noTerm: [] })
    expect(rows.map((r) => `${r.type}:${r.id}`)).toEqual(['scheduled:hc', 'min:hm'])
    expect(dueTotals(rows)).toMatchObject({ principal: 10000, interest: 2000, total: 12000 })
  })

  it('keeps a minimum-interest deal with no instalment this month', () => {
    const rows = dueRows({ rows: [], min: [min('hm', 800, 300)], compound: [], noTerm: [] })
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ type: 'min', interest: 800, received: 300, short: 500 })
  })
})

import { describe, expect, it } from 'vitest'
import { describeNoComm, NO_COMM_LABEL, noCommNotice } from './bill-no-comm'
import { billCountAction, lockedCountLabel } from './bill-exclusion'

// 2026-11-14 — the user: "Down count（HR 那边）我觉得要分为两种：1. 一种是指完全不出 commission，但他还是有算在 revenue，还有
// 算在 margin 等等 2. 另外一种是不算 commission，同时也不算进 revenue、不算进 margin，跟他完全没有关系".
describe('no commission — the words (2026-11-14)', () => {
  it('names who took the commission off, the day in Malaysia, and why', () => {
    expect(describeNoComm({ note: 'keyed for ANTHONY', byName: 'HR', at: '2026-11-13T17:30:00Z' }))
      .toBe('No commission by HR on 14 Nov 2026 — keyed for ANTHONY')
    expect(describeNoComm({ note: null, byName: null, at: '2026-11-14T02:00:00Z' })).toBe('No commission on 14 Nov 2026')
    expect(NO_COMM_LABEL).toBe('No commission')
  })

  it('says what it did — and that it still counts in sales and margin', () => {
    expect(noCommNotice({ orderNo: 'HC-SO-2611-044', noComm: true }, 'November 2026'))
      .toBe('HC-SO-2611-044 pays no commission in November 2026 — no override and no KPI on it either. It still counts in sales and margin.')
    expect(noCommNotice({ orderNo: 'HC-SO-2611-044', noComm: true, halfCommOff: true }, 'November 2026'))
      .toMatch(/and its half comm is off\. It still counts in sales and margin\.$/)
    expect(noCommNotice({ orderNo: 'HC-SO-2611-044', noComm: false }, 'November 2026')).toBe('HC-SO-2611-044 pays its commission again.')
  })
})

describe('the count row on a bill that pays nobody (2026-11-14)', () => {
  const live = { cancelled: false, excludedReason: null, erpStatus: null, erpOnHold: false, excludedByHand: false }
  const opts = { runLocked: false, monthLabel: 'November 2026' }

  it('offers Count this bill again — its own kind, not the exclusion’s', () => {
    expect(billCountAction({ ...live, noComm: true }, opts)).toEqual({ kind: 'noComm' })
    expect(billCountAction({ ...live, noComm: false }, opts)).toEqual({ kind: 'exclude' })
  })

  it('a bill also out by hand counts again from the exclusion first', () => {
    const out = { ...live, cancelled: true, excludedReason: 'manual', excludedByHand: true, noComm: true }
    expect(billCountAction(out, opts)).toEqual({ kind: 'include', stillOut: null })
  })

  it('is shut in a paid month, its word still Count this bill again', () => {
    const shut = billCountAction({ ...live, noComm: true }, { ...opts, runLocked: true })
    expect(shut).toMatchObject({ kind: 'locked', excludedByHand: false, noComm: true })
    expect(lockedCountLabel(shut as Extract<typeof shut, { kind: 'locked' }>)).toBe('Count this bill again')
    const plain = billCountAction(live, { ...opts, runLocked: true })
    expect(lockedCountLabel(plain as Extract<typeof plain, { kind: 'locked' }>)).toBe("Don't count this bill")
  })
})

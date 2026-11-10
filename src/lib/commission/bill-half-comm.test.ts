import { describe, expect, it } from 'vitest'
import { billHalfCommAction, describeHalfComm, halfCommNotice } from './bill-half-comm'

const opts = { runLocked: false, monthLabel: 'October 2026' }

describe('bill-half-comm (2026-11-10)', () => {
  it('offers Half comm on a bill that counts, Full comm again on one that is half', () => {
    expect(billHalfCommAction({ halfComm: false }, opts)).toEqual({ kind: 'half' })
    expect(billHalfCommAction({ halfComm: true }, opts)).toEqual({ kind: 'full' })
  })

  it('offers nothing on an upsell, a drop or a bill that does not count', () => {
    expect(billHalfCommAction({ halfComm: false, upsale: true }, opts)).toBeNull()
    expect(billHalfCommAction({ halfComm: false, cancelled: true }, opts)).toBeNull()
  })

  it('is shut once the run has paid, or a holder is closed — saying why', () => {
    expect(billHalfCommAction({ halfComm: true }, { ...opts, runLocked: true })).toEqual({
      kind: 'locked', halved: true, reason: 'The run for October 2026 has paid — reopen it before changing what its bills pay',
    })
    expect(billHalfCommAction({ halfComm: false }, { ...opts, closedReason: 'LUIS TEO’s October 2026 is closed' }))
      .toEqual({ kind: 'locked', halved: false, reason: 'LUIS TEO’s October 2026 is closed' })
  })

  it('says who, when (Malaysia’s day) and why', () => {
    expect(describeHalfComm({ note: 'discount', byName: 'HR', at: '2026-11-09T17:30:00Z' })).toBe('Half comm by HR on 10 Nov 2026 — discount')
    expect(describeHalfComm({ note: null, byName: null, at: '2026-11-10T02:00:00Z' })).toBe('Half comm on 10 Nov 2026')
  })

  it('tells the notice what happened', () => {
    expect(halfCommNotice({ orderNo: 'HC-SO-2610-076', halved: true }, 'October 2026')).toMatch(/pays half its commission in October 2026/)
    expect(halfCommNotice({ orderNo: 'HC-SO-2610-076', halved: false }, 'October 2026')).toBe('HC-SO-2610-076 pays its full commission again.')
  })
})

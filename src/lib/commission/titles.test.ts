import { describe, expect, it } from 'vitest'
import { promotesTo, titleCanRecruit, titlePosition, type LadderRung } from './titles'

// The Fair ladder, 1:1 with the Revenue Department's six titles, plus one
// title that carries two rungs so the "lowest rung" rule is exercised.
const RS = 'title-rs'
const SRS = 'title-srs'
const TA = 'title-ta'
const STA = 'title-sta'
const TL = 'title-tl'
const STL = 'title-stl'

const LADDER: LadderRung[] = [
  { titleId: RS, canRecruit: false, sortOrder: 10 },
  { titleId: SRS, canRecruit: true, sortOrder: 20 },
  { titleId: TA, canRecruit: true, sortOrder: 30 },
  { titleId: STA, canRecruit: true, sortOrder: 40 },
  { titleId: TL, canRecruit: true, sortOrder: 50 },
  { titleId: STL, canRecruit: true, sortOrder: 60 },
]

/** The pre-2026-09-03 shape: 5% and 6% both "Revenue Specialist". */
const SHARED: LadderRung[] = [
  { titleId: RS, canRecruit: false, sortOrder: 10 },
  { titleId: RS, canRecruit: true, sortOrder: 20 },
  { titleId: TA, canRecruit: true, sortOrder: 30 },
]

describe('titlePosition', () => {
  it('is the sort order of the rung that carries the title', () => {
    expect(titlePosition(LADDER, TA)).toBe(30)
    expect(titlePosition(LADDER, STL)).toBe(60)
  })

  it('takes the LOWEST rung when a title spans several', () => {
    expect(titlePosition(SHARED, RS)).toBe(10)
  })

  it('is null for no title or a title the ladder does not carry', () => {
    expect(titlePosition(LADDER, null)).toBeNull()
    expect(titlePosition(LADDER, 'title-from-marketing')).toBeNull()
  })
})

describe('titleCanRecruit', () => {
  it('follows the title, not the rank: a 5% title may not, everything above may', () => {
    expect(titleCanRecruit(LADDER, RS)).toBe(false)
    expect(titleCanRecruit(LADDER, SRS)).toBe(true)
    expect(titleCanRecruit(LADDER, TA)).toBe(true)
  })

  it('a title may recruit when ANY rung it carries may', () => {
    // Revenue Specialist spans 5% (no) and 6% (yes) on the shared ladder.
    expect(titleCanRecruit(SHARED, RS)).toBe(true)
  })

  it('is null — "ask the rank instead" — when the title is not on the ladder', () => {
    expect(titleCanRecruit(LADDER, null)).toBeNull()
    expect(titleCanRecruit(LADDER, 'title-from-marketing')).toBeNull()
  })
})

describe('promotesTo — the ratchet', () => {
  it('raises a Senior Revenue Specialist paid at Team Assistant', () => {
    expect(promotesTo(LADDER, SRS, TA)).toBe(TA)
  })

  it('never lowers: a Team Assistant paid at 6% keeps Team Assistant', () => {
    // The user's July: missed the target, rate drops to 6%, title stays.
    expect(promotesTo(LADDER, TA, SRS)).toBeNull()
  })

  it('is null when the paid rank is the title they already hold', () => {
    expect(promotesTo(LADDER, TA, TA)).toBeNull()
  })

  it('gives somebody with no title their first ladder title', () => {
    expect(promotesTo(LADDER, null, RS)).toBe(RS)
  })

  it('treats a title from off the ladder as below every rung', () => {
    expect(promotesTo(LADDER, 'title-from-marketing', RS)).toBe(RS)
  })

  it('cannot promote to a title the ladder does not carry', () => {
    expect(promotesTo(LADDER, SRS, 'title-from-marketing')).toBeNull()
    expect(promotesTo(LADDER, SRS, null)).toBeNull()
  })

  it('a shared title is not a promotion within itself', () => {
    // 5% → 6% on the shared ladder: same title, no ratchet.
    expect(promotesTo(SHARED, RS, RS)).toBeNull()
  })
})

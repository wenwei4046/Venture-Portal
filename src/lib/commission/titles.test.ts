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

// ─── Title-driven rank assignation (2026-09-07) ──────────────────────────────

import { rankAfterTitleChange, rankForTitle, type AssignableRung } from './titles'

/** The Fair ladder with ids, lowest rate first. */
const RUNGS: AssignableRung[] = [
  { id: 'r10', titleId: RS, canRecruit: false, sortOrder: 10 },
  { id: 'r20', titleId: SRS, canRecruit: true, sortOrder: 20 },
  { id: 'r30', titleId: TA, canRecruit: true, sortOrder: 30 },
  { id: 'r40', titleId: STA, canRecruit: true, sortOrder: 40 },
  { id: 'r50', titleId: TL, canRecruit: true, sortOrder: 50 },
  { id: 'r60', titleId: STL, canRecruit: true, sortOrder: 60 },
]

/** One title carrying two rungs — the pre-2026-09-03 shape, with ids. */
const SHARED_RUNGS: AssignableRung[] = [
  { id: 's10', titleId: RS, canRecruit: false, sortOrder: 10 },
  { id: 's20', titleId: RS, canRecruit: true, sortOrder: 20 },
  { id: 's30', titleId: TA, canRecruit: true, sortOrder: 30 },
]

describe('rankForTitle', () => {
  it('is the rung that carries the title', () => {
    expect(rankForTitle(RUNGS, TL)?.id).toBe('r50')
  })

  it('is the LOWEST rung when a title carries several', () => {
    // The title is what somebody keeps, so the rank it guarantees is the
    // floor, not the best month it could reach.
    expect(rankForTitle(SHARED_RUNGS, RS)?.id).toBe('s10')
  })

  it('is undefined for a title the ladder does not carry', () => {
    expect(rankForTitle(RUNGS, 'title-finance-manager')).toBeUndefined()
  })

  it('is undefined for somebody with no title', () => {
    expect(rankForTitle(RUNGS, null)).toBeUndefined()
  })
})

describe('rankAfterTitleChange', () => {
  it('places somebody who has no rank yet at their title floor', () => {
    expect(rankAfterTitleChange(RUNGS, TA, null)?.id).toBe('r30')
  })

  it('raises a rank that sits below the new title floor', () => {
    // Promoted Revenue Specialist → Team Leader: 10 → 50.
    expect(rankAfterTitleChange(RUNGS, TL, 'r10')?.id).toBe('r50')
  })

  it('leaves a rank that already sits above the title floor alone', () => {
    // Placed at Team Leader by hand, then given the Team Assistant title —
    // the placement was deliberate and the ratchet never claws back.
    expect(rankAfterTitleChange(RUNGS, TA, 'r50')).toBeNull()
  })

  it('does nothing when the rank is already the floor', () => {
    expect(rankAfterTitleChange(RUNGS, TA, 'r30')).toBeNull()
  })

  it('does nothing for a title the ladder does not carry', () => {
    expect(rankAfterTitleChange(RUNGS, 'title-finance-manager', 'r10')).toBeNull()
  })

  it('does nothing for a title cleared to none', () => {
    expect(rankAfterTitleChange(RUNGS, null, 'r10')).toBeNull()
  })

  it("leaves alone a current rank this ladder does not carry, rather than guessing it is lower", () => {
    // Another scheme's rank id. Treating an unknown as "below everything"
    // would move somebody across schemes on a title edit.
    expect(rankAfterTitleChange(RUNGS, TL, 'some-other-schemes-rank')).toBeNull()
  })

  it('never oscillates against the title ratchet', () => {
    // promotesTo raises the TITLE when a rank stands above it;
    // rankAfterTitleChange raises the RANK when a title stands above it.
    // Applying one must not re-trigger the other.
    const raisedRank = rankAfterTitleChange(RUNGS, TL, 'r10')
    expect(raisedRank?.id).toBe('r50')
    // The person now holds TL at r50. The title ratchet asks: does r50's
    // title stand above TL? No — it IS TL.
    expect(promotesTo(RUNGS, TL, TL)).toBeNull()
    // And the rank ratchet, asked again, is now a no-op.
    expect(rankAfterTitleChange(RUNGS, TL, 'r50')).toBeNull()
  })
})

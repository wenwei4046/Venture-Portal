import { describe, it, expect } from 'vitest'
import { undoPlan, type PriorLine } from './hierarchy-undo'

/** Ali was moved from Ben onto Cara. */
const moved: PriorLine = {
  staffId: 'ali',
  staffName: 'Ali',
  reportsTo: 'ben',
  movedTo: 'cara',
}

describe('undoPlan', () => {
  it('puts the line back when nothing has moved since', () => {
    expect(undoPlan(moved, { reportsTo: 'cara' })).toEqual({ kind: 'restore', reportsTo: 'ben' })
  })

  it('puts the top of the tree back', () => {
    // Undoing a move that took somebody off the top has to write null, not skip
    // the write for want of a value. A null line is a state, not a gap.
    expect(undoPlan({ ...moved, reportsTo: null }, { reportsTo: 'cara' })).toEqual({
      kind: 'restore',
      reportsTo: null,
    })
  })

  it('puts a detach back', () => {
    expect(undoPlan({ ...moved, movedTo: null }, { reportsTo: null })).toEqual({
      kind: 'restore',
      reportsTo: 'ben',
    })
  })

  it('refuses when they have been moved again since', () => {
    const plan = undoPlan(moved, { reportsTo: 'dana' })
    expect(plan.kind).toBe('refuse')
    // Somebody made a later decision. Forcing the old value would throw it away
    // and report success for having done so.
    if (plan.kind === 'refuse') {
      expect(plan.note).toContain('moved again')
      expect(plan.note).toContain('Nothing was changed')
    }
  })

  it('refuses when a later move took them to the top', () => {
    expect(undoPlan(moved, { reportsTo: null }).kind).toBe('refuse')
  })
})

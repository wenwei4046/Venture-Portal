import { describe, it, expect } from 'vitest'
import { undoPlan, type PriorLine, type UndoSubject } from './hierarchy-undo'

/** Ali was moved from Ben onto Cara, and both lines followed. */
const moved: PriorLine = {
  staffId: 'ali',
  staffName: 'Ali',
  reportsTo: 'ben',
  commUplineId: 'ben',
  mirrored: true,
  movedTo: 'cara',
}

/** The world as it stands straight after that move, with nobody else touching it. */
const untouched: UndoSubject = {
  reportsTo: 'cara',
  hasPosition: true,
  commUplineId: 'cara',
}

describe('undoPlan', () => {
  it('puts both lines back when nothing has moved since', () => {
    expect(undoPlan(moved, untouched)).toEqual({
      kind: 'restore',
      reportsTo: 'ben',
      commission: 'restore',
      commUplineId: 'ben',
      note: null,
    })
  })

  it('puts the top of the tree back', () => {
    // Undoing a move that took somebody off the top has to write null, not skip
    // the write for want of a value. A null upline is a state, not a gap.
    const plan = undoPlan(
      { ...moved, reportsTo: null, commUplineId: null },
      untouched,
    )
    expect(plan).toMatchObject({ kind: 'restore', reportsTo: null, commUplineId: null })
  })

  it('refuses when they have been moved again since', () => {
    const plan = undoPlan(moved, { ...untouched, reportsTo: 'dana', commUplineId: 'dana' })
    expect(plan.kind).toBe('refuse')
    // Somebody made a later decision. Forcing the old value would throw it away
    // and report success for having done so.
    if (plan.kind === 'refuse') {
      expect(plan.note).toContain('moved again')
      expect(plan.note).toContain('Nothing was changed')
    }
  })

  it('refuses when the commission upline has been moved on the Revenue chart since', () => {
    const plan = undoPlan(moved, { ...untouched, commUplineId: 'dana' })
    expect(plan.kind).toBe('refuse')
    if (plan.kind === 'refuse') {
      expect(plan.note).toContain('commission upline has changed')
    }
  })

  it('leaves the commission upline alone when the move never wrote it', () => {
    // The mirror was skipped, so the move changed one line. So does the undo —
    // restoring a commission upline the move did not set would be a NEW money
    // decision wearing an undo button's clothes.
    const plan = undoPlan(
      { ...moved, mirrored: false },
      { ...untouched, commUplineId: 'zoe' },
    )
    expect(plan).toMatchObject({ kind: 'restore', reportsTo: 'ben', commission: 'leave' })
    if (plan.kind === 'restore') expect(plan.note).toContain('not part of that move')
  })

  it('says nothing about commission for somebody who holds no position', () => {
    const plan = undoPlan(
      { ...moved, mirrored: false, commUplineId: null },
      { reportsTo: 'cara', hasPosition: false, commUplineId: null },
    )
    expect(plan).toMatchObject({ kind: 'restore', commission: 'leave', note: null })
  })

  it('restores the reporting line alone when the position has since been closed', () => {
    // Half is honest here and refusing is not: the reporting line is undoable,
    // and withholding it would leave the reader with neither half and no reason.
    const plan = undoPlan(moved, { reportsTo: 'cara', hasPosition: false, commUplineId: null })
    expect(plan).toMatchObject({ kind: 'restore', reportsTo: 'ben', commission: 'leave' })
    if (plan.kind === 'restore') {
      expect(plan.note).toContain('no longer holds a commission position')
      expect(plan.note).toContain('Revenue chart')
    }
  })

  it('checks the reporting line before the commission one', () => {
    // Both moved. The sentence has to name the reporting line, because that is
    // the half the button claims to put back and the reason it will not.
    const plan = undoPlan(moved, { reportsTo: 'dana', hasPosition: true, commUplineId: 'dana' })
    expect(plan.kind).toBe('refuse')
    if (plan.kind === 'refuse') expect(plan.note).toContain('moved again')
  })

  it('undoes a detach back onto the manager they were taken off', () => {
    const plan = undoPlan(
      { ...moved, movedTo: null, reportsTo: 'ben', commUplineId: 'ben' },
      { reportsTo: null, hasPosition: true, commUplineId: null },
    )
    expect(plan).toEqual({
      kind: 'restore',
      reportsTo: 'ben',
      commission: 'restore',
      commUplineId: 'ben',
      note: null,
    })
  })

  it('names the person in every refusal', () => {
    // A refusal on a chart of forty cards is useless without the name — the
    // reader has already stopped looking at the card they pressed.
    for (const now of [
      { reportsTo: 'dana', hasPosition: true, commUplineId: 'dana' },
      { reportsTo: 'cara', hasPosition: true, commUplineId: 'dana' },
    ]) {
      const plan = undoPlan(moved, now)
      expect(plan.kind).toBe('refuse')
      if (plan.kind === 'refuse') expect(plan.note).toContain('Ali')
    }
  })
})

import { describe, expect, it } from 'vitest'
import { mirrorDecision, mirrorFailed, MIRRORED_NOTHING, type MirrorContext } from './hierarchy-mirror'

const SALES = new Set(['alice', 'bob', 'carol'])

function ctx(over: Partial<MirrorContext> = {}): MirrorContext {
  return {
    staffId: 'alice',
    targetId: 'bob',
    onCommission: SALES,
    mayWriteOther: true,
    otherName: 'commission upline',
    ...over,
  }
}

describe('mirrorDecision', () => {
  it('mirrors a move between two salespeople when the actor may write the other table', () => {
    expect(mirrorDecision(ctx())).toEqual({ kind: 'mirror' })
  })

  it('refuses to mirror a detach, and says so', () => {
    // The two trees hold different people. Alice can top the commission tree
    // and still report to a manager who earns no override; copying the null
    // across would delete that manager on the strength of an absence somewhere
    // else. Refused — but loudly, because the reader may well have meant both.
    const d = mirrorDecision(ctx({ targetId: null }))
    expect(d.kind).toBe('skip')
    if (d.kind !== 'skip') throw new Error('unreachable')
    expect(d.note).toContain('commission upline')
    expect(d.note).toContain('one chart')
  })

  it('names the other side in the detach note too', () => {
    const d = mirrorDecision(ctx({ targetId: null, otherName: 'reporting line' }))
    if (d.kind !== 'skip') throw new Error('expected a skip')
    expect(d.note).toContain('reporting line')
  })

  it('says nothing about a detach for somebody not on commission', () => {
    // Membership still comes first: no position, no second line, no message.
    expect(mirrorDecision(ctx({ staffId: 'dave', targetId: null }))).toEqual({ kind: 'noop' })
  })

  it('is a no-op when the person moved is not on commission', () => {
    expect(mirrorDecision(ctx({ staffId: 'dave' }))).toEqual({ kind: 'noop' })
  })

  it('refuses, and SAYS SO, when the new manager is not on commission', () => {
    // The override engine has no position for them, so the upline would point
    // at somebody it cannot compute a differential against — it must not be
    // written. But this returned a silent `noop` until 2026-09-07, which is
    // indistinguishable from a mirror that ran: YH moved a salesperson under a
    // manager who earns no override, got a clean save, and found the
    // commission chart still showing the old upline with nothing to explain it.
    const d = mirrorDecision(ctx({ targetId: 'dave' }))
    expect(d.kind).toBe('skip')
    if (d.kind !== 'skip') throw new Error('expected a skip')
    expect(d.note).toContain('no commission position')
  })

  it('checks commission membership BEFORE permission, so a non-salesperson never raises a false alarm', () => {
    // A Finance manager reorganising Finance holds no `revenue` permission and
    // should not be told that a mirror was skipped for somebody who has no
    // commission position to mirror in the first place.
    expect(mirrorDecision(ctx({ staffId: 'dave', mayWriteOther: false }))).toEqual({ kind: 'noop' })

    // The TARGET being off the ladder is reported — but as the reason it
    // actually is, not as a permission problem the reader cannot act on.
    const d = mirrorDecision(ctx({ targetId: 'dave', mayWriteOther: false }))
    expect(d.kind).toBe('skip')
    if (d.kind !== 'skip') throw new Error('expected a skip')
    expect(d.note).toContain('no commission position')
    expect(d.note).not.toContain('permission')
  })

  it('skips, loudly, when both are on commission but the actor may not write the other table', () => {
    const d = mirrorDecision(ctx({ mayWriteOther: false }))
    expect(d.kind).toBe('skip')
    if (d.kind !== 'skip') throw new Error('unreachable')
    expect(d.note).toContain('commission upline')
  })

  it('names the other side in the skip note, so one message serves both directions', () => {
    const d = mirrorDecision(ctx({ mayWriteOther: false, otherName: 'reporting line' }))
    if (d.kind !== 'skip') throw new Error('expected a skip')
    expect(d.note).toContain('reporting line')
    expect(d.note).not.toContain('commission')
  })

  it('does not mirror somebody onto themselves being their own target', () => {
    // Guarded upstream in both actions, but the decision must not claim a
    // self-move is worth mirroring either.
    const d = mirrorDecision(ctx({ staffId: 'alice', targetId: 'alice' }))
    expect(d).toEqual({ kind: 'mirror' })
    // ^ the decision is about MEMBERSHIP, not legality: `alice` is on
    // commission both times. Legality is the action's job, and it refuses a
    // self-move before it ever asks this question.
  })
})

describe('mirrorDecision — the enrol offer', () => {
  it('offers to put the new manager on the ladder, naming who and where to call it with', () => {
    // The refusal on its own sent the reader off to find a page under another
    // permission. The offer is the same refusal with the way out attached.
    const d = mirrorDecision(ctx({ targetId: 'dave', targetName: 'Lucas' }))
    if (d.kind !== 'skip') throw new Error('expected a skip')
    expect(d.offer).toEqual({ kind: 'enrol', staffId: 'dave', staffName: 'Lucas' })
  })

  it('says the manager by name, and still says why nothing happened', () => {
    const d = mirrorDecision(ctx({ targetId: 'dave', targetName: 'Lucas' }))
    if (d.kind !== 'skip') throw new Error('expected a skip')
    expect(d.note).toContain('Lucas')
    expect(d.note).toContain('no commission position')
    // And it promises the move follows — the trap is that enrolling alone
    // leaves the commission line where it was.
    expect(d.note).toContain('follow')
    // Never a column name: this is read by people who do not know the schema.
    expect(d.note).not.toContain('upline_staff_id')
    expect(d.note).not.toContain('comm_hierarchy')
  })

  it('makes NO offer when the actor cannot write the other table, and keeps the old sentence', () => {
    // An offer somebody cannot accept is worse than no offer: it is a button
    // that redirects them to the dashboard. Without the permission the note is
    // exactly the one that shipped before offers existed.
    const d = mirrorDecision(ctx({ targetId: 'dave', targetName: 'Lucas', mayWriteOther: false }))
    if (d.kind !== 'skip') throw new Error('expected a skip')
    expect(d.offer).toBeUndefined()
    expect(d.note).toBe(
      'Their commission upline was left as it was — that manager holds no commission position, so there is nobody there to earn an override.',
    )
  })

  it('makes no offer it cannot name', () => {
    // The Revenue direction never learns a reporting-line name and never needs
    // this branch. It gets the unnamed sentence rather than a half-written one.
    const d = mirrorDecision(ctx({ targetId: 'dave' }))
    if (d.kind !== 'skip') throw new Error('expected a skip')
    expect(d.offer).toBeUndefined()
  })

  it('offers nothing at all when the person moved is not on commission', () => {
    // Membership beats everything, offers included: there is no second line to
    // move, so there is nothing to be offered a way out of.
    expect(
      mirrorDecision(ctx({ staffId: 'dave', targetId: 'erin', targetName: 'Lucas' })),
    ).toEqual({ kind: 'noop' })
  })
})

describe('mirrorDecision — the detach offer', () => {
  it('offers to clear the manager the mover still sits under on the other chart', () => {
    const d = mirrorDecision(
      ctx({ targetId: null, currentOtherUpline: { id: 'bob', name: 'Stanley' } }),
    )
    if (d.kind !== 'skip') throw new Error('expected a skip')
    expect(d.offer).toEqual({ kind: 'detach', uplineId: 'bob', uplineName: 'Stanley' })
  })

  it('names that manager in the note, and still refuses to do it unasked', () => {
    // B7: an absence on one chart is not evidence about the other. The button
    // the reader presses is the evidence, so the sentence has to ask.
    const d = mirrorDecision(
      ctx({ targetId: null, currentOtherUpline: { id: 'bob', name: 'Stanley' } }),
    )
    if (d.kind !== 'skip') throw new Error('expected a skip')
    expect(d.note).toContain('Stanley')
    expect(d.note).toContain('one chart')
    expect(d.note).toContain('if you meant')
  })

  it('offers nothing when the mover has no commission upline to clear', () => {
    // Already at the top of the other tree. There is no relationship left to
    // offer to delete, and a button that would do nothing is worse than none.
    const d = mirrorDecision(ctx({ targetId: null, currentOtherUpline: null }))
    if (d.kind !== 'skip') throw new Error('expected a skip')
    expect(d.offer).toBeUndefined()
    expect(d.note).toBe(
      'Their commission upline was left as it was — taking somebody off one chart does not take them off the other.',
    )
  })

  it('offers nothing when the actor cannot write the other table', () => {
    const d = mirrorDecision(
      ctx({
        targetId: null,
        mayWriteOther: false,
        currentOtherUpline: { id: 'bob', name: 'Stanley' },
      }),
    )
    if (d.kind !== 'skip') throw new Error('expected a skip')
    expect(d.offer).toBeUndefined()
    expect(d.note).not.toContain('Stanley')
  })

  it('serves the other direction with the same sentence', () => {
    const d = mirrorDecision(
      ctx({
        targetId: null,
        otherName: 'reporting line',
        currentOtherUpline: { id: 'bob', name: 'Stanley' },
      }),
    )
    if (d.kind !== 'skip') throw new Error('expected a skip')
    expect(d.note).toContain('reporting line')
    expect(d.offer).toEqual({ kind: 'detach', uplineId: 'bob', uplineName: 'Stanley' })
  })

  it('stays silent for a detach by somebody not on commission, offer or no offer', () => {
    expect(
      mirrorDecision(
        ctx({ staffId: 'dave', targetId: null, currentOtherUpline: { id: 'bob', name: 'Stanley' } }),
      ),
    ).toEqual({ kind: 'noop' })
  })
})

describe('MIRRORED_NOTHING', () => {
  it('reports nothing written and nothing to say', () => {
    expect(MIRRORED_NOTHING).toEqual({ mirrored: false, note: null })
  })

  it('carries no offer — there was no refusal to offer a way out of', () => {
    expect(MIRRORED_NOTHING.offer).toBeUndefined()
  })
})

describe('mirrorFailed', () => {
  it('says the primary move DID happen, so the message cannot be read as a total failure', () => {
    const out = mirrorFailed('commission upline', 'that upline has no active position')
    expect(out.mirrored).toBe(false)
    expect(out.note).toMatch(/^Moved, but/)
    expect(out.note).toContain('that upline has no active position')
  })

  it('offers nothing: a write that threw is not a thing the reader can one-click away', () => {
    expect(mirrorFailed('reporting line', 'the database refused it').offer).toBeUndefined()
  })
})

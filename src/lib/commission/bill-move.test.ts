import { describe, expect, it } from 'vitest'
import { billMoveAction, movedNote, movedPhrase, moveMessage, moveProblem, type BillMoveResult } from './bill-move'

// 2026-10-12 — the user: "together with rightclick … can select move this
// order to other sales person".

const ADRIAN = { staffId: 'adrian', name: 'ADRIAN' }
const ctx = { runLocked: false, closedReason: null, monthLabel: 'September 2026' }

describe('billMoveAction', () => {
  it('offers the move on a bill of an open month', () => {
    expect(billMoveAction({ owner: ADRIAN }, ctx)).toEqual({ kind: 'move', owner: ADRIAN, named: null })
  })
  it('says whom the ERP names on a bill already moved', () => {
    expect(billMoveAction({ owner: { staffId: 'anthony', name: 'ANTHONY' }, named: ADRIAN }, ctx))
      .toMatchObject({ kind: 'move', named: ADRIAN })
  })
  it('offers nothing on an upsell or a drop — no bill to move', () => {
    expect(billMoveAction({ owner: ADRIAN, upsale: true }, ctx)).toBeNull()
  })
  it('shuts the row with its reason: not counted, a paid month, somebody closed', () => {
    expect(billMoveAction({ owner: ADRIAN, cancelled: true }, ctx))
      .toMatchObject({ kind: 'locked', reason: 'It does not count this month — count it again before moving it' })
    expect(billMoveAction({ owner: ADRIAN }, { ...ctx, runLocked: true }))
      .toMatchObject({ kind: 'locked', reason: 'The run for September 2026 has paid — reopen it before moving its bills' })
    expect(billMoveAction({ owner: ADRIAN }, { ...ctx, closedReason: 'ADRIAN’s September 2026 is closed' }))
      .toMatchObject({ kind: 'locked', reason: 'ADRIAN’s September 2026 is closed' })
  })
})

describe('moveProblem', () => {
  it('asks for somebody, and somebody else', () => {
    expect(moveProblem(ADRIAN, '')).toBe('Choose who it goes to.')
    expect(moveProblem(ADRIAN, 'adrian')).toBe('It is ADRIAN’s already.')
    expect(moveProblem(ADRIAN, 'anthony')).toBeNull()
  })
})

describe('moveMessage', () => {
  const result: BillMoveResult = {
    orderId: 'o', orderNo: 'HC-SO-2609-070', changed: true,
    to: { staffId: 'anthony', name: 'ANTHONY' }, from: ADRIAN, movedBack: false,
    shareTaken: null, shareBack: null, shareNotBack: null,
  }
  it('says whose it is now and whose it was', () => {
    expect(moveMessage(result)).toBe('HC-SO-2609-070 is ANTHONY’s now — moved from ADRIAN.')
  })
  it('says what became of a part', () => {
    expect(moveMessage({ ...result, shareTaken: 0.5 }))
      .toBe('HC-SO-2609-070 is ANTHONY’s now — moved from ADRIAN. ANTHONY held 50% of it; all of it is theirs now.')
  })
  it('says a move back hands it to the ERP’s salesperson', () => {
    expect(moveMessage({ ...result, to: ADRIAN, from: { staffId: 'anthony', name: 'ANTHONY' }, movedBack: true }))
      .toBe('HC-SO-2609-070 is back with ADRIAN, the salesperson the ERP names.')
  })
  it('says nothing moved when nothing did', () => {
    expect(moveMessage({ ...result, changed: false })).toBe('HC-SO-2609-070 is ANTHONY’s already — nothing moved.')
  })
  // 20261012190000: the part a move took is theirs again when the bill leaves them.
  it('says the part a move took is back — an undo is an undo', () => {
    expect(moveMessage({ ...result, to: ADRIAN, from: { staffId: 'anthony', name: 'ANTHONY' }, movedBack: true, shareBack: 0.5 }))
      .toBe('HC-SO-2609-070 is back with ADRIAN, the salesperson the ERP names. ANTHONY’s 50% share is back.')
  })
  it('says when that part could not come back, and why', () => {
    expect(moveMessage({ ...result, to: ADRIAN, from: { staffId: 'anthony', name: 'ANTHONY' }, movedBack: true, shareNotBack: 0.5 }))
      .toBe('HC-SO-2609-070 is back with ADRIAN, the salesperson the ERP names. ANTHONY’s 50% share did not come back — with the shares held now it would leave ADRIAN nothing. Share it again if it should be.')
    expect(moveMessage({ ...result, to: { staffId: null, name: 'nobody' }, from: { staffId: 'anthony', name: 'ANTHONY' }, movedBack: true, shareNotBack: 0.4 }))
      .toBe('HC-SO-2609-070 has no salesperson again — the ERP names nobody matched yet. ANTHONY’s 40% share did not come back — nobody holds the bill to share it with.')
  })
})

describe('movedNote', () => {
  it('names whom it came from, or that it came to somebody', () => {
    expect(movedNote({ fromStaffId: 'adrian', fromName: 'ADRIAN', movedByName: 'HR', movedAt: '2026-10-12T08:00:00Z', note: null }))
      .toBe('Moved from ADRIAN')
    expect(movedNote({ fromStaffId: null, fromName: null, movedByName: 'HR', movedAt: '2026-10-12T08:00:00Z', note: null }))
      .toBe('Moved here')
  })
})

describe('movedPhrase', () => {
  // The bill's page says it mid-sentence; lower-casing movedNote wrote "adrian".
  it('keeps the name as it is written', () => {
    expect(movedPhrase({ fromStaffId: 'adrian', fromName: 'ADRIAN', movedByName: 'HR', movedAt: '2026-10-12T08:00:00Z', note: null }))
      .toBe('moved from ADRIAN')
    expect(movedPhrase({ fromStaffId: null, fromName: null, movedByName: 'HR', movedAt: '2026-10-12T08:00:00Z', note: null }))
      .toBe('moved here')
  })
})

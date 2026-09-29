import { describe, expect, it } from 'vitest'
import {
  billShareAction, defaultPartFor, holdersLine, holdersOf, ownerKeeps, parsePart, partsAfter,
  shareOutcomeMessage, shareProblem, sharePct, type BillShareResult,
} from './bill-share'

const ADRIAN = { staffId: 'adrian', name: 'ADRIAN' }
const ANTHONY = { staffId: 'anthony', name: 'ANTHONY' }
const LUCAS = { staffId: 'lucas', name: 'LUCAS' }

describe('holdersOf', () => {
  it('puts the owner first with what nobody else holds, then the others A→Z', () => {
    expect(holdersOf(ADRIAN, [{ ...LUCAS, pct: 0.25 }, { ...ANTHONY, pct: 0.25 }])).toEqual([
      { ...ADRIAN, pct: 0.5 }, { ...ANTHONY, pct: 0.25 }, { ...LUCAS, pct: 0.25 },
    ])
    expect(holdersOf(ADRIAN, [])).toEqual([{ ...ADRIAN, pct: 1 }])
  })

  it('drops a share naming the owner, the way the split does', () => {
    expect(holdersOf(ADRIAN, [{ ...ADRIAN, pct: 0.5 }])).toEqual([{ ...ADRIAN, pct: 1 }])
  })
})

describe('the words', () => {
  it('names each holder and their part', () => {
    expect(sharePct(0.5)).toBe('50%')
    expect(sharePct(1 / 3)).toBe('33.3%')
    expect(holdersLine(holdersOf(ADRIAN, [{ ...ANTHONY, pct: 0.5 }]))).toBe('ADRIAN 50% · ANTHONY 50%')
  })
})

describe('billShareAction', () => {
  const parts = holdersOf(ADRIAN, [])
  it('offers the share while the month and everybody on the bill are open', () => {
    expect(billShareAction({ ownerStaffId: 'adrian', ownerName: 'ADRIAN', parts }, { runLocked: false, closedReason: null, monthLabel: 'September 2026' }))
      .toMatchObject({ kind: 'share', ownerStaffId: 'adrian' })
  })

  it('says why not once the run has paid, or somebody on the bill is closed', () => {
    expect(billShareAction({ ownerStaffId: 'adrian', ownerName: 'ADRIAN', parts }, { runLocked: true, closedReason: null, monthLabel: 'September 2026' }))
      .toMatchObject({ kind: 'locked', reason: 'The run for September 2026 has paid — reopen it before changing who shares this bill' })
    expect(billShareAction({ ownerStaffId: 'adrian', ownerName: 'ADRIAN', parts }, { runLocked: false, closedReason: 'ADRIAN’s September 2026 is closed', monthLabel: 'September 2026' }))
      .toMatchObject({ kind: 'locked', reason: 'ADRIAN’s September 2026 is closed' })
  })
})

describe('the form', () => {
  const shared = holdersOf(ADRIAN, [{ ...ANTHONY, pct: 0.5 }])

  it('starts at 50/50, at an existing holder’s own part, or at half of what the owner still keeps', () => {
    expect(defaultPartFor(holdersOf(ADRIAN, []), 'adrian', 'anthony')).toBe(50)
    expect(defaultPartFor(shared, 'adrian', 'anthony')).toBe(50)
    expect(defaultPartFor(shared, 'adrian', 'lucas')).toBe(25)
    expect(defaultPartFor(holdersOf(ADRIAN, [{ ...ANTHONY, pct: 0.3 }]), 'adrian', 'anthony')).toBe(30)
  })

  it('reads the percent typed', () => {
    expect(parsePart('50')).toBe(0.5)
    expect(parsePart('33.33')).toBe(0.3333)
    expect(parsePart('')).toBeNull()
    expect(parsePart('half')).toBeNull()
  })

  it('never leaves the owner nothing, counting only the OTHER holders when a part is changed', () => {
    expect(ownerKeeps(shared, 'adrian', 'lucas', 0.25)).toBeCloseTo(0.25)
    expect(ownerKeeps(shared, 'adrian', 'anthony', 0.7)).toBeCloseTo(0.3)
    expect(shareProblem(shared, ADRIAN, 'lucas', 0.5)).toBe('That leaves ADRIAN nothing — the owner always keeps a part.')
    expect(shareProblem(shared, ADRIAN, 'anthony', 0.7)).toBeNull()
  })

  it('asks who, refuses the owner, and keeps the part between 0% and 100%', () => {
    expect(shareProblem(shared, ADRIAN, '', 0.5)).toBe('Pick who to share it with.')
    expect(shareProblem(shared, ADRIAN, 'adrian', 0.5)).toBe('It is ADRIAN’s bill already.')
    expect(shareProblem(shared, ADRIAN, 'lucas', 0)).toBe('Their part is more than 0% and less than 100%.')
    expect(shareProblem(shared, ADRIAN, 'lucas', null)).toBe('Their part is more than 0% and less than 100%.')
    expect(shareProblem(shared, ADRIAN, 'lucas', 1)).toBe('Their part is more than 0% and less than 100%.')
  })

  it('shows what Save would leave', () => {
    expect(holdersLine(partsAfter(holdersOf(ADRIAN, []), ADRIAN, ANTHONY, 0.5))).toBe('ADRIAN 50% · ANTHONY 50%')
    expect(holdersLine(partsAfter(shared, ADRIAN, ANTHONY, 0.3))).toBe('ADRIAN 70% · ANTHONY 30%')
    expect(holdersLine(partsAfter(shared, ADRIAN, LUCAS, 0.2))).toBe('ADRIAN 30% · ANTHONY 50% · LUCAS 20%')
  })
})

describe('shareOutcomeMessage', () => {
  const result = (over: Partial<BillShareResult>): BillShareResult => ({
    orderId: 'o1', orderNo: 'HC-SO-013238', changed: true, staffId: 'anthony', name: 'ANTHONY',
    before: null, after: 0.5, parts: holdersOf(ADRIAN, [{ ...ANTHONY, pct: 0.5 }]), ...over,
  })

  it('says who holds the bill now', () => {
    expect(shareOutcomeMessage(result({}))).toBe('HC-SO-013238 is shared: ADRIAN 50% · ANTHONY 50%. Each part is paid at its holder’s own rate.')
  })

  it('says when a holder lets go, and who is left', () => {
    expect(shareOutcomeMessage(result({ before: 0.5, after: null, parts: holdersOf(ADRIAN, []) })))
      .toBe('HC-SO-013238 is no longer shared with ANTHONY — ADRIAN holds all of it again.')
    expect(shareOutcomeMessage(result({ before: 0.25, after: null, parts: holdersOf(ADRIAN, [{ ...LUCAS, pct: 0.25 }]) })))
      .toBe('HC-SO-013238 is no longer shared with ANTHONY: ADRIAN 75% · LUCAS 25%.')
  })

  it('says so when nothing changed', () => {
    expect(shareOutcomeMessage(result({ changed: false, before: 0.5 }))).toBe('ANTHONY already holds 50% of HC-SO-013238 — nothing changed.')
  })
})

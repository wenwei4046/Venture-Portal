import { describe, expect, it } from 'vitest'
import { EditError } from './edits'
import { cleanGwpChanges, gwpChangesOf, gwpDraftChanged, type GwpDraft, type GwpSaved } from './gwp-edits'

const saved: GwpSaved = { buy: ['eco-q', 'eco-k'], gift: ['mf'], perUnit: 2 }
const draft = (over: Partial<GwpDraft> = {}): GwpDraft => ({ buy: ['eco-q', 'eco-k'], gift: ['mf'], perUnit: '2', ...over })
const codes: Record<string, string> = { 'eco-q': 'ECOBLISS (Q)', mf: 'MF PILLOW' }

const refusal = (fn: () => unknown): string | null => {
  try {
    fn()
  } catch (e) {
    expect(e).toBeInstanceOf(EditError)
    return (e as Error).message
  }
  return null
}

describe('gwpChangesOf — Product List › GWP Save', () => {
  it('sends everything for a new GWP', () => {
    expect(gwpChangesOf(null, draft())).toEqual({ qty: 2, buy: ['eco-q', 'eco-k'], gift: ['mf'] })
  })

  it('sends only what changed on one saved', () => {
    expect(gwpChangesOf(saved, draft({ perUnit: '3' }))).toEqual({ qty: 3 })
    // A set in another order is the same set.
    expect(gwpChangesOf(saved, draft({ buy: ['eco-k', 'eco-q'], gift: ['mf', 'latex'] }))).toEqual({ gift: ['mf', 'latex'] })
    expect(gwpChangesOf(saved, draft({ buy: ['eco-q'] }))).toEqual({ buy: ['eco-q'] })
  })

  it("refuses what the database would, in the page's words", () => {
    const refuse = (d: GwpDraft, s: GwpSaved | null = null) => refusal(() => gwpChangesOf(s, d, id => codes[id] ?? id))
    expect(refuse(draft({ buy: [] }))).toBe('Pick the SKUs bought')
    expect(refuse(draft({ gift: [] }))).toBe('Pick the gifts')
    expect(refuse(draft({ gift: ['mf', 'eco-q'] }))).toBe('ECOBLISS (Q) is both bought and given')
    for (const perUnit of ['0', '101', '1.5', '', 'two']) {
      expect(refuse(draft({ perUnit }))).toBe('Free a unit is a whole number from 1 to 100')
    }
    expect(refuse(draft(), saved)).toBe('Nothing to save')
  })
})

describe('cleanGwpChanges — what the server takes from the page', () => {
  it('keeps the right shapes', () => {
    expect(cleanGwpChanges({ qty: 2, buy: ['a', 'a', 'b'], gift: ['c'] }, true)).toEqual({ qty: 2, buy: ['a', 'b'], gift: ['c'] })
    expect(cleanGwpChanges({ gift: ['c'] }, false)).toEqual({ gift: ['c'] })
  })

  it('refuses the rest', () => {
    expect(refusal(() => cleanGwpChanges(null, false))).toBe('Nothing to save')
    expect(refusal(() => cleanGwpChanges({}, false))).toBe('Nothing to save')
    expect(refusal(() => cleanGwpChanges({ qty: 0 }, false))).toBe('Free a unit is a whole number from 1 to 100')
    expect(refusal(() => cleanGwpChanges({ buy: 'a' }, false))).toBe('Bought is a list of SKUs')
    expect(refusal(() => cleanGwpChanges({ gift: [''] }, false))).toBe('Gifts is a list of SKUs')
    expect(refusal(() => cleanGwpChanges({ qty: 2, buy: ['a'] }, true))).toBe('A new GWP needs what is bought, the gifts and how many a unit')
  })
})

describe('gwpDraftChanged — the unsaved dot', () => {
  it('reads a new GWP as changed once anything is picked or typed', () => {
    expect(gwpDraftChanged(null, { buy: [], gift: [], perUnit: '' })).toBe(false)
    expect(gwpDraftChanged(null, { buy: ['eco-q'], gift: [], perUnit: '' })).toBe(true)
  })

  it('reads one saved as changed only when it differs', () => {
    expect(gwpDraftChanged(saved, draft())).toBe(false)
    expect(gwpDraftChanged(saved, draft({ buy: ['eco-k', 'eco-q'] }))).toBe(false)
    expect(gwpDraftChanged(saved, draft({ perUnit: '3' }))).toBe(true)
  })
})
